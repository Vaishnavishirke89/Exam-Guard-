import { Link } from 'react-router-dom';

export function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-action">{action}</div>}</div>;
}
export function StatCard({ label, value, note, tone = 'gold', icon = '✦' }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong>{value ?? '—'}</strong>{note && <small>{note}</small>}</div></article>;
}
export function Badge({ children, tone }) {
  const value = String(tone || children || '').toLowerCase().replaceAll(' ', '-');
  return <span className={`badge badge-${value}`}>{children}</span>;
}
export function EmptyState({ title, detail, action }) {
  return <div className="empty-state"><span className="empty-icon">◌</span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
export function Alert({ children, kind = 'error', onClose }) {
  if (!children) return null;
  return <div role="alert" className={`alert alert-${kind}`}>{children}{onClose && <button className="alert-close" aria-label="Dismiss" onClick={onClose}>×</button>}</div>;
}
export function Loading({ label = 'Loading your workspace…' }) { return <div className="loading"><span className="spinner" />{label}</div>; }
export function RiskBar({ value = 0 }) {
  const risk = value >= 60 ? 'high' : value >= 30 ? 'moderate' : 'low';
  return <div className="riskbar-wrap"><div className={`riskbar ${risk}`}><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div><small>{value}</small></div>;
}
export function ButtonLink({ to, children, className = 'btn btn-primary' }) { return <Link to={to} className={className}>{children}</Link>; }
