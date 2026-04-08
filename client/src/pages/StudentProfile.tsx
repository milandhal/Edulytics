import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, getStudentDetail, getStudentReport } from '../lib/api';
import type { StudentDetail, StudentReport } from '../types/domain';

type Tab = 'performance' | 'marks' | 'attendance' | 'info';

const statusStyles = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-red-100 text-red-700',
  GRADUATED: 'bg-slate-100 text-slate-500',
  DROPPED_OUT: 'bg-amber-100 text-amber-700',
} as const;

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('performance');
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('Student id is missing.');
      setIsLoading(false);
      return;
    }

    let active = true;

    const loadStudent = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [detailResponse, reportResponse] = await Promise.all([
          getStudentDetail(id),
          getStudentReport(id),
        ]);

        if (!active) {
          return;
        }

        setDetail(detailResponse);
        setReport(reportResponse);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load student profile right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadStudent();

    return () => {
      active = false;
    };
  }, [id]);

  const tabClass = (tab: Tab) => (
    `cursor-pointer pb-3 text-sm transition-colors ${
      activeTab === tab
        ? 'border-b-2 border-primary font-semibold text-primary'
        : 'text-on-surface-variant hover:text-primary'
    }`
  );

  if (isLoading) {
    return (
      <PageShell className="max-w-6xl">
        <PageHeader title="Student Profile" description="Loading student information..." />
      </PageShell>
    );
  }

  if (error || !detail) {
    return (
      <PageShell className="max-w-6xl">
        <PageHeader title="Student Profile" description="Unable to load student information." />
        <div className="rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error || 'Student not found'}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title={detail.name}
        description={`${detail.branch.name} - Semester ${detail.currentSemester}`}
      />

      <div className="relative mb-8 flex items-center gap-6 overflow-hidden rounded-2xl border border-outline-variant/10 bg-white px-8 py-6 shadow-sm">
        <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-2xl bg-gradient-to-b from-primary to-secondary" />

        <div className="ml-2 flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 shadow-sm">
          <span className="text-2xl font-black text-primary">{initials(detail.name)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-on-surface">{detail.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyles[detail.status]}`}>
              {detail.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-base">badge</span>
              REG: {detail.registrationNumber}
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-base">account_tree</span>
              {detail.program.name} - {detail.branch.code}
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-base">calendar_month</span>
              Semester {detail.currentSemester} - Batch {detail.admissionYear}
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-8 border-l border-outline-variant/10 pl-8">
          <div className="text-center">
            <div className="text-3xl font-black text-primary">{report?.cgpa?.toFixed(2) ?? '-'}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">CGPA</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black text-secondary">{report?.totalCredits ?? 0}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Credits</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-black" style={{ color: '#855000' }}>{detail.metrics.activeBacklogs}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Backlogs</div>
          </div>
        </div>
      </div>

      <div className="mb-8 flex gap-6 border-b border-outline-variant/20 px-1">
        <button className={tabClass('performance')} onClick={() => setActiveTab('performance')}>Academic Performance</button>
        <button className={tabClass('marks')} onClick={() => setActiveTab('marks')}>Current Enrollments</button>
        <button className={tabClass('attendance')} onClick={() => setActiveTab('attendance')}>Attendance</button>
        <button className={tabClass('info')} onClick={() => setActiveTab('info')}>Personal Info</button>
      </div>

      {activeTab === 'performance' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-outline-variant/10 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-on-surface">Academic Summary</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Based on the current backend report payload.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { label: 'CGPA', value: report?.cgpa?.toFixed(2) ?? 'N/A' },
                  { label: 'Completed Semesters', value: String(report?.completedSemesters ?? 0) },
                  { label: 'Active Backlogs', value: String(report?.backlogs ?? detail.metrics.activeBacklogs) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-surface-container-low p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                    <p className="mt-2 text-2xl font-black text-on-surface">{item.value}</p>
                  </div>
                ))}
              </div>

              {report?.semesters.length ? (
                <div className="mt-6 space-y-3">
                  {report.semesters.map((semester) => (
                    <div key={semester.semesterNumber}>
                      <div className="mb-1 flex justify-between text-xs font-bold text-on-surface-variant">
                        <span>Semester {semester.semesterNumber}</span>
                        <span>{semester.sgpa?.toFixed(2) ?? 'N/A'} SGPA</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-container-high">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(0, Math.min(100, ((semester.sgpa ?? 0) / 10) * 100))}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-outline-variant/30 px-4 py-6 text-center text-sm text-on-surface-variant">
                  Semester-wise performance data is not available in the current backend report yet.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl bg-primary p-6 text-white">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-blue-100">Current Snapshot</p>
              <p className="text-2xl font-black">{detail.metrics.enrolledSubjects} active subjects</p>
              <p className="mt-2 text-xs text-blue-100">
                {detail.metrics.activeBacklogs > 0
                  ? `${detail.metrics.activeBacklogs} active backlog(s) require attention`
                  : 'No active backlogs at the moment'}
              </p>
            </div>

            <div className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Program Details</p>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Program</span>
                  <span className="font-semibold text-on-surface">{detail.program.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Branch</span>
                  <span className="font-semibold text-on-surface">{detail.branch.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Section</span>
                  <span className="font-semibold text-on-surface">{detail.section || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'marks' ? (
        <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 bg-surface-container-low/50">
                {['Subject', 'Code', 'Type', 'Semester', 'Academic Year'].map((heading) => (
                  <th key={heading} className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {detail.enrollments.length > 0 ? detail.enrollments.map((enrollment) => (
                <tr key={enrollment.offeringId} className="hover:bg-surface-container-low/30">
                  <td className="px-6 py-4 font-semibold text-on-surface">{enrollment.subject.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-primary">{enrollment.subject.code}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{enrollment.subject.type}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{enrollment.semesterNumber}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{enrollment.academicYear}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-on-surface-variant">
                    No current enrollments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === 'attendance' ? (
        <div className="rounded-xl border border-outline-variant/10 bg-white p-8 text-center shadow-sm">
          <span className="material-symbols-outlined mb-3 text-4xl text-outline">event_available</span>
          <h2 className="text-base font-bold text-on-surface">Attendance Feed Pending</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Attendance detail is not exposed by the current backend student-report contract yet. This page now stays API-backed and shows an empty state instead of mock percentages.
          </p>
        </div>
      ) : null}

      {activeTab === 'info' ? (
        <div className="grid grid-cols-1 gap-6 rounded-xl border border-outline-variant/10 bg-white p-8 text-sm shadow-sm md:grid-cols-2">
          {[
            ['Full Name', detail.name],
            ['Registration No.', detail.registrationNumber],
            ['Email', detail.email ?? '-'],
            ['Phone', detail.phone ?? '-'],
            ['Program', detail.program.name],
            ['Branch', detail.branch.name],
            ['Semester', String(detail.currentSemester)],
            ['Section', detail.section ?? '-'],
            ['Admission Year', String(detail.admissionYear)],
            ['Graduation Year', detail.graduationYear ? String(detail.graduationYear) : '-'],
            ['Graduation Date', formatDate(detail.graduationDate)],
            ['Status', detail.status.replace('_', ' ')],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
              <p className="font-semibold text-on-surface">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
