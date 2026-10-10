import 'dotenv/config'; 
import bcrypt from 'bcryptjs';
import pool from './config/db.js';

async function ensureExam(teacherId, definition) {
  const [existing] = await pool.execute('SELECT id FROM exams WHERE teacher_id=? AND title=? LIMIT 1', [teacherId, definition.title]);
  let examId = existing[0]?.id;
  if (!examId) {
    const [result] = await pool.execute(`INSERT INTO exams (teacher_id,title,description,subject,duration_minutes,total_marks,status)
      VALUES (?,?,?,?,?,?, 'PUBLISHED')`, [teacherId, definition.title, definition.description, definition.subject, definition.duration, definition.totalMarks]);
    examId = result.insertId;
  }

  const questionIds = [];
  for (let index = 0; index < definition.questions.length; index += 1) {
    const question = definition.questions[index];
    const position = index + 1;
    const [existingQuestion] = await pool.execute('SELECT id FROM questions WHERE exam_id=? AND position=? ORDER BY id LIMIT 1', [examId, position]);
    if (existingQuestion.length) {
      questionIds.push(existingQuestion[0].id);
      continue;
    }
    const [result] = await pool.execute(`INSERT INTO questions (exam_id,question_text,question_type,options_json,correct_answer,marks,position)
      VALUES (?,?,?,?,?,?,?)`, [examId, question.text, question.type, question.options ? JSON.stringify(question.options) : null, question.correct || null, question.marks, position]);
    questionIds.push(result.insertId);
  }
  return { id: examId, questionIds };
}

async function ensureDemoAttempt({ examId, studentId, status, startedMinutesAgo, submittedMinutesAgo, questionIds, answers, events, score }) {
  const [existing] = await pool.execute('SELECT id FROM exam_attempts WHERE exam_id=? AND student_id=? LIMIT 1', [examId, studentId]);
  if (existing.length) return existing[0].id;

  const startedAt = new Date(Date.now() - startedMinutesAgo * 60 * 1000);
  const submittedAt = submittedMinutesAgo == null ? null : new Date(Date.now() - submittedMinutesAgo * 60 * 1000);
  const [result] = await pool.execute('INSERT INTO exam_attempts (exam_id,student_id,status,started_at,submitted_at) VALUES (?,?,?,?,?)', [examId, studentId, status, startedAt, submittedAt]);
  const attemptId = result.insertId;

  for (const answer of answers) {
    const questionId = questionIds[answer.questionPosition - 1];
    await pool.execute('INSERT INTO answers (attempt_id,question_id,answer_text,metrics_json) VALUES (?,?,?,?)', [attemptId, questionId, answer.text, JSON.stringify(answer.metrics)]);
  }
  for (const event of events) {
    const questionId = event.questionPosition ? questionIds[event.questionPosition - 1] : null;
    const createdAt = new Date(Date.now() - event.minutesAgo * 60 * 1000);
    await pool.execute(`INSERT INTO monitoring_events (attempt_id,question_id,event_type,description,severity,details_json,created_at)
      VALUES (?,?,?,?,?,?,?)`, [attemptId, questionId, event.type, event.description, event.severity || 'LOW', JSON.stringify(event.details || {}), createdAt]);
  }
  if (score) {
    await pool.execute(`INSERT INTO suspicion_scores (attempt_id,suspicion_score,ai_likelihood,similarity_score,reasons_json)
      VALUES (?,?,?,?,?)`, [attemptId, score.suspicion, score.aiLikelihood, score.similarity, JSON.stringify(score.reasons)]);
  }
  return attemptId;
}

try {
  const demoPassword = await bcrypt.hash('Demo@123', 10);
  const accounts = [
    ['Avery Morgan', 'teacher@examguard.demo', 'TEACHER'],
    ['Riya Sharma', 'student@examguard.demo', 'STUDENT'],
    ['System Admin', 'admin@examguard.demo', 'ADMIN']
  ];
  const ids = {};
  for (const [name, email, role] of accounts) {
    await pool.execute(`INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name),password_hash=VALUES(password_hash),role=VALUES(role)`, [name, email, demoPassword, role]);
    const [[user]] = await pool.execute('SELECT id FROM users WHERE email=?', [email]);
    ids[role] = user.id;
  }
  const foundations = await ensureExam(ids.TEACHER, {
    title: 'Foundations of Computing', subject: 'Computer Science', duration: 30, totalMarks: 20,
    description: 'A short demo exam covering programming fundamentals. Monitoring indicators are for teacher review only.',
    questions: [
      { text: 'Which data structure follows the first-in, first-out principle?', type: 'MCQ', options: ['Stack','Queue','Tree','Graph'], correct: 'Queue', marks: 5 },
      { text: 'Explain why input validation is important in a web application.', type: 'DESCRIPTIVE', marks: 10 },
      { text: 'What is one benefit of using parameterized SQL queries?', type: 'DESCRIPTIVE', marks: 5 }
    ]
  });
  const databaseExam = await ensureExam(ids.TEACHER, {
    title: 'Database Design Practice', subject: 'Database Systems', duration: 60, totalMarks: 15,
    description: 'A demonstration attempt that is intentionally left in progress so the student dashboard has a realistic resume state.',
    questions: [
      { text: 'Which normal form removes partial dependencies on a composite key?', type: 'MCQ', options: ['First normal form','Second normal form','Third normal form','Boyce-Codd normal form'], correct: 'Second normal form', marks: 5 },
      { text: 'Describe how a foreign key helps maintain referential integrity.', type: 'DESCRIPTIVE', marks: 10 }
    ]
  });
  const securityExam = await ensureExam(ids.TEACHER, {
    title: 'Secure Web Foundations', subject: 'Web Security', duration: 35, totalMarks: 15,
    description: 'A completed sample assessment with a small monitoring timeline for demonstration and review.',
    questions: [
      { text: 'What does a parameterized query keep separate?', type: 'MCQ', options: ['The SQL structure and user-provided values','The user account and password','The database and web server','The table name and column name'], correct: 'The SQL structure and user-provided values', marks: 5 },
      { text: 'Explain the principle of least privilege in application security.', type: 'DESCRIPTIVE', marks: 10 }
    ]
  });
  await ensureExam(ids.TEACHER, {
    title: 'Algebra and Probability', subject: 'Mathematics', duration: 30, totalMarks: 15,
    description: 'A short practice exam on equations, averages, and probability concepts.',
    questions: [
      { text: 'Solve for x: 2x + 5 = 17.', type: 'MCQ', options: ['4','5','6','11'], correct: '6', marks: 5 },
      { text: 'What is the mean of 2, 4, 6, and 8?', type: 'MCQ', options: ['4','5','6','20'], correct: '5', marks: 5 },
      { text: 'Describe one way probability can help with everyday decision-making.', type: 'DESCRIPTIVE', marks: 5 }
    ]
  });
  await ensureExam(ids.TEACHER, {
    title: 'Mechanics and Energy', subject: 'Physics', duration: 30, totalMarks: 15,
    description: 'Review motion, work, and the conservation of energy.',
    questions: [
      { text: 'What is the SI unit of acceleration?', type: 'MCQ', options: ['m/s','m/s²','N','J'], correct: 'm/s²', marks: 5 },
      { text: 'Which expression gives work done by a constant force parallel to displacement?', type: 'MCQ', options: ['Force × displacement','Mass × acceleration','Mass × velocity','Force ÷ time'], correct: 'Force × displacement', marks: 5 },
      { text: 'State the law of conservation of energy and give a simple example.', type: 'DESCRIPTIVE', marks: 5 }
    ]
  });
  await ensureExam(ids.TEACHER, {
    title: 'Atomic Structure Basics', subject: 'Chemistry', duration: 30, totalMarks: 15,
    description: 'A foundation-level assessment covering atoms and the periodic table.',
    questions: [
      { text: 'The atomic number of an element is equal to its number of what?', type: 'MCQ', options: ['Neutrons','Protons','Electron shells','Isotopes'], correct: 'Protons', marks: 5 },
      { text: 'Elements in the same column of the periodic table generally share what?', type: 'MCQ', options: ['The same atomic mass','Similar chemical properties','The same number of neutrons','Identical symbols'], correct: 'Similar chemical properties', marks: 5 },
      { text: 'Explain how an atom can become a positively or negatively charged ion.', type: 'DESCRIPTIVE', marks: 5 }
    ]
  });
  await ensureExam(ids.TEACHER, {
    title: 'Reading and Writing Skills', subject: 'English Communication', duration: 30, totalMarks: 15,
    description: 'Practice clear grammar, transitions, and short-form academic writing.',
    questions: [
      { text: 'Choose the grammatically correct sentence.', type: 'MCQ', options: ['Each of the students has submitted the form.','Each of the students have submitted the form.','Each students has submitted the form.','Each student have submitted the form.'], correct: 'Each of the students has submitted the form.', marks: 5 },
      { text: 'Which transition word best signals contrast?', type: 'MCQ', options: ['Therefore','For example','However','Similarly'], correct: 'However', marks: 5 },
      { text: 'Name the key parts of a short persuasive paragraph and explain their purpose.', type: 'DESCRIPTIVE', marks: 5 }
    ]
  });
  await ensureExam(ids.TEACHER, {
    title: 'Data Structures and Algorithms', subject: 'Data Structures', duration: 35, totalMarks: 15,
    description: 'A beginner-friendly check on searching and common data structures.',
    questions: [
      { text: 'What is the time complexity of binary search on a sorted array?', type: 'MCQ', options: ['O(1)','O(log n)','O(n)','O(n²)'], correct: 'O(log n)', marks: 5 },
      { text: 'Which rule does a stack follow?', type: 'MCQ', options: ['First in, first out','Last in, first out','Shortest job first','Random access only'], correct: 'Last in, first out', marks: 5 },
      { text: 'Compare arrays and linked lists for accessing an item by its position.', type: 'DESCRIPTIVE', marks: 5 }
    ]
  });

  await ensureDemoAttempt({
    examId: databaseExam.id, studentId: ids.STUDENT, status: 'IN_PROGRESS', startedMinutesAgo: 6, submittedMinutesAgo: null,
    questionIds: databaseExam.questionIds,
    answers: [
      { questionPosition: 1, text: 'Second normal form', metrics: { keystrokes: 0, backspaces: 0, typedCharacters: 0, pasteCount: 0, editCount: 1, durationSeconds: 3 } },
      { questionPosition: 2, text: 'A foreign key links a row to a valid record in another table, helping prevent references to missing data.', metrics: { keystrokes: 103, backspaces: 2, typedCharacters: 101, pasteCount: 0, editCount: 103, durationSeconds: 145 } }
    ],
    events: [
      { type: 'EXAM_STARTED', description: 'Demo sample: exam attempt started', minutesAgo: 6 },
      { type: 'LONG_PAUSE', description: 'Demo sample: a pause while reviewing the descriptive response', questionPosition: 2, minutesAgo: 2, details: { durationSeconds: 38 } }
    ]
  });

  await ensureDemoAttempt({
    examId: securityExam.id, studentId: ids.STUDENT, status: 'SUBMITTED', startedMinutesAgo: 24, submittedMinutesAgo: 7,
    questionIds: securityExam.questionIds,
    answers: [
      { questionPosition: 1, text: 'The SQL structure and user-provided values', metrics: { keystrokes: 43, backspaces: 1, typedCharacters: 42, pasteCount: 0, editCount: 44, durationSeconds: 48 } },
      { questionPosition: 2, text: 'The principle of least privilege gives each user or service only the permissions needed for its task. This limits accidental changes and reduces the impact if an account is compromised.', metrics: { keystrokes: 148, backspaces: 5, typedCharacters: 142, pasteCount: 1, editCount: 153, durationSeconds: 312 } }
    ],
    events: [
      { type: 'EXAM_STARTED', description: 'Demo sample: exam attempt started', minutesAgo: 24 },
      { type: 'PASTE_DETECTED', description: 'Demo sample: text pasted into an exam answer field (161 characters)', questionPosition: 2, severity: 'MEDIUM', minutesAgo: 16, details: { charactersInserted: 161 } },
      { type: 'TAB_SWITCH', description: 'Demo sample: student switched away from the exam tab', questionPosition: 2, minutesAgo: 12, details: {} },
      { type: 'TAB_RETURN', description: 'Demo sample: student returned to the exam tab after 19 seconds', questionPosition: 2, minutesAgo: 11, details: { durationSeconds: 19 } },
      { type: 'EXAM_SUBMITTED', description: 'Demo sample: exam submitted by student', minutesAgo: 7, details: { timedOut: false } }
    ],
    score: { suspicion: 25, aiLikelihood: 0, similarity: 0, reasons: ['Paste activity recorded'] }
  });

  console.log('Demo accounts, exams, and sample student history are ready. All demo accounts use password Demo@123.');
} catch (error) {
  console.error('Could not seed demo data. Import database/schema.sql and check MySQL settings.', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
