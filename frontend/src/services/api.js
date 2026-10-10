import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api'), timeout: 12000 });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('exam_guard_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401 && localStorage.getItem('exam_guard_token')) {
    localStorage.removeItem('exam_guard_token');
    localStorage.removeItem('exam_guard_user');
    window.dispatchEvent(new Event('examguard:logout'));
  }
  return Promise.reject(error);
});

export const getData = (response) => response.data.data;
export const errorMessage = (error) => error.response?.data?.message || (error.code === 'ECONNABORTED' ? 'The server took too long to respond.' : 'Could not connect to the server. Check that the backend is running.');
export default api;
