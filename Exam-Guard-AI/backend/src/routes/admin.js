import { Router } from 'express';
import pool from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute } from '../utils/http.js';

const router = Router();
router.use(authenticate, allowRoles('ADMIN'));

router.get('/dashboard', asyncRoute(async (req, res) => {
  const [[users]] = await pool.execute(`SELECT SUM(role='STUDENT') AS students,SUM(role='TEACHER') AS teachers,
    COUNT(*) AS total_users FROM users`);
  const [[activity]] = await pool.execute(`SELECT (SELECT COUNT(*) FROM exams) AS exams,
    (SELECT COUNT(*) FROM exam_attempts) AS attempts,
    (SELECT COUNT(*) FROM monitoring_events) AS monitoring_events`);
  const [recent] = await pool.execute(`SELECT m.event_type,m.description,m.created_at,u.name AS student_name,e.title AS exam_title
    FROM monitoring_events m JOIN exam_attempts a ON a.id=m.attempt_id JOIN users u ON u.id=a.student_id
    JOIN exams e ON e.id=a.exam_id ORDER BY m.created_at DESC LIMIT 12`);
  res.json({ success: true, data: { ...users, ...activity, recent } });
}));

export default router;
