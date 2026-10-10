import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const navigation = {
  TEACHER: [{ to: '/teacher', label: 'Overview', icon: '⌂', end: true }, { to: '/teacher/exams', label: 'My exams', icon: '▤' }, { to: '/teacher/attempts', label: 'Student attempts', icon: '◉' }],
  STUDENT: [{ to: '/student', label: 'Available exams', icon: '⌂', end: true }, { to: '/student/profile', label: 'Student details', icon: '◉' }, { to: '/student/history', label: 'My submissions', icon: '◷' }],
  ADMIN: [{ to: '/admin', label: 'System overview', icon: '⌂', end: true }, { to: '/admin/exams', label: 'Subjects & questions', icon: '▤' }]
};
const roleLabels = { TEACHER: 'Faculty workspace', STUDENT: 'Student workspace', ADMIN: 'System administration' };

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = navigation[user.role] || [];
  function signOut() { logout(); navigate('/login'); }
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to={`/${user.role.toLowerCase()}`} className="brand"><span className="brand-mark">E<span>G</span></span><span className="brand-name">Exam Guard<small>AI · ACADEMIC INTEGRITY</small></span></NavLink>
      <div className="side-caption">YOUR WORKSPACE</div>
      <nav className="side-nav">{links.map((link) => <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><span className="nav-icon">{link.icon}</span>{link.label}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="trust-note"><span>✳</span><p>Monitoring signals support human review. They are not proof of misconduct.</p></div><button className="profile-button" onClick={signOut}><span className="avatar">{user.name?.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="profile-copy"><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></span><span className="logout-symbol">↗</span></button></div>
    </aside>
    <main className="main-content"><header className="topbar"><span>{roleLabels[user.role]}</span><div><span className="status-dot" />Secure session <span className="topbar-divider">/</span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div></header><div className="content-wrap"><Outlet /></div></main>
  </div>;
}
