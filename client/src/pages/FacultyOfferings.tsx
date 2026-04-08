import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, listMyOfferings as fetchMyOfferings } from '../lib/api';
import type { OfferingSummary } from '../types/domain';

const statusConfig = {
  PENDING_SETUP: { label: 'Pending Setup', pill: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  IN_PROGRESS: { label: 'In Progress', pill: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  MARKS_ONLY: { label: 'Marks Only', pill: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  COMPLETE: { label: 'Complete', pill: 'bg-green-100 text-green-700', dot: 'bg-green-600' },
} as const;

type Status = keyof typeof statusConfig;
type ComponentKey = 'mid' | 'quiz' | 'asn' | 'att' | 'end';

const assessments: Array<{ key: ComponentKey; label: string }> = [
  { key: 'mid', label: 'Mid Semester' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'asn', label: 'Assignment' },
  { key: 'att', label: 'Attendance' },
  { key: 'end', label: 'End Semester' },
];

const iconToneMap: Record<ComponentKey, { bg: string; icon: string }> = {
  mid: { bg: 'bg-gradient-to-br from-sky-50 to-blue-100', icon: 'bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-600 bg-clip-text text-transparent' },
  quiz: { bg: 'bg-gradient-to-br from-violet-50 to-fuchsia-100', icon: 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent' },
  asn: { bg: 'bg-gradient-to-br from-emerald-50 to-lime-100', icon: 'bg-gradient-to-br from-emerald-500 via-lime-400 to-green-500 bg-clip-text text-transparent' },
  att: { bg: 'bg-gradient-to-br from-amber-50 to-orange-100', icon: 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 bg-clip-text text-transparent' },
  end: { bg: 'bg-gradient-to-br from-indigo-50 to-purple-100', icon: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 bg-clip-text text-transparent' },
};

function getStatus(offering: OfferingSummary): Status {
  const progressValues = assessments.map((item) => offering.marksProgress[item.key]);
  const setupKeys = offering.subject.type === 'LAB'
    ? ([] as ComponentKey[])
    : assessments.filter((item) => item.key !== 'att').map((item) => item.key);
  const setupValues = setupKeys.map((key) => offering.setupProgress[key]);
  const allZero = progressValues.every((value) => value === 0);
  const allComplete = progressValues.every((value) => value >= 100);
  const hasAnyProgress = progressValues.some((value) => value > 0);
  const allSetupComplete = setupValues.length > 0 && setupValues.every(Boolean);
  const hasAnySetup = setupValues.some(Boolean);

  if (allComplete) {
    return 'COMPLETE';
  }

  if (offering.subject.type === 'LAB') {
    return allZero ? 'PENDING_SETUP' : 'MARKS_ONLY';
  }

  if (!hasAnySetup) {
    return 'PENDING_SETUP';
  }

  if (allSetupComplete && !hasAnyProgress) {
    return 'MARKS_ONLY';
  }

  return 'IN_PROGRESS';
}

function overallProgress(offering: OfferingSummary) {
  return Math.round(assessments.reduce((sum, item) => sum + offering.marksProgress[item.key], 0) / assessments.length);
}

function OfferingTile({
  offering,
  expanded,
  onToggle,
}: {
  offering: OfferingSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = statusConfig[getStatus(offering)];

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/10 bg-white shadow-sm transition-all hover:shadow-md">
      <div className="cursor-pointer p-5" onClick={onToggle}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-black tracking-widest text-primary">
                {offering.subject.code}
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                {offering.branch.code} - Sem {offering.semesterNumber}
              </span>
            </div>
            <h3 className="truncate text-base font-black leading-snug text-on-surface">{offering.subject.name}</h3>
          </div>

          <span className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        <div className="mb-3">
          <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-400">
            <span>Overall Progress</span>
            <span className="text-primary">{overallProgress(offering)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
              style={{ width: `${overallProgress(offering)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className="material-symbols-outlined text-base bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
            {offering.studentCount} Students
          </span>
          <span className={`material-symbols-outlined text-xl text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-slate-100">
          <div className="bg-slate-50/70 px-4 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Components</p>
          </div>

          <div className="divide-y divide-slate-50">
            {assessments.map((assessment) => {
              const progress = offering.marksProgress[assessment.key];
              const isSetupComponent = assessment.key !== 'att' && offering.subject.type !== 'LAB';

              return (
                <div key={assessment.key} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/60">
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconToneMap[assessment.key].bg}`}>
                    <span className={`material-symbols-outlined text-[16px] ${iconToneMap[assessment.key].icon}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {assessment.key === 'mid' ? 'assignment'
                        : assessment.key === 'quiz' ? 'quiz'
                          : assessment.key === 'asn' ? 'description'
                            : assessment.key === 'att' ? 'event_available'
                              : 'school'}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-on-surface">{assessment.label}</p>
                    <p className="text-[10px] text-slate-400">{progress}% submitted</p>
                  </div>

                  <div className="flex min-w-[260px] flex-wrap items-center justify-end gap-2">
                    {isSetupComponent ? (
                      <Link
                        to={`/offerings/${offering.id}/setup/${assessment.key}`}
                        className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[#651a79] bg-white px-3 text-[10px] font-black text-[#651a79] transition-colors hover:bg-[#651a79]/5"
                      >
                        CO Setup
                      </Link>
                    ) : null}
                    <Link
                      to={`/offerings/${offering.id}/marks/${assessment.key}`}
                      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[#651a79] bg-white px-3 text-[10px] font-black text-[#651a79] transition-colors hover:bg-[#651a79]/5"
                    >
                      Enter Marks
                    </Link>
                    <Link
                      to={`/offerings/${offering.id}/spreadsheet?component=${assessment.key}`}
                      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[#651a79] bg-white px-3 text-[10px] font-black text-[#651a79] transition-colors hover:bg-[#651a79]/5"
                    >
                      Sheet
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FacultyOfferings() {
  const [offerings, setOfferings] = useState<OfferingSummary[]>([]);
  const [filter, setFilter] = useState<Status | 'ALL'>('ALL');
  const [expandedOfferingId, setExpandedOfferingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadOfferings = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetchMyOfferings({ pageSize: 200 });
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
          setError('Unable to load your offerings right now.');
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

  const counts = useMemo(() => ({
    ALL: offerings.length,
    PENDING_SETUP: offerings.filter((offering) => getStatus(offering) === 'PENDING_SETUP').length,
    IN_PROGRESS: offerings.filter((offering) => getStatus(offering) === 'IN_PROGRESS').length,
    MARKS_ONLY: offerings.filter((offering) => getStatus(offering) === 'MARKS_ONLY').length,
    COMPLETE: offerings.filter((offering) => getStatus(offering) === 'COMPLETE').length,
  }), [offerings]);

  const filtered = filter === 'ALL' ? offerings : offerings.filter((offering) => getStatus(offering) === filter);
  const academicYear = offerings[0]?.academicYear.label ?? 'Current Academic Year';

  return (
    <PageShell className="max-w-6xl">
      <PageHeader title="My Offerings" description={`Subjects assigned to you for ${academicYear}.`} />

      {error ? (
        <div className="mb-6 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {([
          ['ALL', 'All', counts.ALL],
          ['PENDING_SETUP', 'Pending Setup', counts.PENDING_SETUP],
          ['IN_PROGRESS', 'In Progress', counts.IN_PROGRESS],
          ['MARKS_ONLY', 'Marks Only', counts.MARKS_ONLY],
          ['COMPLETE', 'Complete', counts.COMPLETE],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition-all ${
              filter === key
                ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
                : 'border-slate-200 bg-white text-slate-500 hover:border-primary/30 hover:text-primary'
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${filter === key ? 'bg-white/20' : 'bg-slate-100'}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-slate-400">
          <span className="material-symbols-outlined mb-2 block text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            auto_stories
          </span>
          <p className="font-semibold">Loading your offerings...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <span className="material-symbols-outlined mb-2 block text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            auto_stories
          </span>
          <p className="font-semibold">No offerings in this category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {filtered.map((offering) => (
            <OfferingTile
              key={offering.id}
              offering={offering}
              expanded={expandedOfferingId === offering.id}
              onToggle={() => setExpandedOfferingId((current) => (current === offering.id ? null : offering.id))}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
