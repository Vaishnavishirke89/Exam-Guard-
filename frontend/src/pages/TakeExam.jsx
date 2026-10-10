import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage, getData } from '../services/api.js';
import { Alert, Badge, Loading } from '../components/UI.jsx';

function secondsLeft(startedAt, minutes) {
  const start = new Date(String(startedAt).replace(' ', 'T') + 'Z').getTime();
  return Math.max(0, Math.ceil((start + minutes * 60000 - Date.now()) / 1000));
}
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
const initialMetrics = () => ({ keystrokes: 0, backspaces: 0, typedCharacters: 0, pasteCount: 0, editCount: 0, startedAt: null, lastInputAt: null, durationSeconds: 0, highSpeedLogged: false, backspaceLogged: false });

export default function TakeExam() {
  const { id } = useParams(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [answers, setAnswers] = useState({}); const [current, setCurrent] = useState(0); const [remaining, setRemaining] = useState(null);
  const [error, setError] = useState(''); const [warning, setWarning] = useState(''); const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false); const [submitted, setSubmitted] = useState(null);
  const metricRef = useRef({}); const previousTextRef = useRef({}); const saveTimers = useRef({}); const pasteTimes = useRef({}); const awayAt = useRef(null); const switchRecorded = useRef(false); const submitting = useRef(false); const answerRefs = useRef({});

  const recordEvent = useCallback(async (eventType, questionId, details = {}, description) => {
    try { await api.post(`/attempts/${id}/events`, { event_type: eventType, question_id: questionId, details, description }); }
    catch { setWarning('A monitoring event could not be synced. Check your connection.'); }
  }, [id]);

  useEffect(() => {
    api.get(`/attempts/${id}`).then((response) => {
      const result = getData(response); setData(result);
      const initial = {};
      for (const answer of result.answers) { initial[answer.question_id] = answer.answer_text || ''; metricRef.current[answer.question_id] = { ...initialMetrics(), ...(answer.metrics_json || {}), lastInputAt: null }; previousTextRef.current[answer.question_id] = answer.answer_text || ''; }
      setAnswers(initial); setRemaining(secondsLeft(result.attempt.started_at, result.attempt.duration_minutes));
      if (result.attempt.status !== 'IN_PROGRESS') setSubmitted({ suspicionScore: result.score?.suspicion_score || 0, aiLikelihood: result.score?.ai_likelihood || 0, similarityScore: result.score?.similarity_score || 0, reasons: result.score?.reasons || [] });
    }).catch((requestError) => setError(errorMessage(requestError)));
    return () => Object.values(saveTimers.current).forEach(clearTimeout);
  }, [id]);

  const questions = data?.answers || [];
  const activeQuestion = questions[current];
  const progress = questions.length ? Math.round((Object.values(answers).filter((value) => String(value).trim()).length / questions.length) * 100) : 0;

  const saveAnswer = useCallback(async (questionId, text) => {
    if (!questionId) return;
    const metric = metricRef.current[questionId] || initialMetrics();
    const duration = metric.startedAt ? Math.max(0, Math.round((Date.now() - metric.startedAt) / 1000)) : 0;
    const snapshot = { ...metric, durationSeconds: duration };
    setSaving(true);
    try { await api.put(`/attempts/${id}/answers/${questionId}`, { answer_text: text, metrics: snapshot }); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }, [id]);

  function queueSave(questionId, text) {
    clearTimeout(saveTimers.current[questionId]);
    saveTimers.current[questionId] = setTimeout(() => saveAnswer(questionId, text), 700);
  }

  function changeText(questionId, value) {
    const previous = previousTextRef.current[questionId] || '';
    const metric = metricRef.current[questionId] || initialMetrics();
    const now = Date.now();
    const delta = value.length - previous.length;
    if (!metric.startedAt && value.length) metric.startedAt = now;
    if (delta > 90 && now - (pasteTimes.current[questionId] || 0) > 500) {
      recordEvent('LARGE_TEXT_INSERTION', questionId, { charactersInserted: delta }, `Large text insertion: ${delta} characters`);
      metric.editCount += 1;
    }
    metric.lastInputAt = now;
    metric.durationSeconds = metric.startedAt ? Math.max(0, Math.round((now - metric.startedAt) / 1000)) : 0;
    metricRef.current[questionId] = metric; previousTextRef.current[questionId] = value;
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionId]: value }));
    queueSave(questionId, value);
  }

  function keyDown(event, questionId) {
    if (event.key === 'Tab' || event.key.length > 1 && !['Backspace','Delete','Enter',' '].includes(event.key)) return;
    const metric = metricRef.current[questionId] || initialMetrics(); const now = Date.now();
    if (!metric.startedAt) metric.startedAt = now;
    if (metric.lastInputAt && now - metric.lastInputAt > 30000) recordEvent('LONG_PAUSE', questionId, { durationSeconds: Math.round((now - metric.lastInputAt) / 1000) }, 'A pause of more than 30 seconds while editing');
    metric.keystrokes += 1; metric.editCount += 1;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      metric.backspaces += 1;
      if (metric.backspaces >= 15 && !metric.backspaceLogged) { metric.backspaceLogged = true; recordEvent('EXCESSIVE_BACKSPACE', questionId, { backspaces: metric.backspaces }, 'At least 15 deletions while editing this answer'); }
    } else if (event.key.length === 1 || event.key === 'Enter') metric.typedCharacters += 1;
    metric.durationSeconds = Math.max(1, Math.round((now - metric.startedAt) / 1000));
    const speed = Math.round(metric.typedCharacters / metric.durationSeconds * 60);
    if (metric.typedCharacters >= 25 && speed > 220 && !metric.highSpeedLogged) { metric.highSpeedLogged = true; recordEvent('HIGH_TYPING_SPEED', questionId, { approximateCpm: speed }, `Approximate answer entry speed: ${speed} characters per minute`); }
    metric.lastInputAt = now; metricRef.current[questionId] = metric;
  }

  function paste(event, questionId) {
    const pastedText = event.clipboardData?.getData('text') || '';
    pasteTimes.current[questionId] = Date.now();
    const metric = metricRef.current[questionId] || initialMetrics(); metric.pasteCount += 1; metric.editCount += 1; metricRef.current[questionId] = metric;
    recordEvent('PASTE_DETECTED', questionId, { charactersInserted: pastedText.length }, `Text pasted into answer field (${pastedText.length} characters)`);
  }

  async function submit(timedOut = false) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    Object.values(saveTimers.current).forEach(clearTimeout);
    try {
      for (const question of questions) await saveAnswer(question.question_id, answers[question.question_id] || '');
      const result = getData(await api.post(`/attempts/${id}/submit`, { timed_out: timedOut }));
      setSubmitted(result); setWarning('');
      if (timedOut) setWarning('Time expired. Your answers have been submitted automatically.');
    } catch (requestError) { submitting.current = false; setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!data || submitted || remaining === null) return undefined;
    if (remaining <= 0) { submit(true); return undefined; }
    const timer = setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [data, submitted, remaining]);

  useEffect(() => {
    if (!data || submitted) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (awayAt.current == null) awayAt.current = Date.now();
        if (!switchRecorded.current) { switchRecorded.current = true; recordEvent('TAB_SWITCH', activeQuestion?.question_id, {}, 'Student switched away from the exam tab'); setWarning('Leaving the examination window has been recorded.'); }
      } else if (awayAt.current != null) {
        const durationSeconds = Math.round((Date.now() - awayAt.current) / 1000); awayAt.current = null; switchRecorded.current = false;
        recordEvent('TAB_RETURN', activeQuestion?.question_id, { durationSeconds }, `Returned to the exam after ${durationSeconds} seconds`);
      }
    };
    const onBlur = () => { if (document.visibilityState === 'visible' && awayAt.current == null) { awayAt.current = Date.now(); recordEvent('WINDOW_BLUR', activeQuestion?.question_id, {}, 'Exam window lost focus'); } };
    const onFocus = () => { if (document.visibilityState === 'visible' && awayAt.current != null) { const durationSeconds = Math.round((Date.now() - awayAt.current) / 1000); awayAt.current = null; switchRecorded.current = false; recordEvent('TAB_RETURN', activeQuestion?.question_id, { durationSeconds }, `Exam window regained focus after ${durationSeconds} seconds`); } };
    document.addEventListener('visibilitychange', onVisibility); window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
  }, [data, submitted, activeQuestion?.question_id, recordEvent]);

  if (!data && !error) return <Loading label="Preparing your exam…" />;
  if (!data) return <div className="exam-error"><Alert>{error}</Alert><Link className="btn btn-quiet" to="/student">Return to your exams</Link></div>;
  const { attempt } = data;
  if (submitted) return <main className="submitted-screen"><div className="submitted-card"><span className="submitted-seal">✓</span><p className="eyebrow">EXAM SUBMITTED</p><h1>Your response is in.</h1><p className="submitted-copy-long">Your answers have been saved. Your instructor may review the submission with the context recorded during this assessment.</p><div className="submitted-score"><div><span>Suspicion indicator</span><strong>{submitted.suspicionScore ?? submitted.suspicion_score ?? 0}<small> / 100</small></strong></div><div><span>AI likelihood</span><strong>{submitted.aiLikelihood ?? submitted.ai_likelihood ?? 0}%</strong></div></div><p className="heuristic-note">These are heuristic indicators for instructor review, not findings or proof of misconduct.</p><Link className="btn btn-primary" to="/student/history">View submission history →</Link></div></main>;
  if (!questions.length) return <Loading label="This exam has no questions." />;
  const lowTime = remaining < 300;
  const answeredCount = Object.values(answers).filter((value) => String(value).trim()).length;
  const answerValue = answers[activeQuestion.question_id] || '';
  const metrics = metricRef.current[activeQuestion.question_id] || initialMetrics();
  return <main className="take-exam-screen"><header className="exam-topbar"><Link to="/student" className="brand"><span className="brand-mark">E<span>G</span></span><span className="brand-name">Exam Guard<small>ASSESSMENT IN PROGRESS</small></span></Link><div className="exam-top-meta"><span>{attempt.subject}</span><span className={`exam-timer ${lowTime ? 'timer-low' : ''}`}><i />{formatTime(remaining || 0)} <small>remaining</small></span><span className="save-state">{saving ? 'Saving…' : '✓ Answers save automatically'}</span></div><button className="btn btn-outline" disabled={busy} onClick={() => submit(false)}>{busy ? 'Submitting…' : 'Submit exam'}</button></header>
    <div className="exam-workspace"><aside className="exam-outline"><p className="eyebrow">YOUR EXAM</p><h2>{attempt.exam_title}</h2><p>{attempt.duration_minutes} minutes · {questions.length} questions</p><div className="outline-divider"/><div className="outline-progress"><span>YOUR PROGRESS</span><strong>{answeredCount} <small>of {questions.length}</small></strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><div className="question-nav">{questions.map((question, index) => <button key={question.question_id} className={`${current === index ? 'current' : ''} ${answers[question.question_id]?.trim() ? 'answered' : ''}`} onClick={() => setCurrent(index)}><span>{String(index + 1).padStart(2, '0')}</span>{answers[question.question_id]?.trim() && <i>✓</i>}</button>)}</div><div className="outline-note"><span>✳</span><p>This page records answer-field activity and whether this tab is visible.</p></div></aside>
      <section className="question-stage"><div className="question-stage-heading"><span className="eyebrow">QUESTION {String(current + 1).padStart(2, '0')} OF {String(questions.length).padStart(2, '0')}</span><Badge>{activeQuestion.marks} marks</Badge></div><div className="question-progress"><i style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div><h1>{activeQuestion.question_text}</h1>{activeQuestion.question_type === 'MCQ' ? <div className="mcq-options">{(activeQuestion.options_json || []).map((option, index) => <button type="button" className={`mcq-option ${answerValue === option ? 'selected' : ''}`} onClick={() => changeText(activeQuestion.question_id, option)} key={option}><span>{String.fromCharCode(65 + index)}</span><strong>{option}</strong>{answerValue === option && <b>✓</b>}</button>)}</div> : <div className="answer-editor-wrap"><label className="field-label" htmlFor="answer-field">YOUR ANSWER</label><textarea ref={(element) => { answerRefs.current[activeQuestion.question_id] = element; }} id="answer-field" className="answer-editor" value={answerValue} onChange={(event) => changeText(activeQuestion.question_id, event.target.value)} onKeyDown={(event) => keyDown(event, activeQuestion.question_id)} onPaste={(event) => paste(event, activeQuestion.question_id)} placeholder="Take a moment to think, then write your response…" maxLength={50000} /><div className="answer-editor-footer"><span>Only this answer field is monitored</span><span>{answerValue.length} characters · {metrics.backspaces || 0} edits</span></div></div>}
        {warning && <Alert kind="warning" onClose={() => setWarning('')}>{warning}</Alert>}{error && <Alert>{error}</Alert>}
        <div className="question-controls"><button className="btn btn-quiet" disabled={current === 0} onClick={() => setCurrent((index) => index - 1)}>← &nbsp; Previous</button><span>{current + 1} <i>/</i> {questions.length}</span>{current < questions.length - 1 ? <button className="btn btn-primary" onClick={() => setCurrent((index) => index + 1)}>Next question &nbsp; →</button> : <button className="btn btn-primary" disabled={busy} onClick={() => submit(false)}>{busy ? 'Submitting…' : 'Review & submit →'}</button>}</div>
      </section></div></main>;
}
