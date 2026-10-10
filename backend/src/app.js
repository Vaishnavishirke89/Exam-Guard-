import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import examRoutes from './routes/exams.js';
import attemptRoutes from './routes/attempts.js';
import teacherRoutes from './routes/teacher.js';
import adminRoutes from './routes/admin.js';
import { HttpError } from './utils/http.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '150kb' }));
app.get('/api/health', (_req, res) => res.json({ success: true, message: 'Exam Guard AI API is ready.' }));
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/admin', adminRoutes);
// In production the built React app (frontend/dist) is served by this same server.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
app.use((_req, res) => res.status(404).json({ success: false, message: 'The requested page was not found.' }));
app.use((error, _req, res, _next) => {
  if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'This record already exists.' });
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ success: false, message: 'The selected record is not valid.' });
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, message: status >= 500 ? 'Something went wrong. Please try again.' : error.message });
});

export default app;
