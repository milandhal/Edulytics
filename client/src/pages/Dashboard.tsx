import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardFeatureCard } from '../components/DashboardFeatureCard';
import { InitialsAvatar } from '../components/InitialsAvatar';
import { Reveal, staggerStyle } from '../components/Motion';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, getAdminDashboard, listOfferings, peekCachedGet } from '../lib/api';
import type { AdminDashboardData, OfferingSummary } from '../types/domain';

type QuickAction = {
  eyebrow: string;
  label: string;
  sub: string;
  icon: string;
  to: string;
  cta: string;
  tone: 'primary' | 'secondary' | 'sky' | 'mint';
};

const quickActions: QuickAction[] = [
  { eyebrow: 'Student Records', label: 'Manage Students', sub: 'Add, edit or promote', icon: 'group', to: '/students', cta: 'Open Students', tone: 'primary' },
  { eyebrow: 'Semester Grid', label: 'Course Offerings', sub: 'View and organize subject offerings', icon: 'menu_book', to: '/admin/offerings', cta: 'Open Offerings', tone: 'secondary' },
  { eyebrow: 'Faculty Workflow', label: 'Faculty Assignment', sub: 'Assign teaching responsibilities', icon: 'manage_accounts', to: '/faculty-assignment', cta: 'Assign Faculty', tone: 'sky' },
  { eyebrow: 'Import Center', label: 'Bulk Upload', sub: 'CSV / Excel import pipeline', icon: 'upload_file', to: '/admin/upload', cta: 'Upload Files', tone: 'mint' },
];

function percentage(filled: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((filled / total) * 100);
}

export function Dashboard() {
  const cachedDashboard = peekCachedGet<AdminDashboardData>('/api/v1/dashboard/admin');
  const cachedOfferings = peekCachedGet<{ data: OfferingSummary[]; total: number; page: number; pageSize: number }>(
    '/api/v1/offerings',
    { pageSize: 200 },
  );
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(() => cachedDashboard ?? null);
  const [offerings, setOfferings] = useState<OfferingSummary[]>(() => cachedOfferings?.data ?? []);
  const [isLoading, setIsLoading] = useState(() => !cachedDashboard || !cachedOfferings);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      if (!dashboard || offerings.length === 0) {
        setIsLoading(true);
      }
      setError('');

      try {
        const [dashboardData, offeringsResponse] = await Promise.all([
          getAdminDashboard(),
          listOfferings({ pageSize: 200 }),
        ]);

        if (!active) {
          return;
        }

        setDashboard(dashboardData);
        setOfferings(offeringsResponse.data);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load dashboard right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const today = useMemo(() => new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }), []);

  const academicYear = offerings[0]?.academicYear.label ?? 'Current Academic Year';
  const unassigned = useMemo(() => (
    offerings.filter((offering) => offering.facultyAssignments.length === 0)
  ), [offerings]);

  const availableFaculty = useMemo(() => {
    if (!dashboard || offerings.length === 0) {
      return [];
    }

    const counts = new Map<string, { name: string; email: string; count: number }>();

    offerings.forEach((offering) => {
      offering.facultyAssignments.forEach((assignment) => {
        const current = counts.get(assignment.user.id);
        if (current) {
          current.count += 1;
        } else {
          counts.set(assignment.user.id, {
            name: assignment.user.name,
            email: assignment.user.email,
            count: 1,
          });
        }
      });
    });

    return Array.from(counts.values())
      .sort((left, right) => left.count - right.count || left.name.localeCompare(right.name))
      .slice(0, 5);
  }, [dashboard, offerings]);

  const stats = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    const submittedPct = dashboard.marksProgress.length > 0
      ? Math.round(
        dashboard.marksProgress.reduce((sum, item) => sum + percentage(item.filled, item.total), 0) / dashboard.marksProgress.length,
      )
      : 0;

    return [
      {
        label: 'Active Students',
        value: dashboard.totalStudents.toLocaleString(),
        delta: `${dashboard.branchPerformance.length} tracked branches`,
        deltaColor: 'text-green-600',
        icon: 'group',
        color: 'text-primary',
        bg: 'bg-primary/5',
      },
      {
        label: 'Course Offerings',
        value: dashboard.activeOfferings.toLocaleString(),
        delta: `${dashboard.programsCount} active programs`,
        deltaColor: 'text-on-surface-variant',
        icon: 'menu_book',
        color: 'text-secondary',
        bg: 'bg-secondary/5',
      },
      {
        label: 'Faculty',
        value: dashboard.facultyCount.toLocaleString(),
        delta: `${unassigned.length} unassigned offerings`,
        deltaColor: unassigned.length > 0 ? 'text-amber-600' : 'text-green-600',
        icon: 'badge',
        color: unassigned.length > 0 ? 'text-amber-600' : 'text-green-600',
        bg: unassigned.length > 0 ? 'bg-amber-50' : 'bg-green-50',
      },
      {
        label: 'Marks Submitted',
        value: `${submittedPct}%`,
        delta: `${dashboard.pendingMarks} offerings pending`,
        deltaColor: dashboard.pendingMarks > 0 ? 'text-error' : 'text-green-600',
        icon: 'assignment_turned_in',
        color: 'text-green-600',
        bg: 'bg-green-50',
      },
    ];
  }, [dashboard, unassigned.length]);

  return (
    <PageShell>
      <PageHeader
        title="Admin Dashboard"
        description={(
          <p>
            <span className="font-semibold text-primary">OUTR</span> - {academicYear} - {today}
          </p>
        )}
        actions={(
          <div className="flex items-center gap-2 pt-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">System Active</span>
          </div>
        )}
      />

      {error ? (
        <div className="mb-6 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading ? Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="motion-reveal rounded-xl border border-outline-variant/10 bg-white p-4 shadow-sm" style={staggerStyle(index, 55, 40)}>
            <div className="space-y-3">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-8 w-20 rounded bg-slate-100" />
              <div className="h-3 w-28 rounded bg-slate-100" />
            </div>
          </div>
        )) : stats.map((item, index) => (
          <div key={item.label} className="motion-reveal rounded-xl border border-outline-variant/10 bg-white p-4 shadow-sm" style={staggerStyle(index, 55, 40)}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{item.label}</p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bg}`}>
                <span className={`material-symbols-outlined text-lg ${item.color}`}>{item.icon}</span>
              </div>
            </div>
            <p className="text-2xl font-black tracking-tight text-on-surface">{item.value}</p>
            <p className={`mt-1 text-[10px] font-bold ${item.deltaColor}`}>{item.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Reveal className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm" delay={180}>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {quickActions.map((action, index) => (
                <div key={action.label} className="motion-reveal" style={staggerStyle(index, 60, 240)}>
                  <DashboardFeatureCard
                    eyebrow={action.eyebrow}
                    title={action.label}
                    description={action.sub}
                    to={action.to}
                    cta={action.cta}
                    icon={action.icon}
                    tone={action.tone}
                  />
                </div>
              ))}
            </div>
          </Reveal>

          {unassigned.length > 0 ? (
            <Reveal className="rounded-xl border border-amber-200/60 bg-amber-50 p-5" delay={300}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600">warning</span>
                  <h2 className="text-sm font-bold text-amber-800">{unassigned.length} Course Offerings Without Faculty</h2>
                </div>
                <Link to="/faculty-assignment" className="text-xs font-bold text-amber-700 hover:underline">
                  Assign Now
                </Link>
              </div>
              <div className="space-y-2">
                {unassigned.slice(0, 3).map((offering) => (
                  <div key={offering.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-white px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{offering.subject.name}</p>
                      <p className="font-mono text-[10px] text-on-surface-variant">
                        {offering.subject.code} - {offering.branch.code} Sem {offering.semesterNumber}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700">Unassigned</span>
                  </div>
                ))}
              </div>
            </Reveal>
          ) : null}

          {availableFaculty.length > 0 ? (
            <Reveal className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm" delay={380}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Available Faculty</h2>
                <Link to="/admin/users" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">
                  View Users
                </Link>
              </div>
              <div className="space-y-3">
                {availableFaculty.map((faculty) => (
                  <div key={faculty.email} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                    <InitialsAvatar name={faculty.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{faculty.name}</p>
                      <p className="truncate text-[10px] text-on-surface-variant">{faculty.email}</p>
                    </div>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      faculty.count <= 1 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {faculty.count <= 1 ? 'Free' : `${faculty.count} Courses`}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          ) : null}
        </div>

        <div className="space-y-5">
          <Reveal className="overflow-hidden rounded-xl border border-outline-variant/10 bg-white shadow-sm" delay={220}>
            <div className="flex items-center justify-between border-b border-outline-variant/10 p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Recent Activity</h2>
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
            </div>
            <div className="divide-y divide-outline-variant/10">
              {(dashboard?.recentActivity ?? []).map((item, index) => (
                <div
                  key={`${item.time}-${index}`}
                  className="motion-stagger-row flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-container-low/30"
                  style={staggerStyle(index, 45, 280)}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-sm">{item.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-snug text-on-surface">{item.text}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase text-outline">{item.time}</p>
                  </div>
                </div>
              ))}

              {!isLoading && (dashboard?.recentActivity.length ?? 0) === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-on-surface-variant">No recent activity yet</div>
              ) : null}
            </div>
          </Reveal>

          <Reveal className="rounded-xl border border-outline-variant/10 bg-white p-4 shadow-sm" delay={320}>
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">OUTR Grade Scale</h2>
            <div className="space-y-1.5">
              {[
                ['O', '>=91', '10', 'text-green-700 bg-green-50'],
                ['A', '81-90', '9', 'text-primary bg-primary/10'],
                ['B', '71-80', '8', 'text-secondary bg-secondary/10'],
                ['C', '61-70', '7', 'text-on-surface bg-surface-container'],
                ['F', '<35', '2', 'text-error bg-error-container/30'],
              ].map(([grade, range, points, classes]) => (
                <div key={grade} className="flex items-center justify-between text-xs">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-black ${classes}`}>{grade}</span>
                  <span className="text-on-surface-variant">{range}</span>
                  <span className="font-bold text-on-surface">GP {points}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>

    </PageShell>
  );
}
