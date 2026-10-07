import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage, getData } from '../services/api.js';
import { Alert, Badge, ButtonLink, EmptyState, Loading, PageHeader, RiskBar, StatCard } from '../components/UI.jsx';

function ParticipationBars({ rows }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.attempt_count)));
  return <div className="mini-chart">{rows.length ? rows.slice(0, 5).map((row, index) => <div className="chart-row" key={row.id}><span>{row.title}</span><div className="chart-track"><i style={{ width: `${Math.max(5, (Number(row.attempt_count) / max) * 100)}%`, opacity: 1 - index * 0.1 }} /></div><b>{row.attempt_count}</b></div>) : <p className="chart-empty">Publish your first exam to start tracking participation.</p>}</div>;
}

export default function TeacherDashboard() {
  const [data, setData] = useState(null); const [exams, setExams] = useState([]); const [error, setError] = useState('');
  useEffect(() => { Promise.all([api.get('/teacher/dashboard'), api.get('/exams')]).then(([dashboard, examList]) => { setData(getData(dashboard)); setExams(getData(examList)); }).catch((requestError) => setError(errorMessage(requestError))); }, []);
  if (!data && !error) return <Loading />;
  if (!data) return <Alert>{error}</Alert>;
  const stats = data.stats || {};
  return <><PageHeader eyebrow="TEACHER OVERVIEW" title="Good day, educator." description="An at-a-glance view of your assessments and the students taking them." action={<ButtonLink to="/teacher/exams/new">＋ &nbsp; Create an exam</ButtonLink>} />
    {error && <Alert>{error}</Alert>}
    <div className="stats-grid four-cols"><StatCard label="Total exams" value={stats.total_exams || 0} note={`${stats.published_exams || 0} published`} icon="▤" /><StatCard label="Students reached" value={stats.total_students || 0} note="Across your assessments" tone="burgundy" icon="◉" /><StatCard label="Active attempts" value={stats.active_attempts || 0} note="Currently in progress" tone="sage" icon="◷" /><StatCard label="Needs review" value={stats.flagged_attempts || 0} note="Indicators at 60+" tone="amber" icon="⚑" /></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">PARTICIPATION</p><h2>Student activity</h2></div><Link to="/teacher/exams" className="text-link">View all exams →</Link></div><ParticipationBars rows={exams} /></section>
      <section className="panel insight-panel"><div className="panel-heading"><div><p className="eyebrow">A NOTE ON REVIEW</p><h2>Context before conclusions</h2></div><span className="panel-flower">✳</span></div><p>Monitoring indicators can help identify answers that need a closer look. They do not establish intent or prove misconduct.</p><div className="insight-rule" /><div className="insight-foot"><span className="status-dot" /> Scores combine recorded interactions with simple text heuristics.</div></section></div>
    <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">RECENT SUBMISSIONS</p><h2>Student attempts</h2></div><Link to="/teacher/attempts" className="text-link">Open monitoring →</Link></div>
      {data.recentAttempts.length ? <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>EXAM</th><th>SUSPICION SCORE</th><th>INDICATORS</th><th>STATUS</th><th /></tr></thead><tbody>{data.recentAttempts.map((attempt) => <tr key={attempt.id}><td><strong>{attempt.student_name}</strong><small>{attempt.student_email}</small></td><td>{attempt.exam_title}</td><td><RiskBar value={attempt.suspicion_score} /></td><td>{attempt.event_count} event{attempt.event_count === 1 ? '' : 's'}</td><td><Badge>{attempt.status === 'IN_PROGRESS' ? 'In progress' : attempt.risk_level}</Badge></td><td><Link className="table-action" to={`/teacher/attempts/${attempt.id}`}>Review →</Link></td></tr>)}</tbody></table></div> : <EmptyState title="No attempts just yet" detail="When students begin an exam, their progress and review indicators will appear here." action={<ButtonLink to="/teacher/exams">Explore your exams</ButtonLink>} />}
    </section></>;
}
