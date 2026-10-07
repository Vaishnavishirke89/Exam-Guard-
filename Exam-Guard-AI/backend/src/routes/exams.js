import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute, HttpError, validId } from '../utils/http.js';

const router = Router();
router.use(authenticate);

function validateExam(body) {
  const title = String(body.title || '').trim();
  const subject = String(body.subject || '').trim();
  const duration = Number(body.duration_minutes);
  const totalMarks = Number(body.total_marks);
  if (!title || title.length > 180 || !subject || subject.length > 120) throw new HttpError(400, 'Enter an exam title and subject.');
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) throw new HttpError(400, 'Duration must be between 1 and 600 minutes.');
  if (!Number.isFinite(totalMarks) || totalMarks < 0 || totalMarks > 100000) throw new HttpError(400, 'Enter valid total marks.');
  const startsAt = body.starts_at || null;
  const endsAt = body.ends_at || null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new HttpError(400, 'End time must be after start time.');
  return { title, subject, duration, totalMarks, description: String(body.description || '').trim(), startsAt, endsAt };
}

async function accessibleExam(examId, user) {
  const [rows] = user.role === 'ADMIN'
    ? await pool.execute('SELECT * FROM exams WHERE id = ?', [examId])
    : await pool.execute('SELECT * FROM exams WHERE id = ? AND teacher_id = ?', [examId, user.id]);
  if (!rows.length) throw new HttpError(404, 'Exam not found.');
  return rows[0];
}

router.get('/', asyncRoute(async (req, res) => {
  if (req.user.role === 'STUDENT') {
    const [rows] = await pool.execute(`SELECT e.*, u.name AS teacher_name,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
      a.id AS attempt_id,a.status AS attempt_status
      FROM exams e JOIN users u ON u.id=e.teacher_id
      LEFT JOIN exam_attempts a ON a.exam_id=e.id AND a.student_id=?
      WHERE e.status='PUBLISHED' AND (e.starts_at IS NULL OR e.starts_at <= UTC_TIMESTAMP()) AND (e.ends_at IS NULL OR e.ends_at >= UTC_TIMESTAMP())
        AND (a.id IS NULL OR a.status='IN_PROGRESS')
      ORDER BY e.starts_at IS NULL, e.starts_at`, [req.user.id]);
    return res.json({ success: true, data: rows });
  }
  if (req.user.role === 'TEACHER') {
    const [rows] = await pool.execute(`SELECT e.*,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
      (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id) AS attempt_count
      FROM exams e WHERE e.teacher_id=? ORDER BY e.created_at DESC`, [req.user.id]);
    return res.json({ success: true, data: rows });
  }
  const [rows] = await pool.execute(`SELECT e.*,u.name AS teacher_name,
    (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
    (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id) AS attempt_count
    FROM exams e JOIN users u ON u.id=e.teacher_id ORDER BY e.created_at DESC`);
  res.json({ success: true, data: rows });
}));

router.post('/', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = validateExam(req.body);
  const [result] = await pool.execute(`INSERT INTO exams (teacher_id,title,description,subject,duration_minutes,total_marks,starts_at,ends_at,status)
    VALUES (?,?,?,?,?,?,?,?, 'DRAFT')`, [req.user.id, exam.title, exam.description, exam.subject, exam.duration, exam.totalMarks, exam.startsAt, exam.endsAt]);
  res.status(201).json({ success: true, data: { id: result.insertId } });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) throw new HttpError(400, 'Invalid exam.');
  const [rows] = await pool.execute('SELECT * FROM exams WHERE id=?', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Exam not found.');
  const exam = rows[0];
  if (req.user.role === 'TEACHER' && exam.teacher_id !== req.user.id) throw new HttpError(403, 'You do not own this exam.');
  if (req.user.role === 'STUDENT' && exam.status !== 'PUBLISHED') throw new HttpError(404, 'Exam is not available.');
  const [questions] = await pool.execute('SELECT id, exam_id, question_text, question_type, options_json, marks, position FROM questions WHERE exam_id=? ORDER BY position,id', [exam.id]);
  res.json({ success: true, data: { ...exam, questions: questions.map((q) => ({ ...q, options_json: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json })) } });
}));

router.patch('/:id', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = await accessibleExam(req.params.id, req.user);
  if (exam.status !== 'DRAFT') throw new HttpError(400, 'Only draft exams can be edited.');
  const values = validateExam(req.body);
  await pool.execute(`UPDATE exams SET title=?,description=?,subject=?,duration_minutes=?,total_marks=?,starts_at=?,ends_at=? WHERE id=?`, [values.title, values.description, values.subject, values.duration, values.totalMarks, values.startsAt, values.endsAt, exam.id]);
  res.json({ success: true, message: 'Exam updated.' });
}));

router.patch('/:id/status', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = await accessibleExam(req.params.id, req.user);
  const status = String(req.body.status || '').toUpperCase();
  if (!['DRAFT', 'PUBLISHED', 'CLOSED'].includes(status)) throw new HttpError(400, 'Choose a valid exam status.');
  if (status === 'DRAFT' && exam.status !== 'DRAFT') {
    const [[attemptCount]] = await pool.execute('SELECT COUNT(*) AS count FROM exam_attempts WHERE exam_id=?', [exam.id]);
    if (attemptCount.count) throw new HttpError(400, 'This exam cannot return to draft after students have started attempts.');
  }
  if (status === 'PUBLISHED') {
    const [[count]] = await pool.execute('SELECT COUNT(*) AS count FROM questions WHERE exam_id=?', [exam.id]);
    if (!count.count) throw new HttpError(400, 'Add at least one question before publishing.');
  }
  await pool.execute('UPDATE exams SET status=? WHERE id=?', [status, exam.id]);
  res.json({ success: true, message: `Exam ${status.toLowerCase()}.` });
}));

router.delete('/:id', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = await accessibleExam(req.params.id, req.user);
  const [[count]] = await pool.execute('SELECT COUNT(*) AS count FROM exam_attempts WHERE exam_id=?', [exam.id]);
  if (count.count) throw new HttpError(400, 'An exam with student attempts cannot be deleted. Close it instead.');
  await pool.execute('DELETE FROM exams WHERE id=?', [exam.id]);
  res.json({ success: true, message: 'Exam deleted.' });
}));

router.get('/:id/questions', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  await accessibleExam(req.params.id, req.user);
  const [questions] = await pool.execute('SELECT * FROM questions WHERE exam_id=? ORDER BY position,id', [req.params.id]);
  res.json({ success: true, data: questions.map((q) => ({ ...q, options_json: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json })) });
}));

router.post('/:id/questions', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = await accessibleExam(req.params.id, req.user);
  if (exam.status !== 'DRAFT') throw new HttpError(400, 'Questions can only be changed while the exam is a draft.');
  const question = validateQuestion(req.body);
  const [result] = await pool.execute(`INSERT INTO questions (exam_id,question_text,question_type,options_json,correct_answer,marks,position)
    VALUES (?,?,?,?,?,?,?)`, [exam.id, question.text, question.type, question.options ? JSON.stringify(question.options) : null, question.correct, question.marks, question.position]);
  res.status(201).json({ success: true, data: { id: result.insertId } });
}));

router.patch('/:id/questions/:questionId', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = await accessibleExam(req.params.id, req.user);
  if (exam.status !== 'DRAFT') throw new HttpError(400, 'Questions can only be changed while the exam is a draft.');
  const question = validateQuestion(req.body);
  const [result] = await pool.execute(`UPDATE questions SET question_text=?,question_type=?,options_json=?,correct_answer=?,marks=?,position=? WHERE id=? AND exam_id=?`, [question.text, question.type, question.options ? JSON.stringify(question.options) : null, question.correct, question.marks, question.position, req.params.questionId, req.params.id]);
  if (!result.affectedRows) throw new HttpError(404, 'Question not found.');
  res.json({ success: true, message: 'Question updated.' });
}));

router.delete('/:id/questions/:questionId', allowRoles('TEACHER','ADMIN'), asyncRoute(async (req, res) => {
  const exam = await accessibleExam(req.params.id, req.user);
  if (exam.status !== 'DRAFT') throw new HttpError(400, 'Questions can only be changed while the exam is a draft.');
  const [result] = await pool.execute('DELETE FROM questions WHERE id=? AND exam_id=?', [req.params.questionId, req.params.id]);
  if (!result.affectedRows) throw new HttpError(404, 'Question not found.');
  res.json({ success: true, message: 'Question deleted.' });
}));

function validateQuestion(body) {
  const text = String(body.question_text || '').trim();
  const type = String(body.question_type || '').toUpperCase();
  const marks = Number(body.marks);
  const position = Math.max(1, Number(body.position) || 1);
  if (!text || text.length > 10000) throw new HttpError(400, 'Question text is required.');
  if (!['MCQ', 'DESCRIPTIVE'].includes(type)) throw new HttpError(400, 'Choose MCQ or descriptive question type.');
  if (!Number.isFinite(marks) || marks <= 0 || marks > 10000) throw new HttpError(400, 'Question marks must be greater than zero.');
  if (type === 'MCQ') {
    const options = Array.isArray(body.options) ? body.options.map((option) => String(option).trim()) : [];
    const correct = String(body.correct_answer || '').trim();
    if (options.length !== 4 || options.some((option) => !option) || !options.includes(correct)) throw new HttpError(400, 'MCQs need four options and a correct answer selected from them.');
    return { text, type, marks, position, options, correct };
  }
  return { text, type, marks, position, options: null, correct: String(body.correct_answer || '').trim() || null };
}

export default router;
