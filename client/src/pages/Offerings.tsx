import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, listOfferings as fetchOfferings } from '../lib/api';
import type { OfferingSummary } from '../types/domain';

type OfferingStatus = 'UNASSIGNED' | 'PENDING_SETUP' | 'IN_PROGRESS' | 'COMPLETE' | 'LOCKED' | 'MARKS_ONLY';

const statusConfig: Record<OfferingStatus, { label: string; cls: string }> = {
  UNASSIGNED: { label: 'Unassigned', cls: 'bg-amber-100 text-amber-700' },
  PENDING_SETUP: { label: 'Pending Setup', cls: 'bg-amber-100 text-amber-700' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-primary/10 text-primary' },
  COMPLETE: { label: 'Complete', cls: 'bg-green-100 text-green-700' },
  LOCKED: { label: 'Locked', cls: 'bg-surface-container text-on-surface-variant' },
  MARKS_ONLY: { label: 'Marks Only', cls: 'bg-secondary/10 text-secondary' },
};

const compKeys = ['mid', 'quiz', 'asn', 'att', 'end'] as const;

function getOfferingStatus(offering: OfferingSummary): OfferingStatus {
  if (offering.facultyAssignments.length === 0) {
    return 'UNASSIGNED';
  }

  if (offering.isMarksLocked) {
    return 'LOCKED';
  }

  const progressValues = compKeys.map((key) => offering.marksProgress[key]);
  const allZero = progressValues.every((value) => value === 0);
  const allComplete = progressValues.every((value) => value >= 100);

  if (allComplete) {
    return 'COMPLETE';
  }

  if (offering.subject.type === 'LAB') {
    return allZero ? 'PENDING_SETUP' : 'MARKS_ONLY';
  }

  if (allZero) {
    return 'PENDING_SETUP';
  }

  return 'IN_PROGRESS';
}

function OfferingRow({ offering }: { offering: OfferingSummary }) {
  const status = getOfferingStatus(offering);
  const cfg = statusConfig[status];
  const faculty = offering.facultyAssignments[0]?.user ?? null;
  const initials = faculty ? faculty.name.split(' ').map((word) => word[0]).slice(-2).join('') : '-';
  const overallPct = Math.round(compKeys.reduce((sum, key) => sum + offering.marksProgress[key], 0) / compKeys.length);

  return (
    <tr className="group transition-colors hover:bg-surface-container-low/30">
      <td className="px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-on-surface">{offering.subject.name}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[10px] text-primary">{offering.subject.code}</span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
              offering.subject.type === 'THEORY'
                ? 'bg-surface-container text-on-surface-variant'
                : offering.subject.type === 'LAB'
                  ? 'bg-secondary/10 text-secondary'
                  : 'bg-green-100 text-green-700'
            }`}>
              {offering.subject.type}
            </span>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-sm">
        <span className="font-semibold text-on-surface">{offering.branch.code}</span>
        <span className="text-on-surface-variant"> - Sem {offering.semesterNumber}</span>
      </td>
      <td className="px-5 py-4">
        {faculty ? (
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{initials}</div>
            <span className="text-sm font-medium text-on-surface">{faculty.name}</span>
          </div>
        ) : (
          <span className="text-[10px] font-bold text-error">Unassigned</span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex gap-1">
          {compKeys.map((key) => (
            <div
              key={key}
              title={key.toUpperCase()}
              className={`h-1.5 w-6 rounded-full ${
                offering.marksProgress[key] === 100
                  ? 'bg-green-500'
                  : offering.marksProgress[key] > 0
                    ? 'bg-primary'
                    : 'bg-surface-container-high'
              }`}
            ></div>
          ))}
          <span className="ml-2 text-[10px] font-bold text-on-surface-variant">{overallPct}%</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${cfg.cls}`}>{cfg.label}</span>
      </td>
    </tr>
  );
}

export function Offerings() {
  const [offerings, setOfferings] = useState<OfferingSummary[]>([]);
  const [branch, setBranch] = useState('All');
  const [sem, setSem] = useState('All');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadOfferings = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetchOfferings({ pageSize: 500 });
        if (!active) {
          return;
        }

        setOfferings(response.data);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load offerings right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadOfferings();

    return () => {
      active = false;
    };
  }, []);

  const filtered = offerings.filter((offering) => (
    (branch === 'All' || offering.branch.code === branch)
      && (sem === 'All' || offering.semesterNumber === Number(sem))
      && (
        offering.subject.name.toLowerCase().includes(search.toLowerCase())
        || offering.subject.code.toLowerCase().includes(search.toLowerCase())
      )
  ));

  const stats = useMemo(() => ({
    total: filtered.length,
    unassigned: filtered.filter((offering) => offering.facultyAssignments.length === 0).length,
    inProgress: filtered.filter((offering) => getOfferingStatus(offering) === 'IN_PROGRESS').length,
    complete: filtered.filter((offering) => getOfferingStatus(offering) === 'COMPLETE').length,
  }), [filtered]);

  const branchOptions = ['All', ...Array.from(new Set(offerings.map((offering) => offering.branch.code))).sort()];
  const semesterOptions = ['All', ...Array.from(new Set(offerings.map((offering) => String(offering.semesterNumber)))).sort((a, b) => Number(a) - Number(b))];
  const academicYear = offerings[0]?.academicYear.label ?? 'Current Academic Year';

  return (
    <PageShell>
      <PageHeader
        title="Course Offerings"
        description={`${academicYear} - Semester Grid View`}
        actions={(
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Offering
          </button>
        )}
      />

      {error ? (
        <div className="mb-5 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-3">
        {[
          { label: 'Total', value: stats.total, cls: 'bg-surface-container text-on-surface' },
          { label: 'Unassigned', value: stats.unassigned, cls: 'bg-amber-100 text-amber-700' },
          { label: 'In Progress', value: stats.inProgress, cls: 'bg-primary/10 text-primary' },
          { label: 'Complete', value: stats.complete, cls: 'bg-green-100 text-green-700' },
        ].map((item) => (
          <div key={item.label} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${item.cls}`}>
            <span className="text-base font-black">{item.value}</span>
            {item.label}
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-xl border border-outline-variant/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-40 flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-gray-400">search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search subject or code..."
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mr-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Branch</label>
            <select
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {branchOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mr-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Semester</label>
            <select
              value={sem}
              onChange={(event) => setSem(event.target.value)}
              className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {semesterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {stats.unassigned > 0 ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-3">
          <span className="material-symbols-outlined text-amber-600">warning</span>
          <p className="text-sm font-semibold text-amber-800">
            {stats.unassigned} offering{stats.unassigned > 1 ? 's' : ''} without faculty assignment
          </p>
          <Link to="/faculty-assignment" className="ml-auto text-xs font-bold text-amber-700 hover:underline">
            Assign
          </Link>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant/10 bg-surface-container-low/50">
              {['Subject', 'Branch / Sem', 'Faculty', 'Progress (MID-QZ-ASN-ATT-END)', 'Status'].map((heading) => (
                <th key={heading} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {isLoading ? (
              <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                    Loading offerings...
                  </td>
                </tr>
            ) : filtered.length > 0 ? (
              filtered.map((offering) => <OfferingRow key={offering.id} offering={offering} />)
            ) : (
              <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                    No offerings found
                  </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
