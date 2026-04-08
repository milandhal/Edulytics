import { useAuth } from '../hooks/useAuth';
import { Dashboard as AdminDashboard } from './Dashboard';
import { FacultyDashboard } from './FacultyDashboard';

// Role-aware dashboard router — no path change needed
export function DashboardRouter() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminDashboard /> : <FacultyDashboard />;
}
