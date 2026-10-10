import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage, getData } from '../services/api.js';
import { Alert, Badge, EmptyState, Loading, PageHeader, RiskBar } from '../components/UI.jsx';

export default function TeacherAttempts() {
  const [attempts, setAttempts] = useState(null); const [error, setError] = useState(''); const [filter, setFilter] = useState('ALL'); const [query, setQuery] = useState('');
  useEffect(() => { api.get('/teacher/attempts').then((response) => setAttempts(getData(response))).catch((requestError) => setError(errorMessage(requestError))); }, []);
  const filtered = useMemo(() => (attempts || []).filter((attempt) => (filter === 'ALL' || (filter === 'REVIEW' ? attempt.suspicion_score >= 30 : attempt.status === 'IN_PROGRESS')) && `${attempt.student_name} ${attempt.exam_title}`.toLowerCase().includes(query.toLowerCase())), [attempts, filter, query]);
  if (!attempts && !error) return <Loading />;
  return <><PageHeader eyebrow="MONITORING DESK" title="Student attempts" description="Review completed submissions and the context behind their indicators." />{error && <Alert>{error}</Alert>}
    <section className="panel table-panel"><div className="filter-bar"><div className="segmented">{[['ALL','All attempts'],['REVIEW','Review signals'],['IN_PROGRESS','In progress']].map(([value,label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div><input className="input search-input" placeholder="Search student or exam" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>EXAM</th><th>RISK INDICATOR</th><th>EVENTS</th><th>SUBMITTED</th><th>STATUS</th><th /></tr></thead><tbody>{filtered.map((attempt) => <tr key={attempt.id}><td><strong>{attempt.student_name}</strong><small>{attempt.student_email}</small></td><td><strong>{attempt.exam_title}</strong><small>{attempt.subject}</small></td><td><RiskBar value={attempt.suspicion_score} /><div className="score-label"><Badge>{attempt.risk_level}</Badge><span>AI likelihood {attempt.ai_likelihood}%</span></div></td><td>{attempt.event_count}</td><td>{attempt.submitted_at ? new Date(attempt.submitted_at.replace(' ', 'T') + 'Z').toLocaleString() : '—'}</td><td><Badge>{attempt.status === 'IN_PROGRESS' ? 'In progress' : attempt.status}</Badge></td><td><Link className="table-action" to={`/teacher/attempts/${attempt.id}`}>Review →</Link></td></tr>)}</tbody></table></div> : <EmptyState title={attempts.length ? 'No matching attempts' : 'Nothing to review yet'} detail={attempts.length ? 'Try another filter or search term.' : 'Student attempts will appear here once an exam is started.'} />}
    </section></>;
}
