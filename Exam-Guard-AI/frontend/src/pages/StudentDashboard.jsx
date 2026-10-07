import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { errorMessage, getData } from '../services/api.js';
import { Alert, Badge, EmptyState, Loading, PageHeader, StatCard } from '../components/UI.jsx';

function formatWindow(exam) {
  if (exam.starts_at) return `Opens ${new Date(String(exam.starts_at).replace(' ', 'T') + 'Z').toLocaleString()}`;
  return 'Available now';
}

export default function StudentDashboard() {
  const location = useLocation();
  const [exams, setExams] = useState(null); const [history, setHistory] = useState([]); const [profileComplete, setProfileComplete] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(location.state?.selectedSubject || null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    Promise.allSettled([api.get('/exams'), api.get('/attempts/mine'), api.get('/auth/profile')]).then(([examResult, historyResult, profileResult]) => {
      const failures = [];
      if (examResult.status === 'fulfilled') setExams(getData(examResult.value));
      else { setExams([]); failures.push(errorMessage(examResult.reason)); }
      if (historyResult.status === 'fulfilled') setHistory(getData(historyResult.value));
      else failures.push(errorMessage(historyResult.reason));
      if (profileResult.status === 'fulfilled') {
        const nextProfile = getData(profileResult.value);
        setProfileComplete(Boolean(nextProfile.roll_number && nextProfile.course && nextProfile.year_of_study));
      } else failures.push(errorMessage(profileResult.reason));
      if (failures.length) setError([...new Set(failures)].join(' '));
    });
  }, []);
  const subjectGroups = useMemo(() => {
    const groups = new Map();
    (exams || []).forEach((exam) => {
      const subject = String(exam.subject || '').trim() || 'General';
      const key = subject.toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, { subject, exams: [], active: 0 });
      const group = groups.get(key); group.exams.push(exam);
      if (history.some((item) => String(item.exam_id) === String(exam.id) && item.status === 'IN_PROGRESS')) group.active += 1;
    });
    return [...groups.values()].sort((a, b) => a.subject.localeCompare(b.subject));
  }, [exams, history]);
  const selectedExams = selectedSubject ? (exams || []).filter((exam) => (String(exam.subject || '').trim() || 'General').toLocaleLowerCase() === selectedSubject.toLocaleLowerCase()) : [];

  async function start(exam) {
    if (!profileComplete) { navigate('/student/profile', { state: { selectedSubject, required: true } }); return; }
    setBusy(exam.id); setError('');
    try { const attempt = getData(await api.post('/attempts', { exam_id: exam.id })); navigate(`/student/exam/${attempt.id}`); }
    catch (requestError) {
      if (requestError.response?.status === 400 && requestError.response?.data?.message?.includes('Complete your student details')) {
        setProfileComplete(false); navigate('/student/profile', { state: { selectedSubject, required: true } }); return;
      }
      setError(errorMessage(requestError));
    }
    finally { setBusy(null); }
  }
  if (!exams && !error) return <Loading />;
  const active = history.filter((attempt) => attempt.status === 'IN_PROGRESS').length;
  const completed = history.filter((attempt) => attempt.status === 'SUBMITTED' || attempt.status === 'TIMED_OUT').length;
  const available = exams.filter((exam) => !exam.attempt_id).length;
  const previousAttempt = (exam) => history.find((item) => String(item.exam_id) === String(exam.id));
  return <><PageHeader eyebrow="STUDENT HOME" title="Your learning space." description="Find an upcoming assessment or continue where you left off." action={<Link className="btn btn-primary" to="/student/profile">Student details →</Link>} />{error && <Alert>{error}</Alert>}
    <div className="stats-grid three-cols"><StatCard label="Available exams" value={available} note="Ready to begin" icon="▤" /><StatCard label="In progress" value={active} note="Pick up where you left off" tone="amber" icon="◷" /><StatCard label="Completed" value={completed} note="Your submission history" tone="sage" icon="✓" /></div>
    {profileComplete === false && <Alert kind="warning">Add your student ID, course, and year on the <Link className="text-link" to="/student/profile">Student details page</Link> before starting an exam.</Alert>}
    <section className="student-section"><div className="section-heading"><div><p className="eyebrow">YOUR ASSESSMENTS</p><h2>{selectedSubject ? `${selectedSubject} exams` : 'Choose a subject'}</h2></div>{selectedSubject && <button className="btn btn-outline btn-small" onClick={() => setSelectedSubject(null)}>← All subjects</button>}</div>
      {!selectedSubject ? subjectGroups.length ? <div className="subject-picker-grid">{subjectGroups.map((group) => <button className="subject-choice" key={group.subject.toLocaleLowerCase()} onClick={() => setSelectedSubject(group.subject)}><span className="subject-choice-icon">▤</span><span className="subject-choice-copy"><strong>{group.subject}</strong><small>{group.exams.length} open {group.exams.length === 1 ? 'exam' : 'exams'}{group.active ? ` · ${group.active} in progress` : ''}</small></span><span className="subject-choice-arrow">→</span></button>)}</div> : <div className="panel"><EmptyState title="No subjects are available yet" detail="Published exams will appear here when your instructor opens them." /></div>
      : <div className="exam-grid">{selectedExams.map((exam) => { const previous = previousAttempt(exam); return <article className="exam-card student-exam" key={exam.id}><div className="exam-card-top"><span className="subject-label">{exam.subject || 'General'}</span>{previous?.status === 'IN_PROGRESS' ? <Badge>In progress</Badge> : <span className="availability-dot"><i /> Available</span>}</div><h2>{exam.title}</h2><p>{exam.description || 'Your instructor has not added additional instructions.'}</p><div className="exam-meta"><span>◷ &nbsp;{exam.duration_minutes} min</span><span>▤ &nbsp;{exam.question_count} questions</span><span>◎ &nbsp;{exam.total_marks} marks</span></div><div className="exam-window">{formatWindow(exam)}{exam.ends_at && <span> · Closes {new Date(String(exam.ends_at).replace(' ', 'T') + 'Z').toLocaleString()}</span>}</div><div className="exam-card-bottom"><button className="btn btn-primary btn-small" disabled={busy === exam.id} onClick={() => start(exam)}>{busy === exam.id ? 'Opening…' : previous?.status === 'IN_PROGRESS' ? 'Resume exam →' : 'Begin exam →'}</button></div></article>; })}</div>}
    </section>
    {history.length > 0 && <section className="panel table-panel history-preview"><div className="panel-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Your exam history</h2></div><Link className="text-link" to="/student/history">View all →</Link></div><div className="table-scroll"><table><thead><tr><th>EXAM</th><th>SUBJECT</th><th>LAST ACTIVITY</th><th>STATUS</th></tr></thead><tbody>{history.slice(0, 3).map((attempt) => <tr key={attempt.id}><td><strong>{attempt.exam_title}</strong></td><td>{attempt.subject}</td><td>{new Date(String(attempt.submitted_at || attempt.started_at).replace(' ', 'T') + 'Z').toLocaleString()}</td><td><Badge>{attempt.status === 'IN_PROGRESS' ? 'In progress' : attempt.status === 'TIMED_OUT' ? 'Timed out' : 'Completed'}</Badge></td></tr>)}</tbody></table></div></section>}
    <section className="student-note"><span>✳</span><p><strong>A note about monitoring</strong> &nbsp; Only answer-field interactions and when this exam tab is visible are recorded. Indicators are reviewed by your instructor and are not automatic findings.</p></section>
  </>;
}

export function StudentHistory() {
  const [attempts, setAttempts] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api.get('/attempts/mine').then((response) => setAttempts(getData(response))).catch((requestError) => setError(errorMessage(requestError))); }, []);
  if (!attempts && !error) return <Loading />;
  return <><PageHeader eyebrow="YOUR RECORD" title="Submission history" description="A private record of your examination attempts and submission times." />{error && <Alert>{error}</Alert>}<section className="panel table-panel">{attempts?.length ? <div className="table-scroll"><table><thead><tr><th>EXAM</th><th>SUBJECT</th><th>STARTED</th><th>SUBMITTED</th><th>STATUS</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><td><strong>{attempt.exam_title}</strong></td><td>{attempt.subject}</td><td>{new Date(String(attempt.started_at).replace(' ', 'T') + 'Z').toLocaleString()}</td><td>{attempt.submitted_at ? new Date(String(attempt.submitted_at).replace(' ', 'T') + 'Z').toLocaleString() : '—'}</td><td><Badge>{attempt.status === 'IN_PROGRESS' ? 'In progress' : attempt.status === 'TIMED_OUT' ? 'Timed out' : 'Completed'}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No submissions yet" detail="Your exam history will be kept here after you start an assessment." />}</section></>;
}
