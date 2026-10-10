import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3309),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'exam_guard_ai',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  timezone: 'Z',
  charset: 'utf8mb4',
  // Azure Database for MySQL requires TLS; set DB_SSL=true there.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

export default pool;
