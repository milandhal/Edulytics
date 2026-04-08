import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, getFacultyDashboard, listMyOfferings } from '../lib/api';
import type { OfferingSummary, TeacherDashboardData } from '../types/domain';

const compKeys = ['mid', 'quiz', 'asn', 'att', 'end'] as const;

function overallProgress(offering: OfferingSummary) {
  return Math.round(compKeys.reduce((sum, key) => sum + offering.marksProgress[key], 0) / compKeys.length);
}

function pendingComponents(offering: OfferingSummary) {
  return compKeys.filter((key) => offering.marksProgress[key] < 100).length;
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: string;
  tone: 'primary' | 'secondary' | 'warning';
}) {
  const toneMap = {
    primary: { icon: 'bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-600 bg-clip-text text-transparent', bg: 'bg-gradient-to-br from-sky-50 to-blue-100' },
    secondary: { icon: 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent', bg: 'bg-gradient-to-br from-violet-50 to-pink-100' },
    warning: { icon: 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 bg-clip-text text-transparent', bg: 'bg-gradient-to-br from-amber-50 to-rose-100' },
  } as const;

  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneMap[tone].bg}`}>
          <span className={`material-symbols-outlined text-base ${toneMap[tone].icon}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black text-on-surface">{value}</p>
      <p className="mt-1 text-[10px] font-bold text-on-surface-variant">{sub}</p>
    </div>
  );
}

function OfferingCard({ offering }: { offering: OfferingSummary }) {
  const pct = overallProgress(offering);
  const isLab = offering.subject.type === 'LAB';

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-outline-variant/10 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-lg font-black leading-tight text-on-surface">{offering.subject.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="font-mono text-[10px] font-bold text-primary">{offering.subject.code}</code>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
              isLab ? 'bg-secondary/10 text-secondary' : 'bg-surface-container text-on-surface-variant'
            }`}>
              {offering.subject.type}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {offering.branch.code} · Sem {offering.semesterNumber}
            </span>
          </div>
        </div>

        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e9ecef" strokeWidth="3.2" />
            <circle
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke="#3056b5"
              strokeWidth="3.2"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-black text-primary">{pct}%</span>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Marks Progress</p>
        <div className="grid grid-cols-5 gap-3">
          {compKeys.map((key) => (
            <div key={key}>
              <div className="mb-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    key === 'mid' ? 'bg-primary'
                      : key === 'quiz' ? 'bg-green-500'
                        : key === 'asn' ? 'bg-secondary'
                          : key === 'att' ? 'bg-amber-400'
                            : 'bg-error'
                  }`}
                  style={{ width: `${offering.marksProgress[key]}%` }}
                />
              </div>
              <p className="text-center text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">{key}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`mt-auto grid gap-3 pt-1 ${isLab ? 'grid-cols-[1.6fr_1fr]' : 'grid-cols-3'}`}>
        {!isLab ? (
          <Link
            to={`/offerings/${offering.id}/setup/mid`}
            className="flex h-11 items-center justify-center rounded-xl border border-[#651a79] bg-white px-3 text-sm font-bold text-[#651a79] transition-colors hover:bg-[#651a79]/5"
          >
            CO Setup
          </Link>
        ) : null}

        <Link
          to={`/offerings/${offering.id}/marks/mid`}
          className="flex h-11 items-center justify-center rounded-xl border border-[#651a79] bg-white px-3 text-sm font-bold text-[#651a79] transition-colors hover:bg-[#651a79]/5"
        >
          Enter Marks
        </Link>

        <Link
          to={`/offerings/${offering.id}/spreadsheet`}
          className="flex h-11 items-center justify-center rounded-xl border border-[#651a79] bg-white px-3 text-sm font-bold text-[#651a79] transition-colors hover:bg-[#651a79]/5"
        >
          Sheet
        </Link>
      </div>
    </div>
  );
}

export function FacultyDashboard() {
  const [dashboard, setDashboard] = useState<TeacherDashboardData | null>(null);
  const [offerings, setOfferings] = useState<OfferingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [dashboardData, offeringsResponse] = await Promise.all([
          getFacultyDashboard(),
          listMyOfferings({ pageSize: 200 }),
        ]);

        if (!active) return;

        setDashboard(dashboardData);
        setOfferings(offeringsResponse.data);
      } catch (err) {
        if (!active) return;

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load faculty dashboard right now.');
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

  const totalPending = useMemo(
    () => offerings.reduce((sum, offering) => sum + pendingComponents(offering), 0),
    [offerings],
  );

  const totalStudents = dashboard?.totalStudents ?? 0;

  return (
    <PageShell>
      <PageHeader
        title="Faculty Dashboard"
        description="A cleaner overview of your subjects, pending work, and the next actions that matter."
        actions={totalPending > 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-xs font-bold text-amber-700">{totalPending} components pending</span>
          </div>
        ) : undefined}
      />

      {error ? (
        <div className="mb-6 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="My Subjects"
          value={offerings.length}
          sub="Subjects assigned this term"
          icon="menu_book"
          tone="primary"
        />
        <StatCard
          label="Total Students"
          value={totalStudents}
          sub="Students across your current offerings"
          icon="group"
          tone="secondary"
        />
        <StatCard
          label="Pending Components"
          value={totalPending}
          sub={totalPending > 0 ? 'Marks still waiting to be completed' : 'Everything is up to date'}
          icon="assignment_late"
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="material-symbols-outlined text-base text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                menu_book
              </span>
              My Assigned Subjects
            </h2>
            <Link to="/offerings" className="text-xs font-bold uppercase tracking-widest text-primary hover:underline">
              View All
            </Link>
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-outline-variant/10 bg-white px-6 py-10 text-center text-sm text-on-surface-variant shadow-sm">
              Loading assigned offerings...
            </div>
          ) : offerings.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {offerings.map((offering) => (
                <OfferingCard key={offering.id} offering={offering} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-outline-variant/10 bg-white px-6 py-10 text-center text-sm text-on-surface-variant shadow-sm">
              No offerings assigned yet
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-white shadow-sm">
            <div className="border-b border-outline-variant/10 px-4 py-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Marks Status</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low/50">
                  <th className="px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Subject</th>
                  {['MID', 'QZ', 'ASN', 'ATT', 'END'].map((label) => (
                    <th key={label} className="px-2 py-2 text-center text-[9px] font-bold text-on-surface-variant">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {offerings.map((offering) => (
                  <tr key={offering.id} className="hover:bg-surface-container-low/20">
                    <td className="px-4 py-2 font-bold text-on-surface">{offering.subject.code}</td>
                    {compKeys.map((key) => {
                      const value = offering.marksProgress[key];

                      return (
                        <td key={key} className="px-2 py-2 text-center">
                          <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                            value === 100 ? 'bg-green-100 text-green-700' : value > 0 ? 'bg-primary/10 text-primary' : 'bg-surface-container text-outline'
                          }`}>
                            {value === 100 ? 'Done' : '-'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-outline-variant/10 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Quick Links</h3>
            <div className="space-y-2">
              <Link to="/offerings" className="flex items-center justify-between rounded-lg border border-outline-variant/10 px-3 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low">
                View My Offerings
                <span className="material-symbols-outlined text-base text-primary">arrow_forward</span>
              </Link>
              <Link to="/analytics" className="flex items-center justify-between rounded-lg border border-outline-variant/10 px-3 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-low">
                Open Analytics
                <span className="material-symbols-outlined text-base text-primary">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
