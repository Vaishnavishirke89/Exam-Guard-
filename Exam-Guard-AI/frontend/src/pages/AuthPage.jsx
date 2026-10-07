import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert } from '../components/UI.jsx';
import { errorMessage } from '../services/api.js';

export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STUDENT' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={`/${user.role.toLowerCase()}`} replace />;

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const nextUser = isRegister ? await register(form) : await login({ email: form.email, password: form.password });
      navigate(params.get('next') || `/${nextUser.role.toLowerCase()}`, { replace: true });
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  function change(event) { setForm({ ...form, [event.target.name]: event.target.value }); }
  return <main className="auth-screen">
    <section className="auth-aside"><Link className="brand auth-brand" to="/login"><span className="brand-mark">E<span>G</span></span><span className="brand-name">Exam Guard<small>AI · ACADEMIC INTEGRITY</small></span></Link><div className="auth-message"><div className="ornament">✳ &nbsp; A BETTER WAY TO ASSESS</div><h1>Clarity for educators.<br /><em>Confidence for every</em><br />student.</h1><p>A thoughtful examination space that records useful context and keeps people at the center of every review.</p><div className="auth-quote"><span>“</span><p>Signals create a clearer picture. Judgement stays with the educator.</p></div></div><div className="auth-foot">BUILT FOR LEARNING &nbsp; · &nbsp; DESIGNED FOR TRUST</div></section>
    <section className="auth-main"><div className="auth-form-wrap"><div className="auth-eyebrow">{isRegister ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</div><h2>{isRegister ? 'Join the learning space' : 'Sign in to continue'}</h2><p className="auth-subtitle">{isRegister ? 'Choose a role to get started. Admin accounts are created by your administrator.' : 'Your workspace is ready when you are.'}</p>
      <Alert>{error}</Alert>
      <form onSubmit={submit} className="form-stack">
        {isRegister && <label className="field-label">Full name<input className="input" name="name" autoComplete="name" maxLength="120" placeholder="e.g. Avery Morgan" required value={form.name} onChange={change} /></label>}
        <label className="field-label">Email address<input className="input" name="email" type="email" autoComplete="email" placeholder="you@college.edu" required value={form.email} onChange={change} /></label>
        <label className="field-label">Password<input className="input" name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : 1} placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'} required value={form.password} onChange={change} /></label>
        {isRegister && <label className="field-label">I am a<select className="input" name="role" value={form.role} onChange={change}><option value="STUDENT">Student</option><option value="TEACHER">Teacher</option></select></label>}
        <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}<span>→</span></button>
      </form>
      {!isRegister && <div className="demo-hint"><strong>Ready to explore?</strong><span>Student demo: student@examguard.demo · Demo@123</span><span>Teacher demo: teacher@examguard.demo · Demo@123</span><span>Admin demo: admin@examguard.demo · Demo@123</span></div>}
      <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to Exam Guard AI?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
      <p className="auth-legal">By continuing, you agree to use monitoring insights as indicators for review, never as a standalone judgement.</p>
    </div></section>
  </main>;
}
