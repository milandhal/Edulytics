import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { LoginSelection } from './pages/LoginSelection';
import { ChangePassword } from './pages/ChangePassword';
import { Layout } from './components/Layout';
import { DashboardRouter } from './pages/DashboardRouter';
import { Offerings } from './pages/Offerings';
import { FacultyOfferings } from './pages/FacultyOfferings';
import { COSetup } from './pages/COSetup';
import { MarksEntryCard } from './pages/MarksEntryCard';
import { MarksEntrySpreadsheet } from './pages/MarksEntrySpreadsheet';
import { Students } from './pages/Students';
import { StudentProfile } from './pages/StudentProfile';
import { FacultyAssignment } from './pages/FacultyAssignment';
import { FacultyManagement } from './pages/FacultyManagement';
import { CoPOAnalytics } from './pages/CoPOAnalytics';
import { BulkUpload } from './pages/BulkUpload';
import { Programs } from './pages/Programs';
import { Subjects } from './pages/Subjects';
import { Settings } from './pages/Settings';
import { useAuth } from './hooks/useAuth';

// Guard: redirects faculty to dashboard if they try to access admin-only routes
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function FacultyOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login-selection" element={<LoginSelection />} />
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Protected routes inside Layout */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardRouter />} />

          {/* Admin: full offerings management */}
          <Route path="/admin/offerings" element={<AdminOnly><Offerings /></AdminOnly>} />
          {/* Faculty: assigned subjects grid */}
          <Route path="/offerings" element={<FacultyOfferings />} />
          {/* CO Setup: per offering + assessment */}
          <Route path="/offerings/:offeringId/assessments/:assessmentId/co-setup" element={<COSetup />} />
          {/* Legacy co-setup route */}
          <Route path="/offerings/:id/setup/:component" element={<COSetup />} />
          {/* Marks Entry: Student Card mode only */}
          <Route path="/offerings/:offeringId/assessments/:assessmentId/marks" element={<MarksEntryCard />} />
          <Route path="/offerings/:id/marks/:component" element={<MarksEntryCard />} />
          <Route path="/offerings/:id/spreadsheet" element={<MarksEntrySpreadsheet />} />

          {/* Students — admin only */}
          <Route path="/students" element={<AdminOnly><Students /></AdminOnly>} />
          <Route path="/students/:id" element={<AdminOnly><StudentProfile /></AdminOnly>} />

          {/* Admin */}
          <Route path="/faculty-assignment" element={<AdminOnly><FacultyAssignment /></AdminOnly>} />
          <Route path="/admin/users" element={<AdminOnly><FacultyManagement /></AdminOnly>} />
          <Route path="/admin/upload" element={<AdminOnly><BulkUpload /></AdminOnly>} />
          <Route path="/admin/programs" element={<AdminOnly><Programs /></AdminOnly>} />

          {/* Faculty-only analytics */}
          <Route path="/analytics" element={<FacultyOnly><CoPOAnalytics /></FacultyOnly>} />

          {/* Admin-only: Subjects + Settings */}
          <Route path="/admin/subjects" element={<AdminOnly><Subjects /></AdminOnly>} />
          <Route path="/settings" element={<AdminOnly><Settings /></AdminOnly>} />
        </Route>

        <Route path="/" element={<Navigate to="/login-selection" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
