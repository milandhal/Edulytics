import { PageHeader, PageShell } from '../components/PageShell';
import { StudentTable } from '../components/StudentTable';
import { useAuth } from '../hooks/useAuth';

function getAcademicYear() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  // Academic year starts around July (month index 6)
  const academicStartYear = currentMonth < 6 ? currentYear - 1 : currentYear;
  const academicEndYear = (academicStartYear + 1).toString().slice(-2);
  return `${academicStartYear}-${academicEndYear}`;
}

export function Students() {
  const { isAdmin } = useAuth();

  return (
    <PageShell>
      <PageHeader
        title="Students"
        description={isAdmin ? `All enrolled students · Academic Year ${getAcademicYear()}` : 'Students in your assigned subjects'}
      />
      <StudentTable showAddButton={isAdmin} />
    </PageShell>
  );
}
