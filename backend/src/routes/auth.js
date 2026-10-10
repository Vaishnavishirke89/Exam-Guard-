import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { asyncRoute, HttpError } from '../utils/http.js';

const router = Router();
const publicUser = (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role });

router.post('/register', asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'STUDENT').toUpperCase();
  if (name.length < 2 || name.length > 120) throw new HttpError(400, 'Name must be between 2 and 120 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 8 || password.length > 72) throw new HttpError(400, 'Password must be between 8 and 72 characters.');
  if (!['STUDENT', 'TEACHER'].includes(role)) throw new HttpError(400, 'Choose a student or teacher account.');
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw new HttpError(409, 'An account with this email already exists.');
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, passwordHash, role]);
  const user = { id: result.insertId, name, email, role };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.status(201).json({ success: true, data: { user, token } });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [rows] = await pool.execute('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [email]);
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) throw new HttpError(401, 'Email or password is incorrect.');
  const user = publicUser(rows[0]);
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, data: { user, token } });
}));

router.get('/profile', authenticate, allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(`SELECT u.id,u.name,u.email,u.role,p.roll_number,p.course,p.year_of_study
    FROM users u LEFT JOIN student_profiles p ON p.user_id=u.id WHERE u.id=?`, [req.user.id]);
  if (!rows.length) throw new HttpError(401, 'Account not found. Please log in again.');
  const row = rows[0];
  res.json({ success: true, data: { ...publicUser(row), roll_number: row.roll_number, course: row.course, year_of_study: row.year_of_study === null ? null : Number(row.year_of_study) } });
}));

router.put('/profile', authenticate, allowRoles('STUDENT'), asyncRoute(async (req, res) => {
  const rollNumber = String(req.body.roll_number || '').trim();
  const course = String(req.body.course || '').trim();
  const yearOfStudy = Number(req.body.year_of_study);
  if (rollNumber.length < 1 || rollNumber.length > 80) throw new HttpError(400, 'Student ID or roll number must be between 1 and 80 characters.');
  if (course.length < 2 || course.length > 120) throw new HttpError(400, 'Course or department must be between 2 and 120 characters.');
  if (!Number.isInteger(yearOfStudy) || yearOfStudy < 1 || yearOfStudy > 6) throw new HttpError(400, 'Choose a valid year of study.');
  await pool.execute(`INSERT INTO student_profiles (user_id,roll_number,course,year_of_study) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE roll_number=VALUES(roll_number),course=VALUES(course),year_of_study=VALUES(year_of_study)`, [req.user.id, rollNumber, course, yearOfStudy]);
  const [rows] = await pool.execute(`SELECT u.id,u.name,u.email,u.role,p.roll_number,p.course,p.year_of_study
    FROM users u JOIN student_profiles p ON p.user_id=u.id WHERE u.id=?`, [req.user.id]);
  const row = rows[0];
  res.json({ success: true, data: { ...publicUser(row), roll_number: row.roll_number, course: row.course, year_of_study: Number(row.year_of_study) } });
}));

router.get('/me', authenticate, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) throw new HttpError(401, 'Account not found. Please log in again.');
  res.json({ success: true, data: publicUser(rows[0]) });
}));

export default router;
