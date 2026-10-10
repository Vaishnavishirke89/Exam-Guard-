import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute, parseJson } from '../utils/http.js';
import { riskLabel } from '../services/analysis.js';

const router = Router();
router.use(authenticate, allowRoles('TEACHER'));

router.get('/dashboard', asyncRoute(async (req, res) => {
  const [[examStats]] = await pool.execute(`SELECT COUNT(*) AS total_exams,
    SUM(status='PUBLISHED') AS published_exams FROM exams WHERE teacher_id=?`, [req.user.id]);
  const [[attemptStats]] = await pool.execute(`SELECT COUNT(*) AS total_attempts,
    SUM(a.status='IN_PROGRESS') AS active_attempts,
    SUM(COALESCE(s.suspicion_score,0)>=60) AS flagged_attempts
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id LEFT JOIN suspicion_scores s ON s.attempt_id=a.id WHERE e.teacher_id=?`, [req.user.id]);
  const [[studentStats]] = await pool.execute(`SELECT COUNT(DISTINCT a.student_id) AS total_students FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE e.teacher_id=?`, [req.user.id]);
  const [attempts] = await pool.execute(`SELECT a.id,a.status,a.started_at,a.submitted_at,u.name AS student_name,u.email AS student_email,
    e.id AS exam_id,e.title AS exam_title,COALESCE(s.suspicion_score,0) AS suspicion_score,
    COALESCE(s.ai_likelihood,0) AS ai_likelihood,COALESCE(s.similarity_score,0) AS similarity_score,
    (SELECT COUNT(*) FROM monitoring_events m WHERE m.attempt_id=a.id) AS event_count
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN users u ON u.id=a.student_id
    LEFT JOIN suspicion_scores s ON s.attempt_id=a.id WHERE e.teacher_id=? ORDER BY a.started_at DESC LIMIT 10`, [req.user.id]);
  res.json({ success: true, data: {
    stats: { ...examStats, ...attemptStats, ...studentStats },
    recentAttempts: attempts.map((attempt) => ({ ...attempt, risk_level: riskLabel(attempt.suspicion_score) }))
  } });
}));

router.get('/attempts', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(`SELECT a.id,a.status,a.started_at,a.submitted_at,u.name AS student_name,u.email AS student_email,
    e.id AS exam_id,e.title AS exam_title,e.subject,COALESCE(s.suspicion_score,0) AS suspicion_score,
    COALESCE(s.ai_likelihood,0) AS ai_likelihood,COALESCE(s.similarity_score,0) AS similarity_score,
    (SELECT COUNT(*) FROM monitoring_events m WHERE m.attempt_id=a.id) AS event_count
    FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN users u ON u.id=a.student_id
    LEFT JOIN suspicion_scores s ON s.attempt_id=a.id WHERE e.teacher_id=? ORDER BY a.started_at DESC`, [req.user.id]);
  res.json({ success: true, data: rows.map((row) => ({ ...row, risk_level: riskLabel(row.suspicion_score) })) });
}));

router.get('/exams/:id/report', asyncRoute(async (req, res) => {
  const [exams] = await pool.execute('SELECT id,title,subject,total_marks,duration_minutes,status FROM exams WHERE id=? AND teacher_id=?', [req.params.id, req.user.id]);
  if (!exams.length) return res.status(404).json({ success: false, message: 'Exam not found.' });
  const [attempts] = await pool.execute(`SELECT a.id,a.status,a.started_at,a.submitted_at,u.name AS student_name,u.email AS student_email,
    COALESCE(s.suspicion_score,0) AS suspicion_score,COALESCE(s.ai_likelihood,0) AS ai_likelihood,
    COALESCE(s.similarity_score,0) AS similarity_score,COALESCE(s.reasons_json,JSON_ARRAY()) AS reasons_json,
    (SELECT COUNT(*) FROM monitoring_events m WHERE m.attempt_id=a.id) AS event_count
    FROM exam_attempts a JOIN users u ON u.id=a.student_id LEFT JOIN suspicion_scores s ON s.attempt_id=a.id
    WHERE a.exam_id=? ORDER BY suspicion_score DESC,a.started_at`, [req.params.id]);
  const [events] = await pool.execute(`SELECT m.event_type,COUNT(*) AS count FROM monitoring_events m JOIN exam_attempts a ON a.id=m.attempt_id WHERE a.exam_id=? GROUP BY m.event_type`, [req.params.id]);
  const submitted = attempts.filter((attempt) => attempt.status !== 'IN_PROGRESS');
  const average = submitted.length ? Math.round(submitted.reduce((sum, row) => sum + Number(row.suspicion_score), 0) / submitted.length) : 0;
  const flagged = attempts.filter((attempt) => Number(attempt.suspicion_score) >= 60).length;
  res.json({ success: true, data: {
    exam: exams[0], summary: { attempted: attempts.length, submitted: submitted.length, active: attempts.length - submitted.length, flagged, average_suspicion: average },
    attempts: attempts.map((row) => ({ ...row, risk_level: riskLabel(row.suspicion_score), reasons: parseJson(row.reasons_json, []) })),
    eventCounts: events
  } });
}));

export default router;
