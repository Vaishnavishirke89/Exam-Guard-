# Exam Guard AI

A student examination platform with teacher review dashboards and transparent, rule-based monitoring indicators.

## Requirements

- Node.js 18 or later
- MySQL 8 or later (the local MySQL80 service on this machine uses port 3309)

## Setup

1. Create the database by importing `database/schema.sql` into MySQL.
2. Copy `backend/.env.example` to `backend/.env` and enter your MySQL password and a private JWT secret.
3. In `backend`, run `npm install`, then `npm run seed`, then `npm run dev`.
4. In another terminal, open `frontend`, run `npm install`, then `npm run dev`.
5. Open the URL printed by Vite (usually http://localhost:5173).

The backend API uses port `5001` by default so it can run alongside other local services that may already use port `5000`.

If you already imported the schema before updating the project, import `database/schema.sql` again after an update. It uses `CREATE TABLE IF NOT EXISTS`, so this safely adds new tables without replacing existing data. Students choose a subject from the dashboard and manage their student ID or roll number, course or department, and year on the separate **Student details** page. These details are required before starting an exam, and the teacher's attempt review shows them with the student's account name and email.

Demo accounts (password: `Demo@123`):

- Teacher: `teacher@examguard.demo`
- Student: `student@examguard.demo`
- Admin: `admin@examguard.demo`

The seed command also adds a demo student's sample history: one available exam, one in-progress attempt, and one completed attempt. Use `student@examguard.demo` to view it.

The student exam picker is populated with published sample exams for Computer Science, Database Systems, Mathematics, Physics, Chemistry, English Communication, and Data Structures. Web Security is included as a completed-history example.

Administrators can open **Subjects & questions** from the sidebar to create subject exams, add or edit questions, and publish them. Exams with existing student attempts are locked from question changes so past submissions remain tied to the question set they used.

Scores and AI-likelihood estimates are heuristic review aids, not proof of misconduct. The app only monitors interactions inside exam answer fields and browser visibility.
