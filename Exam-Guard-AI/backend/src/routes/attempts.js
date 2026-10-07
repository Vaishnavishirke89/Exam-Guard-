import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { summarizeAttempt, analyzeText, similarityPercent } from '../services/analysis.js';
import { asyncRoute, HttpError, parseJson } from '../utils/http.js';

const router = Router();
router.use(authenticate);

async function getAttempt(attemptId) {
  const [rows] = await pool.execute(`SELECT a.*, e.title AS exam_title,e.subject,e.duration_minutes,e.total_marks,
      e.teacher_id,u.name AS student_name,u.email AS student_email,p.roll_number AS student_roll_number,
      p.course AS student_course,p.year_of_study AS student_year_of_study
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN users u ON u.id=a.student_id
    LEFT JOIN student_profiles p ON p.user_id=u.id WHERE a.id=?`, [attemptId]);
  return rows[0];
}

async function ensureAttemptAccess(attemptId, user) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) throw new HttpError(404, 'Attempt not found.');
  if (user.role === 'STUDENT' && attempt.student_id !== user.id) throw new HttpError(403, 'This is not your attempt.');
  if (user.role === 'TEACHER' && attempt.teacher_id !== user.id) throw new HttpError(403, 'You do not own this exam.');
  return attempt;
}

router.get('/mine', allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(`SELECT a.id,a.status,a.started_at,a.submitted_at,e.id AS exam_id,e.title AS exam_title,e.subject,
      e.duration_minutes,COALESCE(s.suspicion_score,0) AS suspicion_score
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id LEFT JOIN suspicion_scores s ON s.attempt_id=a.id
    WHERE a.student_id=? ORDER BY a.started_at DESC`, [req.user.id]);
  res.json({ success: true, data: rows });
}));

router.post('/', allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const examId = Number(req.body.exam_id);
  const [[profile]] = await pool.execute('SELECT user_id FROM student_profiles WHERE user_id=?', [req.user.id]);
  if (!profile) throw new HttpError(400, 'Complete your student details before starting an exam.');
  const [exams] = await pool.execute(`SELECT e.* FROM exams e WHERE e.id=? AND e.status='PUBLISHED'
    AND (e.starts_at IS NULL OR e.starts_at <= UTC_TIMESTAMP()) AND (e.ends_at IS NULL OR e.ends_at >= UTC_TIMESTAMP())`, [examId]);
  if (!exams.length) throw new HttpError(404, 'This exam is not available right now.');
  const [[questionCount]] = await pool.execute('SELECT COUNT(*) AS count FROM questions WHERE exam_id=?', [examId]);
  if (!questionCount.count) throw new HttpError(400, 'This exam has no questions yet.');
  const [existing] = await pool.execute('SELECT id,status FROM exam_attempts WHERE exam_id=? AND student_id=?', [examId, req.user.id]);
  if (existing.length) {
    if (existing[0].status !== 'IN_PROGRESS') throw new HttpError(409, 'You have already submitted this exam.');
    return res.json({ success: true, data: { id: existing[0].id, resumed: true } });
  }
  const [result] = await pool.execute('INSERT INTO exam_attempts (exam_id,student_id) VALUES (?,?)', [examId, req.user.id]);
  await pool.execute(`INSERT INTO monitoring_events (attempt_id,event_type,description,severity,details_json)
    VALUES (?,'EXAM_STARTED','Exam attempt started','LOW',JSON_OBJECT())`, [result.insertId]);
  res.status(201).json({ success: true, data: { id: result.insertId, resumed: false } });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const attempt = await ensureAttemptAccess(req.params.id, req.user);
  const [answers] = await pool.execute(`SELECT q.id AS question_id,q.question_text,q.question_type,q.options_json,q.marks,q.position,
      a.id AS answer_id,a.answer_text,a.metrics_json
    FROM questions q LEFT JOIN answers a ON a.question_id=q.id AND a.attempt_id=?
    WHERE q.exam_id=? ORDER BY q.position,q.id`, [attempt.id, attempt.exam_id]);
  const [events] = await pool.execute('SELECT id,question_id,event_type,description,severity,details_json,created_at FROM monitoring_events WHERE attempt_id=? ORDER BY created_at,id', [attempt.id]);
  const [scores] = await pool.execute('SELECT suspicion_score,ai_likelihood,similarity_score,reasons_json FROM suspicion_scores WHERE attempt_id=?', [attempt.id]);
  res.json({ success: true, data: {
    attempt: { id: attempt.id, exam_id: attempt.exam_id, exam_title: attempt.exam_title, subject: attempt.subject, duration_minutes: attempt.duration_minutes, total_marks: attempt.total_marks, student_name: attempt.student_name, student_email: attempt.student_email, student_roll_number: attempt.student_roll_number, student_course: attempt.student_course, student_year_of_study: attempt.student_year_of_study, status: attempt.status, started_at: attempt.started_at, submitted_at: attempt.submitted_at },
    answers: answers.map((answer) => ({ ...answer, options_json: parseJson(answer.options_json, []), metrics_json: parseJson(answer.metrics_json, {}) })),
    events: events.map((event) => ({ ...event, details: parseJson(event.details_json, {}) })),
    score: scores.length ? { ...scores[0], reasons: parseJson(scores[0].reasons_json, []) } : null
  } });
}));

router.put('/:id/answers/:questionId', allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const attempt = await ensureAttemptAccess(req.params.id, req.user);
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError(400, 'This exam has already been submitted.');
  const expiresAt = new Date(String(attempt.started_at).replace(' ', 'T') + 'Z').getTime() + Number(attempt.duration_minutes) * 60000;
  if (Date.now() > expiresAt) throw new HttpError(400, 'Exam time has expired. Submit the exam to save your final answers.');
  const questionId = Number(req.params.questionId);
  const [[question]] = await pool.execute('SELECT id FROM questions WHERE id=? AND exam_id=?', [questionId, attempt.exam_id]);
  if (!question) throw new HttpError(404, 'Question not found in this exam.');
  const answer = String(req.body.answer_text || '');
  if (answer.length > 50000) throw new HttpError(400, 'Answer is too long.');
  const metrics = req.body.metrics && typeof req.body.metrics === 'object' ? req.body.metrics : {};
  await pool.execute(`INSERT INTO answers (attempt_id,question_id,answer_text,metrics_json) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE answer_text=VALUES(answer_text),metrics_json=VALUES(metrics_json)`, [attempt.id, questionId, answer, JSON.stringify(metrics)]);
  res.json({ success: true, message: 'Answer saved.' });
}));

const allowedEvents = new Set(['PASTE_DETECTED','LARGE_TEXT_INSERTION','TAB_SWITCH','TAB_RETURN','WINDOW_BLUR','HIGH_TYPING_SPEED','LONG_PAUSE','EXCESSIVE_BACKSPACE']);
router.post('/:id/events', allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const attempt = await ensureAttemptAccess(req.params.id, req.user);
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError(400, 'Monitoring is closed for this exam.');
  const type = String(req.body.event_type || '').toUpperCase();
  if (!allowedEvents.has(type)) throw new HttpError(400, 'Unsupported monitoring event.');
  let questionId = req.body.question_id ? Number(req.body.question_id) : null;
  if (questionId) {
    const [[question]] = await pool.execute('SELECT id FROM questions WHERE id=? AND exam_id=?', [questionId, attempt.exam_id]);
    if (!question) questionId = null;
  }
  const description = String(req.body.description || eventDescription(type)).slice(0, 500);
  const severity = ['HIGH','MEDIUM','LOW'].includes(String(req.body.severity).toUpperCase()) ? String(req.body.severity).toUpperCase() : 'LOW';
  const details = req.body.details && typeof req.body.details === 'object' ? JSON.stringify(req.body.details).slice(0, 2000) : '{}';
  await pool.execute('INSERT INTO monitoring_events (attempt_id,question_id,event_type,description,severity,details_json) VALUES (?,?,?,?,?,?)', [attempt.id, questionId, type, description, severity, details]);
  res.status(201).json({ success: true, message: 'Monitoring event recorded.' });
}));

router.post('/:id/submit', allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const attempt = await ensureAttemptAccess(req.params.id, req.user);
  if (attempt.status !== 'IN_PROGRESS') {
    const [[score]] = await pool.execute('SELECT suspicion_score,ai_likelihood,similarity_score,reasons_json FROM suspicion_scores WHERE attempt_id=?', [attempt.id]);
    return res.json({ success: true, data: score || null, message: 'Exam was already submitted.' });
  }
  const [answerRows] = await pool.execute(`SELECT a.id,a.question_id,a.answer_text,a.metrics_json FROM answers a
    WHERE a.attempt_id=?`, [attempt.id]);
  const [eventsRaw] = await pool.execute('SELECT event_type,details_json FROM monitoring_events WHERE attempt_id=?', [attempt.id]);
  const events = eventsRaw.map((event) => ({ ...event, details: parseJson(event.details_json, {}) }));

  const [similarRows] = await pool.execute(`SELECT own.question_id,peer.answer_text FROM answers own
    JOIN questions q ON q.id=own.question_id
    JOIN exam_attempts other ON other.exam_id=? AND other.status IN ('SUBMITTED','TIMED_OUT')
    JOIN answers peer ON peer.attempt_id=other.id AND peer.question_id=own.question_id
    WHERE own.attempt_id=? AND other.id<>? AND CHAR_LENGTH(own.answer_text)>0 AND CHAR_LENGTH(peer.answer_text)>0`, [attempt.exam_id, attempt.id, attempt.id]);
  const peerScores = new Map();
  for (const peer of similarRows) peerScores.set(peer.question_id, Math.max(peerScores.get(peer.question_id) || 0, similarityPercent(answerRows.find((answer) => answer.question_id === peer.question_id)?.answer_text || '', peer.answer_text)));
  const summary = summarizeAttempt(events, answerRows);
  summary.similarityScore = Math.max(summary.similarityScore, ...peerScores.values(), 0);
  if (summary.similarityScore >= 70 && !summary.reasons.some((reason) => reason.includes('similarity'))) {
    summary.suspicionScore = Math.min(100, summary.suspicionScore + 15);
    summary.reasons.push(`Answer similarity reached ${summary.similarityScore}% against a prior submission`);
  }
  const answerAnalysis = new Map(summary.aiResults.map((item) => [item.questionId, item]));

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const finalStatus = req.body.timed_out ? 'TIMED_OUT' : 'SUBMITTED';
    await connection.execute('UPDATE exam_attempts SET status=?,submitted_at=UTC_TIMESTAMP() WHERE id=? AND status=\'IN_PROGRESS\'', [finalStatus, attempt.id]);
    await connection.execute("INSERT INTO monitoring_events (attempt_id,event_type,description,severity,details_json) VALUES (?,'EXAM_SUBMITTED',?,'LOW',JSON_OBJECT('timedOut',?))", [attempt.id, req.body.timed_out ? 'Exam auto-submitted when time expired' : 'Exam submitted by student', Boolean(req.body.timed_out)]);
    await connection.execute(`INSERT INTO suspicion_scores (attempt_id,suspicion_score,ai_likelihood,similarity_score,reasons_json)
      VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE suspicion_score=VALUES(suspicion_score),ai_likelihood=VALUES(ai_likelihood),similarity_score=VALUES(similarity_score),reasons_json=VALUES(reasons_json)`,
    [attempt.id, summary.suspicionScore, summary.aiLikelihood, summary.similarityScore, JSON.stringify(summary.reasons)]);
    for (const result of summary.aiResults) {
      if (result.likelihood >= 40) await connection.execute('INSERT INTO monitoring_events (attempt_id,question_id,event_type,description,severity,details_json) VALUES (?,?,?,?,?,?)', [attempt.id, result.questionId, 'AI_LIKELIHOOD', `Heuristic AI likelihood indicator: ${result.likelihood}%`, result.likelihood >= 60 ? 'MEDIUM' : 'LOW', JSON.stringify({ likelihood: result.likelihood, indicators: result.indicators })]);
    }
    if (summary.similarityScore >= 70) await connection.execute('INSERT INTO monitoring_events (attempt_id,event_type,description,severity,details_json) VALUES (?,?,?,?,?)', [attempt.id, 'HIGH_SIMILARITY', `Answer similarity indicator: ${summary.similarityScore}%`, 'MEDIUM', JSON.stringify({ similarity: summary.similarityScore })]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  res.json({ success: true, data: { suspicionScore: summary.suspicionScore, aiLikelihood: summary.aiLikelihood, similarityScore: summary.similarityScore, reasons: summary.reasons, answerAnalysis: [...answerAnalysis.values()] } });
}));

function eventDescription(type) {
  return {
    PASTE_DETECTED: 'Text pasted into an exam answer field', LARGE_TEXT_INSERTION: 'Large text insertion detected in an answer field',
    TAB_SWITCH: 'Student left the exam tab', TAB_RETURN: 'Student returned to the exam tab', WINDOW_BLUR: 'Exam window lost focus',
    HIGH_TYPING_SPEED: 'High typing speed indicator', LONG_PAUSE: 'Long pause while editing an answer', EXCESSIVE_BACKSPACE: 'Frequent deletion while editing an answer'
  }[type];
}

export default router;
