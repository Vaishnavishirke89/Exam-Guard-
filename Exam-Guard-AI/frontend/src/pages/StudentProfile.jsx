import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { errorMessage, getData } from '../services/api.js';
import { Alert, Loading, PageHeader } from '../components/UI.jsx';

const blankProfile = { roll_number: '', course: '', year_of_study: '' };

export default function StudentProfile() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(blankProfile);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/profile')
      .then((response) => {
        const nextProfile = getData(response);
        setProfile(nextProfile);
        setForm({ roll_number: nextProfile.roll_number || '', course: nextProfile.course || '', year_of_study: nextProfile.year_of_study || '' });
        setEditing(!nextProfile.roll_number || !nextProfile.course || !nextProfile.year_of_study);
      })
      .catch((requestError) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const nextProfile = getData(await api.put('/auth/profile', {
        roll_number: form.roll_number.trim(), course: form.course.trim(), year_of_study: Number(form.year_of_study)
      }));
      setProfile(nextProfile);
      navigate('/student', { replace: true, state: { selectedSubject: location.state?.selectedSubject || null } });
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  const year = Number(profile?.year_of_study);
  const suffix = year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th';

  if (loading) return <Loading label="Loading your student details…" />;

  return <>
    <PageHeader eyebrow="STUDENT RECORD" title="Exam identity." description="Keep the details your instructors use to identify your exam submissions." action={<button className="btn btn-quiet" onClick={() => navigate('/student', { state: { selectedSubject: location.state?.selectedSubject || null } })}>← Choose a subject</button>} />
    {location.state?.required && <Alert kind="warning">Add these details before starting your exam. You’ll return to your selected subject after saving.</Alert>}
    {error && <Alert>{error}</Alert>}
    <section className="panel student-profile student-profile-page">
      <div className="panel-heading"><div><p className="eyebrow">YOUR DETAILS</p><h2>Student information</h2></div>
        {profile?.roll_number && profile?.course && profile?.year_of_study && <div className="inline-actions">
          {editing && <button className="btn btn-quiet btn-small" onClick={() => { setForm({ roll_number: profile.roll_number, course: profile.course, year_of_study: profile.year_of_study }); setError(''); setEditing(false); }}>Cancel</button>}
          {!editing && <button className="btn btn-outline btn-small" onClick={() => setEditing(true)}>Edit details</button>}
        </div>}
      </div>
      <p className="profile-intro">Your name and email come from your account. Enter your student ID or roll number, course or department, and year of study.</p>
      {editing ? <form className="student-profile-form" onSubmit={saveProfile}>
        <label>Student ID / roll number<input autoComplete="off" maxLength="80" required value={form.roll_number} onChange={(event) => setForm({ ...form, roll_number: event.target.value })} placeholder="e.g. 24CS102" /></label>
        <label>Course / department<input maxLength="120" required value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} placeholder="e.g. Computer Science" /></label>
        <label>Year of study<select required value={form.year_of_study} onChange={(event) => setForm({ ...form, year_of_study: event.target.value })}><option value="">Choose year</option>{[1, 2, 3, 4, 5, 6].map((item) => <option key={item} value={item}>{item}{item === 1 ? 'st' : item === 2 ? 'nd' : item === 3 ? 'rd' : 'th'} year</option>)}</select></label>
        <div className="student-profile-actions"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save student details'}</button></div>
      </form> : <div className="profile-summary"><span><small>STUDENT</small><strong>{profile.name}</strong><small>{profile.email}</small></span><span><small>STUDENT ID / ROLL NUMBER</small><strong>{profile.roll_number}</strong></span><span><small>COURSE / DEPARTMENT</small><strong>{profile.course}</strong></span><span><small>YEAR</small><strong>{year}{suffix} year</strong></span></div>}
    </section>
  </>;
}
