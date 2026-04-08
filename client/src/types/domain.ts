export interface DashboardActivityItem {
  icon: string;
  color?: string;
  text: string;
  time: string;
}

export interface MarksProgressItem {
  label: string;
  filled: number;
  total: number;
  col: string;
}

export interface BranchPerformanceItem {
  id: string;
  code: string;
  name: string;
  students: number;
  cgpa: number;
  pass: number;
  backlogs: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AdminDashboardData {
  totalStudents: number;
  facultyCount: number;
  activeOfferings: number;
  programsCount: number;
  pendingMarks: number;
  branchPerformance: BranchPerformanceItem[];
  recentActivity: DashboardActivityItem[];
  marksProgress: MarksProgressItem[];
}

export interface TeacherDashboardSubject {
  code: string;
  name: string;
  branch: string;
  sem: number;
  students: number;
  accent: string;
  components: {
    mid: { filled: number; total: number };
    quiz: { filled: number; total: number };
    asn: { filled: number; total: number };
    att: { filled: number; total: number };
    end: { filled: number; total: number };
  };
  co: Array<{ co: string; level: number }>;
  passRate: number;
}

export interface TeacherDashboardData {
  subjects: TeacherDashboardSubject[];
  passRate: number;
  passedStudents: number;
  failedStudents: number;
  totalStudents: number;
  activity: DashboardActivityItem[];
  pendingComponents: number;
}

export interface OfferingSummary {
  id: string;
  semesterNumber: number;
  academicYear: { label: string };
  subject: {
    id: string;
    code: string;
    name: string;
    type: string;
    credits: number;
    lectureHours: number;
    tutorialHours: number;
    practicalHours: number;
  };
  branch: {
    id: string;
    code: string;
    name: string;
  };
  facultyAssignments: Array<{
    user: {
      id: string;
      name: string;
      email: string;
      department?: string;
    };
  }>;
  _count: {
    studentEnrollments: number;
  };
  studentCount: number;
  marksProgress: {
    mid: number;
    quiz: number;
    asn: number;
    att: number;
    end: number;
  };
  setupProgress: {
    mid: boolean;
    quiz: boolean;
    asn: boolean;
    att: boolean;
    end: boolean;
  };
  isStructureLocked: boolean;
  isMarksLocked: boolean;
}

export interface COSetupQuestion {
  id: string;
  label: string;
  maxMarks: number;
  coId: string | null;
  section: string | null;
  groupNumber: number | null;
}

export interface COSetupData {
  requiresSetup: boolean;
  type?: string;
  message?: string;
  isStructureLocked?: boolean;
  hasMarksEntered?: boolean;
  cos?: Array<{
    id: string;
    label: string;
    desc: string;
  }>;
  questions?: COSetupQuestion[];
  offering?: {
    courseCode: string;
    courseName: string;
    branch: string;
    branchName: string;
    sem: number;
    academicYear: string;
    subjectType: string;
  };
}

export interface MarksEntryStudent {
  id: string;
  registrationNumber: string;
  name: string;
}

export interface MarksMatrixResponse {
  marks: Record<string, Record<string, number | null> | { score: number | null }>;
}

export interface StudentMarksResponse {
  marks: Record<string, number | null> | { score: number | null };
}

export interface PagedOfferingsResponse {
  data: OfferingSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FacultyUser {
  id: string;
  name: string;
  email: string;
  department: string | null;
  designation: string | null;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  role: string;
}

export interface ProgramSummary {
  id: string;
  name: string;
  code: string;
  type: 'UG' | 'PG';
  totalSemesters: number;
  isActive: boolean;
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
  programId: string;
  programCode: string;
  totalSemesters: number;
  isActive: boolean;
}

export interface AcademicYearSummary {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  isCurrent: boolean;
}

export interface SubjectSummary {
  id: string;
  code: string;
  name: string;
  type: 'THEORY' | 'LAB' | 'HONS_MINOR' | 'ELECTIVE' | 'ACTIVITY';
  credits: number;
  lectureHours: number;
  tutorialHours: number;
  practicalHours: number;
  usedIn: Array<{
    programCode: string;
    branchCode: string;
    branchName: string;
    semester: number;
  }>;
}

export interface StudentSummary {
  id: string;
  reg: string;
  name: string;
  email: string | null;
  phone: string | null;
  program: string;
  branch: string;
  sem: number;
  section: string;
  batch: number;
  cgpa: number;
  backlogs: number;
  active: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'DROPPED_OUT';
  graduationYear: number | null;
  graduationDate: string | null;
}

export interface StudentListResponse {
  data: StudentSummary[];
  meta: {
    total: number;
    active: number;
    backlogs: number;
    inactive: number;
  };
}

export interface StudentDetail {
  id: string;
  registrationNumber: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'DROPPED_OUT';
  admissionYear: number;
  currentSemester: number;
  section: string | null;
  graduationYear: number | null;
  graduationDate: string | null;
  program: {
    id: string;
    name: string;
    type: 'UG' | 'PG';
  };
  branch: {
    id: string;
    code: string;
    name: string;
  };
  metrics: {
    activeBacklogs: number;
    enrolledSubjects: number;
  };
  enrollments: Array<{
    offeringId: string;
    semesterNumber: number;
    academicYear: string;
    subject: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
  }>;
}

export interface StudentReport {
  studentId: string;
  cgpa: number | null;
  totalCredits: number;
  completedSemesters: number;
  backlogs: number;
  semesters: Array<{
    semesterNumber: number;
    sgpa: number | null;
  }>;
}
