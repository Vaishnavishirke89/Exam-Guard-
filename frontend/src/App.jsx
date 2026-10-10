import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AuthPage from './pages/AuthPage.jsx';
import TeacherDashboard from './pages/TeacherDashboard.jsx';
import TeacherExams, { ExamEditor } from './pages/TeacherExams.jsx';
import TeacherAttempts from './pages/TeacherAttempts.jsx';
import AttemptReview from './pages/AttemptReview.jsx';
import ExamReport from './pages/ExamReport.jsx';
import StudentDashboard, { StudentHistory } from './pages/StudentDashboard.jsx';
import StudentProfile from './pages/StudentProfile.jsx';
import TakeExam from './pages/TakeExam.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading full-loading"><span className="spinner" />Loading workspace…</div>;
  return <Navigate to={user ? `/${user.role.toLowerCase()}` : '/login'} replace />;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/register" element={<AuthPage mode="register" />} />

    <Route element={<ProtectedRoute roles={['TEACHER']} />}><Route path="/teacher" element={<AppShell />}>
      <Route index element={<TeacherDashboard />} />
      <Route path="exams" element={<TeacherExams />} />
      <Route path="exams/new" element={<ExamEditor />} />
      <Route path="exams/:id" element={<ExamEditor />} />
      <Route path="exams/:id/report" element={<ExamReport />} />
      <Route path="attempts" element={<TeacherAttempts />} />
      <Route path="attempts/:id" element={<AttemptReview />} />
    </Route></Route>

    <Route element={<ProtectedRoute roles={['STUDENT']} />}><Route path="/student" element={<AppShell />}>
      <Route index element={<StudentDashboard />} />
      <Route path="profile" element={<StudentProfile />} />
      <Route path="history" element={<StudentHistory />} />
    </Route></Route>
    <Route element={<ProtectedRoute roles={['STUDENT']} />}><Route path="/student/exam/:id" element={<TakeExam />} /></Route>

    <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<AppShell />}>
      <Route index element={<AdminDashboard />} />
      <Route path="exams" element={<TeacherExams />} />
      <Route path="exams/new" element={<ExamEditor />} />
      <Route path="exams/:id" element={<ExamEditor />} />
    </Route></Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes>;
}
