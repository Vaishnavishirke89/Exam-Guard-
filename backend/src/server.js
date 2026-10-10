import 'dotenv/config';
import app from './app.js';
import pool from './config/db.js';

const port = Number(process.env.PORT || 5001);
if (!process.env.JWT_SECRET) throw new Error('Set JWT_SECRET in backend/.env before starting the server.');
try {
  await pool.query('SELECT 1');
  app.listen(port, () => console.log(`Exam Guard AI API listening at http://localhost:${port}`));
} catch (error) {
  console.error('Unable to connect to MySQL. Check backend/.env and confirm MySQL is running.', error.message);
  process.exit(1);
}
