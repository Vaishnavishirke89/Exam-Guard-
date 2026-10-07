import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api, { errorMessage, getData } from '../services/api.js';
import { Alert, Badge, ButtonLink, EmptyState, Loading, PageHeader } from '../components/UI.jsx';

export default function TeacherExams() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const basePath = isAdmin ? '/admin/exams' : '/teacher/exams';
  const [exams, setExams] = useState(null); const [error, setError] = useState(''); const [busyId, setBusyId] = useState(null);
  function refresh() { return api.get('/exams').then((response) => setExams(getData(response))).catch((requestError) => setError(errorMessage(requestError))); }
  useEffect(() => { refresh(); }, []);
  async function updateStatus(exam, status) {
    setError(''); setBusyId(exam.id);
    try { await api.patch(`/exams/${exam.id}/status`, { status }); await refresh(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(null); }
  }
  async function remove(exam) {
    if (!window.confirm(`Delete “${exam.title}”?`)) return;
    setBusyId(exam.id); setError('');
    try { await api.delete(`/exams/${exam.id}`); await refresh(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(null); }
  }
  if (!exams && !error) return <Loading />;
  return <><PageHeader eyebrow={isAdmin ? 'CONTENT MANAGEMENT' : 'ASSESSMENT LIBRARY'} title={isAdmin ? 'Subjects and exams' : 'Your exams'} description={isAdmin ? 'Add subject exams, manage questions, and publish them for students.' : 'Create, prepare and publish assessments for your students.'} action={<ButtonLink to={`${basePath}/new`}>{isAdmin ? '＋ &nbsp; Add subject & exam' : '＋ &nbsp; Create an exam'}</ButtonLink>} />
    {error && <Alert>{error}</Alert>}
    {exams?.length ? <div className="exam-grid">{exams.map((exam) => {
      const noAttempts = Number(exam.attempt_count || 0) === 0;
      const canEditContent = exam.status === 'DRAFT';
      return <article className="exam-card" key={exam.id}><div className="exam-card-top"><span className="subject-label">{exam.subject}</span><Badge>{exam.status}</Badge></div><h2>{exam.title}</h2><p>{exam.description || 'No description added yet.'}</p><div className="exam-meta"><span>◷ &nbsp;{exam.duration_minutes} min</span><span>▤ &nbsp;{exam.question_count} questions</span><span>◉ &nbsp;{exam.attempt_count} attempts</span></div>
        {isAdmin && exam.status !== 'DRAFT' && !noAttempts && <p className="muted-note">Questions are locked because student attempts already exist.</p>}
        <div className="exam-card-bottom">{canEditContent ? <Link to={`${basePath}/${exam.id}`} className="text-link">{isAdmin ? 'Manage questions →' : 'Edit exam →'}</Link> : isAdmin ? <span className="muted-note">{noAttempts ? 'Move to draft to edit questions' : 'Question editing locked'}</span> : <Link to={`${basePath}/${exam.id}`} className="text-link">View exam →</Link>}
          <div className="inline-actions">{!isAdmin && exam.status !== 'DRAFT' && <Link className="btn btn-small btn-outline" to={`/teacher/exams/${exam.id}/report`}>Report</Link>}
            {exam.status === 'DRAFT' && <button className="btn btn-small btn-outline" disabled={busyId === exam.id} onClick={() => updateStatus(exam, 'PUBLISHED')}>Publish</button>}
            {exam.status === 'PUBLISHED' && <button className="btn btn-small btn-outline" disabled={busyId === exam.id} onClick={() => updateStatus(exam, 'CLOSED')}>Close</button>}
            {isAdmin && exam.status !== 'DRAFT' && noAttempts && <button className="btn btn-small btn-outline" disabled={busyId === exam.id} onClick={() => updateStatus(exam, 'DRAFT')}>Move to draft</button>}
            {exam.status === 'DRAFT' && <button className="icon-action delete-action" title="Delete exam" disabled={busyId === exam.id} onClick={() => remove(exam)}>×</button>}
          </div>
        </div>
      </article>;
    })}</div> : <div className="panel"><EmptyState title={isAdmin ? 'No subject exams yet' : 'Your first exam starts here'} detail={isAdmin ? 'Add an exam with a subject name to make it available to students after publication.' : 'Add a few questions, set a time limit and publish when you’re ready.'} action={<ButtonLink to={`${basePath}/new`}>{isAdmin ? 'Add a subject & exam' : 'Create your first exam'}</ButtonLink>} /></div>}
  </>;
}

function blankQuestion() { return { question_text: '', question_type: 'DESCRIPTIVE', options: ['', '', '', ''], correct_answer: '', marks: 5 }; }

export function ExamEditor() {
  const editing = window.location.pathname.split('/').at(-1) !== 'new';
  const examId = editing ? window.location.pathname.split('/').at(-1) : null;
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const basePath = isAdmin ? '/admin/exams' : '/teacher/exams';
  const [exam, setExam] = useState({ title: '', subject: '', description: '', duration_minutes: 30, total_marks: 20, starts_at: '', ends_at: '' });
  const [questions, setQuestions] = useState([]); const [question, setQuestion] = useState(blankQuestion()); const [editingQuestion, setEditingQuestion] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [loaded, setLoaded] = useState(!editing);
  useEffect(() => {
    if (!editing) return;
    Promise.all([api.get(`/exams/${examId}`), api.get(`/exams/${examId}/questions`)]).then(([examResponse, questionResponse]) => {
      const data = getData(examResponse);
      if (data.status !== 'DRAFT') throw new Error('Move this exam to draft before editing its questions. Exams with student attempts cannot be changed.');
      setExam({ title: data.title, subject: data.subject, description: data.description || '', duration_minutes: data.duration_minutes, total_marks: data.total_marks, starts_at: data.starts_at ? data.starts_at.slice(0, 16).replace(' ', 'T') : '', ends_at: data.ends_at ? data.ends_at.slice(0, 16).replace(' ', 'T') : '' });
      setQuestions(getData(questionResponse));
    }).catch((requestError) => setError(requestError.message || errorMessage(requestError))).finally(() => setLoaded(true));
  }, [examId, editing]);

  async function saveExam(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const payload = { ...exam, duration_minutes: Number(exam.duration_minutes), total_marks: Number(exam.total_marks), starts_at: exam.starts_at || null, ends_at: exam.ends_at || null };
      if (editing) { await api.patch(`/exams/${examId}`, payload); setNotice('Exam details saved.'); }
      else { const result = getData(await api.post('/exams', payload)); window.location.assign(`${basePath}/${result.id}`); }
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function saveQuestion(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const payload = { ...question, question_type: question.question_type, marks: Number(question.marks), position: editingQuestion?.position || questions.length + 1 };
    try {
      if (editingQuestion) await api.patch(`/exams/${examId}/questions/${editingQuestion.id}`, payload);
      else await api.post(`/exams/${examId}/questions`, payload);
      setQuestions(getData(await api.get(`/exams/${examId}/questions`)));
      setQuestion(blankQuestion()); setEditingQuestion(null); setNotice(editingQuestion ? 'Question updated.' : 'Question added.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  async function deleteQuestion(item) {
    if (!window.confirm('Delete this question?')) return;
    try { await api.delete(`/exams/${examId}/questions/${item.id}`); setQuestions(getData(await api.get(`/exams/${examId}/questions`))); }
    catch (requestError) { setError(errorMessage(requestError)); }
  }
  function editQuestion(item) {
    setEditingQuestion(item);
    setQuestion({ question_text: item.question_text, question_type: item.question_type, options: item.options_json || ['', '', '', ''], correct_answer: item.correct_answer || '', marks: item.marks });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  async function publish() {
    setBusy(true); setError('');
    try { await api.patch(`/exams/${examId}/status`, { status: 'PUBLISHED' }); window.location.assign(basePath); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  if (!loaded) return <Loading />;
  const changeExam = (event) => setExam({ ...exam, [event.target.name]: event.target.value });
  const changeQuestion = (event) => setQuestion({ ...question, [event.target.name]: event.target.value });
  return <><PageHeader eyebrow={editing ? 'DRAFT EDITOR' : isAdmin ? 'NEW SUBJECT EXAM' : 'NEW ASSESSMENT'} title={editing ? (isAdmin ? 'Manage subject questions' : 'Shape your exam') : (isAdmin ? 'Add a subject and exam' : 'Create an exam')} description={isAdmin ? 'Set the subject, exam details, and question set. Students see it after you publish.' : 'Start with the essentials, then build your question set.'} action={<Link className="btn btn-quiet" to={basePath}>← Back to exams</Link>} />
    <Alert>{error}</Alert>{notice && <Alert kind="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <section className="panel form-panel"><div className="section-title"><span className="step-number">01</span><div><h2>Exam details</h2><p>A clear title and schedule help students plan ahead.</p></div></div>
      <form onSubmit={saveExam} className="editor-grid"><label className="field-label span-2">Exam title<input className="input" name="title" maxLength="180" placeholder="e.g. Foundations of Computing" required value={exam.title} onChange={changeExam} /></label><label className="field-label">Subject<input className="input" name="subject" maxLength="120" placeholder="e.g. Computer Science" required value={exam.subject} onChange={changeExam} />{isAdmin && <small className="field-hint">This subject appears to students when its exam is published.</small>}</label><label className="field-label">Duration (minutes)<input className="input" name="duration_minutes" type="number" min="1" max="600" required value={exam.duration_minutes} onChange={changeExam} /></label><label className="field-label span-2">Description<textarea className="input" name="description" rows="3" placeholder="Share instructions and context for your students…" value={exam.description} onChange={changeExam} /></label><label className="field-label">Total marks<input className="input" name="total_marks" type="number" min="0" step="0.5" required value={exam.total_marks} onChange={changeExam} /></label><span className="field-hint align-center">Question marks can be set individually below.</span><label className="field-label">Starts at (optional)<input className="input" name="starts_at" type="datetime-local" value={exam.starts_at} onChange={changeExam} /></label><label className="field-label">Ends at (optional)<input className="input" name="ends_at" type="datetime-local" value={exam.ends_at} onChange={changeExam} /></label><div className="span-2 form-actions"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save exam details' : isAdmin ? 'Create subject exam' : 'Create exam & add questions'}</button></div></form>
    </section>
    {editing && <><section className="panel question-list-panel"><div className="panel-heading"><div><p className="eyebrow">QUESTION SET</p><h2>{questions.length} question{questions.length === 1 ? '' : 's'}</h2></div><span className="total-marks">{questions.reduce((sum, item) => sum + Number(item.marks), 0)} marks</span></div>{questions.length ? <div className="question-list">{questions.map((item, index) => <article className="question-row" key={item.id}><span className="question-index">{String(index + 1).padStart(2, '0')}</span><div className="question-row-copy"><strong>{item.question_text}</strong><small>{item.question_type === 'MCQ' ? 'Multiple choice' : 'Descriptive'} · {item.marks} marks</small></div><button className="icon-action" onClick={() => editQuestion(item)} aria-label="Edit question">✎</button><button className="icon-action delete-action" onClick={() => deleteQuestion(item)} aria-label="Delete question">×</button></article>)}</div> : <p className="form-empty-note">Add at least one question before publishing this exam.</p>}</section>
      <section className="panel form-panel"><div className="section-title"><span className="step-number">02</span><div><h2>{editingQuestion ? 'Edit question' : 'Add a question'}</h2><p>Questions are saved to this exam immediately.</p></div></div><form onSubmit={saveQuestion} className="editor-grid"><label className="field-label span-2">Question text<textarea className="input" name="question_text" rows="3" required placeholder="Write your question…" value={question.question_text} onChange={changeQuestion} /></label><label className="field-label">Question type<select className="input" name="question_type" value={question.question_type} onChange={changeQuestion}><option value="DESCRIPTIVE">Descriptive response</option><option value="MCQ">Multiple choice</option></select></label><label className="field-label">Marks<input className="input" name="marks" type="number" min="0.5" step="0.5" value={question.marks} onChange={changeQuestion} /></label>{question.question_type === 'MCQ' && <div className="span-2 options-editor"><p className="field-hint">Four options · choose the correct answer</p>{question.options.map((option, index) => <label className="field-label option-line" key={index}><span>Option {String.fromCharCode(65 + index)}</span><input className="input" value={option} onChange={(event) => setQuestion({ ...question, options: question.options.map((value, optionIndex) => optionIndex === index ? event.target.value : value) })} required /><input aria-label={`Option ${String.fromCharCode(65 + index)} is correct`} type="radio" name="correct_answer_radio" checked={question.correct_answer === option && Boolean(option)} onChange={() => setQuestion({ ...question, correct_answer: option })} /></label>)}<p className="field-hint">Selected correct answer: {question.correct_answer || 'Choose one above'}</p></div>}<div className="span-2 form-actions"><button className="btn btn-outline" type="button" onClick={() => { setQuestion(blankQuestion()); setEditingQuestion(null); }}>Clear form</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editingQuestion ? 'Update question' : 'Add question'}</button></div></form></section>
      <div className="publish-strip"><div><strong>Ready to share this assessment?</strong><span>Publishing makes it visible to students whose exam window is open.</span></div><button className="btn btn-primary" disabled={busy || !questions.length} onClick={publish}>Publish exam →</button></div></>}
  </>;
}
