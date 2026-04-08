import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { InitialsAvatar } from './InitialsAvatar';
import { staggerStyle } from './Motion';
import { ApiClientError, listStudents as fetchStudents, peekCachedGet } from '../lib/api';
import type { StudentListResponse, StudentSummary } from '../types/domain';

export type StudentStatus = StudentSummary['status'];

export interface StudentRow {
  id: string;
  registrationNumber: string;
  name: string;
  email?: string | null;
  branch: string;
  semester: number;
  status: StudentStatus;
}

const statusConfig: Record<StudentStatus, { label: string; dot: string; pill: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-green-600', pill: 'bg-green-100 text-green-700' },
  INACTIVE: { label: 'Inactive', dot: 'bg-red-600', pill: 'bg-red-100 text-red-700' },
  GRADUATED: { label: 'Graduated', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-500' },
  DROPPED_OUT: { label: 'Dropped Out', dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-700' },
};

interface StudentTableProps {
  allowedIds?: string[];
  showAddButton?: boolean;
  compact?: boolean;
}

export function StudentTable({ allowedIds, showAddButton = false, compact = false }: StudentTableProps) {
  const cachedStudents = peekCachedGet<StudentListResponse>('/api/v1/students', { status: 'ALL', limit: 5000 });
  const [students, setStudents] = useState<StudentSummary[]>(() => cachedStudents?.data ?? []);
  const [isLoading, setIsLoading] = useState(() => !cachedStudents);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('All');
  const [status, setStatus] = useState<'All' | StudentStatus>('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const perPage = compact ? 5 : 8;

  useEffect(() => {
    let active = true;

    const loadStudents = async () => {
      if (students.length === 0) {
        setIsLoading(true);
      }
      setError('');

      try {
        const response = await fetchStudents({ status: 'ALL', limit: 5000 });
        if (!active) {
          return;
        }

        setStudents(response.data);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load students right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadStudents();

    return () => {
      active = false;
    };
  }, []);

  const visibleStudents = useMemo(() => (
    allowedIds ? students.filter((student) => allowedIds.includes(student.id)) : students
  ), [allowedIds, students]);

  const branches = useMemo(() => (
    ['All', ...Array.from(new Set(visibleStudents.map((student) => student.branch))).sort()]
  ), [visibleStudents]);

  const filtered = visibleStudents.filter((student) => (
    (branch === 'All' || student.branch === branch)
      && (status === 'All' || student.status === status)
      && (
        student.name.toLowerCase().includes(deferredSearch.toLowerCase())
        || student.reg.includes(deferredSearch)
        || (student.email ?? '').toLowerCase().includes(deferredSearch.toLowerCase())
      )
  ));

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [branch, compact, deferredSearch, status]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
      return;
    }

    setSelected(new Set(paginated.map((student) => student.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-48">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or reg no..."
              className="w-full rounded-lg border border-slate-200/80 bg-slate-50 py-2 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>Branch</span>
            <select
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-semibold normal-case text-slate-600 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Branches</option>
              {branches.filter((item) => item !== 'All').map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'All' | StudentStatus)}
              className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-semibold normal-case text-slate-600 outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Status</option>
              {Object.entries(statusConfig).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showAddButton ? (
          <Link to="/admin/upload" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm shadow-primary/20 transition-all hover:opacity-90">
            <span className="material-symbols-outlined text-base">person_add</span>
            Add Student
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="border-b border-error/10 bg-error-container/20 px-6 py-3 text-xs font-semibold text-error">
          {error}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex items-center gap-3 border-b border-primary/10 bg-primary/5 px-6 py-2.5">
          <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-black text-white">{selected.size} SELECTED</span>
          <div className="mx-1 h-4 w-px bg-primary/20" />
          <button className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
            <span className="material-symbols-outlined text-base">file_download</span>
            Export
          </button>
          <button className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-error transition-colors hover:bg-error/5">
            <span className="material-symbols-outlined text-base">delete</span>
            Delete
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className="w-10 px-5 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === paginated.length && paginated.length > 0}
                  onChange={toggleAll}
                  className="cursor-pointer rounded border-slate-300 text-primary focus:ring-primary/20"
                />
              </th>
              {['Reg No.', 'Student', 'Branch', 'Sem', 'Status', ''].map((heading) => (
                <th key={heading} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  Loading students...
                </td>
              </tr>
            ) : paginated.length > 0 ? (
              paginated.map((student, index) => {
                const cfg = statusConfig[student.status];

                return (
                  <tr
                    key={student.id}
                    className="motion-stagger-row group transition-colors hover:bg-slate-50/60"
                    style={staggerStyle(index, 32, 50)}
                  >
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={selected.has(student.id)}
                        onChange={() => toggleOne(student.id)}
                        className="cursor-pointer rounded border-slate-300 text-primary focus:ring-primary/20"
                      />
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-500">{student.reg}</td>
                    <td className="px-5 py-3.5">
                      <Link to={`/students/${student.id}`} className="flex items-center gap-3 transition-colors hover:text-primary">
                        <InitialsAvatar name={student.name} size="sm" />
                        <div>
                          <p className="text-sm font-bold leading-tight text-slate-800">{student.name}</p>
                          {student.email ? <p className="text-[10px] text-slate-400">{student.email}</p> : null}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{student.branch}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-sm font-medium text-slate-600">{student.sem}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${cfg.pill}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link to={`/students/${student.id}`} className="text-slate-400 transition-colors hover:text-primary">
                        <span className="material-symbols-outlined text-xl">more_vert</span>
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  No students found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3.5">
        <p className="text-xs font-medium text-slate-400">
          Showing {filtered.length === 0 ? 0 : Math.min((page - 1) * perPage + 1, filtered.length)}-
          {Math.min(page * perPage, filtered.length)} of {filtered.length} students
        </p>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="p-1 text-slate-400 transition-colors hover:text-primary disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-xl">chevron_left</span>
          </button>

          {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              onClick={() => setPage(value)}
              className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${
                page === value ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              {value}
            </button>
          ))}

          <button
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            className="p-1 text-slate-400 transition-colors hover:text-primary disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-xl">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}
