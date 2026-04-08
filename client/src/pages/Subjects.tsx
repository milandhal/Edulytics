import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { staggerStyle } from '../components/Motion';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, listSubjects as fetchSubjects } from '../lib/api';
import type { SubjectSummary } from '../types/domain';

type SubjectFilter = 'ALL' | SubjectSummary['type'];

const TYPE_CFG: Record<SubjectSummary['type'], { label: string; pill: string }> = {
  THEORY: { label: 'Theory', pill: 'bg-blue-50 text-blue-700 border-blue-100' },
  LAB: { label: 'Lab', pill: 'bg-purple-50 text-purple-700 border-purple-100' },
  HONS_MINOR: { label: 'Hons/Minor', pill: 'bg-amber-50 text-amber-700 border-amber-100' },
  ELECTIVE: { label: 'Elective', pill: 'bg-green-50 text-green-700 border-green-100' },
  ACTIVITY: { label: 'Activity', pill: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function Subjects() {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SubjectFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadSubjects = async () => {
      setIsLoading(true);
      setError('');

      try {
        const data = await fetchSubjects();
        if (!active) {
          return;
        }

        setSubjects(data);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load subjects right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadSubjects();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return subjects.filter((subject) => {
      const matchSearch = !q || subject.code.toLowerCase().includes(q) || subject.name.toLowerCase().includes(q);
      const matchType = typeFilter === 'ALL' || subject.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [search, subjects, typeFilter]);

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Subjects"
        description={`Manage the subject catalogue · ${subjects.length} subjects`}
        actions={(
          <Link
            to="/admin/upload"
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            Bulk Upload
          </Link>
        )}
      />

      {error ? (
        <div className="mb-5 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-slate-600">
        <span className="material-symbols-outlined flex-shrink-0 text-xl text-primary">info</span>
        <span>
          Subjects are <strong>shared templates</strong>. Semester placement and branch usage are driven by live
          <strong> Offerings</strong>, so this page now reflects the current DB state.
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-300">search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by code or name..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex gap-1.5">
          {(['ALL', 'THEORY', 'LAB', 'HONS_MINOR', 'ELECTIVE', 'ACTIVITY'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                typeFilter === type ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-primary/30'
              }`}
            >
              {type === 'ALL'
                ? 'All'
                : type === 'HONS_MINOR'
                  ? 'Hons/Minor'
                  : `${type.charAt(0)}${type.slice(1).toLowerCase()}`}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Code</th>
              <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
              <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
              <th className="px-5 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Credits</th>
              <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Used In</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                  Loading subjects...
                </td>
              </tr>
            ) : filtered.length > 0 ? (
              filtered.map((subject, index) => {
                const typeConfig = TYPE_CFG[subject.type];
                return (
                  <tr
                    key={subject.id}
                    className="motion-stagger-row transition-colors hover:bg-slate-50/40"
                    style={staggerStyle(index, 28, 40)}
                  >
                    <td className="px-5 py-3.5">
                      <span className="rounded bg-primary/8 px-2 py-1 font-mono text-xs font-black text-primary">{subject.code}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-bold text-on-surface">{subject.name}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${typeConfig.pill}`}>{typeConfig.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="text-sm font-bold text-slate-600">{subject.credits}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {subject.usedIn.length === 0 ? (
                        <span className="text-xs text-slate-300">Not assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {subject.usedIn.slice(0, 4).map((usage, index) => (
                            <span key={`${usage.branchCode}-${usage.semester}-${index}`} className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                              {usage.branchCode} · S{usage.semester}
                            </span>
                          ))}
                          {subject.usedIn.length > 4 ? (
                            <span className="text-[9px] font-bold text-slate-400">+{subject.usedIn.length - 4} more</span>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-300">
                  <span className="material-symbols-outlined mb-2 block text-4xl">menu_book</span>
                  No subjects found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
