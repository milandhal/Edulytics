import { useEffect, useMemo, useState } from 'react';
import { PageHeader, PageShell } from '../components/PageShell';
import {
  ApiClientError,
  createBranch,
  createProgram,
  deleteBranch,
  deleteProgram,
  listBranches,
  listPrograms,
  listStudents,
} from '../lib/api';
import type { BranchSummary, ProgramSummary, StudentSummary } from '../types/domain';

type ProgramWithBranches = ProgramSummary & {
  branches: Array<BranchSummary & { totalStudents: number }>;
};

function prettyProgramName(program: ProgramSummary) {
  const map: Record<string, string> = {
    BTECH: 'B.Tech',
    MTECH: 'M.Tech',
    MCA: 'MCA',
    MBA: 'MBA',
    MSC: 'M.Sc',
  };

  return map[program.code] ?? program.name;
}

function AddProgramModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (input: { name: string; type: 'UG' | 'PG'; totalSemesters: number }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'UG' | 'PG'>('UG');
  const [totalSemesters, setTotalSemesters] = useState(8);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Program name is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onAdd({ name: name.trim(), type, totalSemesters });
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to create program.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-black text-on-surface">Add Program</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Program Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Bachelor of Technology"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Type</label>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as 'UG' | 'PG')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="UG">UG</option>
                <option value="PG">PG</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Semesters</label>
              <select
                value={totalSemesters}
                onChange={(event) => setTotalSemesters(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {[2, 4, 6, 8, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Program'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddBranchModal({ program, onClose, onAdd }: {
  program: ProgramSummary;
  onClose: () => void;
  onAdd: (input: { programId: string; code: string; name: string }) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError('Branch code and name are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onAdd({
        programId: program.id,
        code: code.trim().toUpperCase(),
        name: name.trim(),
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to create branch.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-black text-on-surface">Add Branch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="mb-5 text-xs text-slate-400">Under <span className="font-semibold text-primary">{prettyProgramName(program)}</span></p>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Branch Code</label>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="e.g. CSE-AI"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Branch Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Computer Science and Engineering (AI/ML)"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Programs() {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddProgram, setShowAddProgram] = useState(false);
  const [addBranchFor, setAddBranchFor] = useState<ProgramSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [programList, branchList, studentList] = await Promise.all([
          listPrograms(),
          listBranches(),
          listStudents({ status: 'ALL', limit: 5000 }),
        ]);

        if (!active) {
          return;
        }

        const activePrograms = programList.filter((program) => program.isActive);
        const activeBranches = branchList.filter((branch) => branch.isActive);

        setPrograms(activePrograms);
        setBranches(activeBranches);
        setStudents(studentList.data);
        setExpanded(activePrograms[0]?.id ?? null);
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load programs right now.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  const studentsByBranch = useMemo(() => {
    const counts = new Map<string, number>();

    students.forEach((student) => {
      counts.set(student.branch, (counts.get(student.branch) ?? 0) + 1);
    });

    return counts;
  }, [students]);

  const programsWithBranches = useMemo<ProgramWithBranches[]>(() => (
    programs.map((program) => ({
      ...program,
      branches: branches
        .filter((branch) => branch.programId === program.id)
        .map((branch) => ({
          ...branch,
          totalStudents: studentsByBranch.get(branch.code) ?? 0,
        }))
        .sort((left, right) => left.code.localeCompare(right.code)),
    }))
  ), [branches, programs, studentsByBranch]);

  const summary = useMemo(() => ({
    programs: programsWithBranches.length,
    branches: programsWithBranches.reduce((sum, program) => sum + program.branches.length, 0),
    students: programsWithBranches.reduce(
      (sum, program) => sum + program.branches.reduce((branchSum, branch) => branchSum + branch.totalStudents, 0),
      0,
    ),
  }), [programsWithBranches]);

  const handleCreateProgram = async (input: { name: string; type: 'UG' | 'PG'; totalSemesters: number }) => {
    const created = await createProgram(input);
    setPrograms((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
    setExpanded(created.id);
  };

  const handleCreateBranch = async (input: { programId: string; code: string; name: string }) => {
    const created = await createBranch(input);
    setBranches((current) => [...current, created].sort((left, right) => left.code.localeCompare(right.code)));
    setExpanded(input.programId);
  };

  const handleDeleteProgram = async (programId: string) => {
    setError('');

    try {
      await deleteProgram(programId);
      setPrograms((current) => current.filter((program) => program.id !== programId));
      setBranches((current) => current.filter((branch) => branch.programId !== programId));
      if (expanded === programId) {
        setExpanded(null);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to delete program.');
      }
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    setError('');

    try {
      await deleteBranch(branchId);
      setBranches((current) => current.filter((branch) => branch.id !== branchId));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to delete branch.');
      }
    }
  };

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Programs & Branches"
        description="Manage academic programs and their branch structure."
        actions={(
          <button
            type="button"
            onClick={() => setShowAddProgram(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-all hover:opacity-90"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Program
          </button>
        )}
      />

      {error ? (
        <div className="mb-5 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: 'Programs', value: summary.programs, icon: 'school', color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Branches', value: summary.branches, icon: 'account_tree', color: 'text-secondary', bg: 'bg-secondary/5' },
          { label: 'Total Students', value: summary.students.toLocaleString(), icon: 'group', color: 'text-green-600', bg: 'bg-green-50' },
        ].map((card) => (
          <div key={card.label} className="flex items-center gap-4 rounded-xl border border-outline-variant/10 bg-white p-4 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.bg}`}>
              <span className={`material-symbols-outlined text-xl ${card.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                {card.icon}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
              <p className="text-2xl font-black text-on-surface leading-tight">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-2xl border border-outline-variant/10 bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
            Loading programs...
          </div>
        ) : programsWithBranches.length > 0 ? (
          programsWithBranches.map((program) => (
            <div key={program.id} className="overflow-hidden rounded-2xl border border-outline-variant/10 bg-white shadow-sm">
              <div
                className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-slate-50/60"
                onClick={() => setExpanded(expanded === program.id ? null : program.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      school
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-on-surface">{prettyProgramName(program)}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                        {program.totalSemesters} Sem
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        {program.type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{program.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-500">{program.branches.length} branches</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteProgram(program.id);
                    }}
                    className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-error/5 hover:text-error"
                    title="Delete program"
                  >
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                  <span className={`material-symbols-outlined text-slate-400 transition-transform ${expanded === program.id ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </div>
              </div>

              {expanded === program.id ? (
                <div className="border-t border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/70">
                        <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Code</th>
                        <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Branch Name</th>
                        <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">Students</th>
                        <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {program.branches.length > 0 ? (
                        program.branches.map((branch) => (
                          <tr key={branch.id} className="group transition-colors hover:bg-slate-50/50">
                            <td className="px-6 py-3.5">
                              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">{branch.code}</span>
                            </td>
                            <td className="px-6 py-3.5 font-semibold text-on-surface">{branch.name}</td>
                            <td className="px-6 py-3.5 text-center text-slate-500">{branch.totalStudents.toLocaleString()}</td>
                            <td className="px-6 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => void handleDeleteBranch(branch.id)}
                                className="opacity-0 text-slate-300 transition-all group-hover:opacity-100 hover:text-error"
                                title="Delete branch"
                              >
                                <span className="material-symbols-outlined text-xl">delete</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400">
                            No branches yet. Add one below.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <div className="border-t border-slate-100 px-6 py-3">
                    <button
                      type="button"
                      onClick={() => setAddBranchFor(program)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/5"
                    >
                      <span className="material-symbols-outlined text-base">add</span>
                      Add Branch to {prettyProgramName(program)}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <span className="material-symbols-outlined mb-3 block text-5xl text-slate-200" style={{ fontVariationSettings: "'FILL' 1" }}>
              school
            </span>
            <p className="font-bold text-slate-400">No programs yet</p>
          </div>
        )}
      </div>

      {showAddProgram ? (
        <AddProgramModal
          onClose={() => setShowAddProgram(false)}
          onAdd={handleCreateProgram}
        />
      ) : null}

      {addBranchFor ? (
        <AddBranchModal
          program={addBranchFor}
          onClose={() => setAddBranchFor(null)}
          onAdd={handleCreateBranch}
        />
      ) : null}
    </PageShell>
  );
}
