import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { getData } from '../services/api.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('exam_guard_user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('exam_guard_token')));

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('examguard:logout', onLogout);
    if (localStorage.getItem('exam_guard_token')) {
      api.get('/auth/me').then((response) => {
        const current = getData(response);
        setUser(current);
        localStorage.setItem('exam_guard_user', JSON.stringify(current));
      }).catch(() => setUser(null)).finally(() => setLoading(false));
    }
    return () => window.removeEventListener('examguard:logout', onLogout);
  }, []);

  const value = useMemo(() => ({
    user, loading,
    async login(credentials) {
      const { user: nextUser, token } = getData(await api.post('/auth/login', credentials));
      localStorage.setItem('exam_guard_token', token);
      localStorage.setItem('exam_guard_user', JSON.stringify(nextUser));
      setUser(nextUser);
      return nextUser;
    },
    async register(details) {
      const { user: nextUser, token } = getData(await api.post('/auth/register', details));
      localStorage.setItem('exam_guard_token', token);
      localStorage.setItem('exam_guard_user', JSON.stringify(nextUser));
      setUser(nextUser);
      return nextUser;
    },
    logout() {
      localStorage.removeItem('exam_guard_token');
      localStorage.removeItem('exam_guard_user');
      setUser(null);
    }
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
