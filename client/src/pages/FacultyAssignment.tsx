import { useEffect, useMemo, useState } from 'react';
import { PageHeader, PageShell } from '../components/PageShell';
import { InitialsAvatar } from '../components/InitialsAvatar';
import {
  ApiClientError,
  assignOfferingFaculty,
  listAcademicYears,
  listBranches,
  listFacultyUsers,
  listOfferings,
  listPrograms,
  unassignOfferingFaculty,
} from '../lib/api';
import type {
  AcademicYearSummary,
  BranchSummary,
  FacultyUser,
  OfferingSummary,
  ProgramSummary,
} from '../types/domain';

function getPreferredSemester(totalSemesters?: number) {
  if (!totalSemesters) {
    return '6';
  }

  return String(Math.min(6, totalSemesters));
}

export function FacultyAssignment() {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearSummary[]>([]);
  const [faculty, setFaculty] = useState<FacultyUser[]>([]);
  const [offerings, setOfferings] = useState<OfferingSummary[]>([]);
  const [programCode, setProgramCode] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [semester, setSemester] = useState('6');
  const [academicYear, setAcademicYear] = useState('');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [searchFaculty, setSearchFaculty] = useState<Record<string, string>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, string | null>>({});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const selectedProgram = useMemo(
    () => programs.find((program) => program.code === programCode) ?? null,
    [programCode, programs],
  );
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.code === branchCode) ?? null,
    [branchCode, branches],
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setError('');

      try {
        const [programList, facultyList, yearList] = await Promise.all([
          listPrograms(),
          listFacultyUsers({ role: 'FACULTY' }),
          listAcademicYears(),
        ]);

        if (!active) {
          return;
        }

        const activePrograms = programList.filter((program) => program.isActive);
        const activeFaculty = facultyList
          .filter((user) => user.isActive)
          .sort((left, right) => left.name.localeCompare(right.name));
        const sortedYears = [...yearList].sort((left, right) => {
          if (left.isCurrent !== right.isCurrent) {
            return left.isCurrent ? -1 : 1;
          }

          return right.startYear - left.startYear;
        });

        setPrograms(activePrograms);
        setFaculty(activeFaculty);
        setAcademicYears(sortedYears);
        setProgramCode(activePrograms[0]?.code ?? '');
        setAcademicYear(sortedYears.find((item) => item.isCurrent)?.label ?? sortedYears[0]?.label ?? '');
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load assignment data right now.');
        }
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!programCode) {
      setBranches([]);
      setBranchCode('');
      return;
    }

    const loadBranches = async () => {
      try {
        const branchList = await listBranches({ programCode });
        if (!active) {
          return;
        }

        const activeBranches = branchList.filter((branch) => branch.isActive);
        setBranches(activeBranches);
        setBranchCode((current) => {
          const stillValid = activeBranches.some((branch) => branch.code === current);
          return stillValid ? current : activeBranches[0]?.code ?? '';
        });
        setSemester((current) => {
          const matchingBranch = activeBranches.find((branch) => branch.code === branchCode) ?? activeBranches[0];
          if (!matchingBranch) {
            return current;
          }

          if (Number(current) <= matchingBranch.totalSemesters) {
            return current;
          }

          return getPreferredSemester(matchingBranch.totalSemesters);
        });
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load branches right now.');
        }
      }
    };

    void loadBranches();

    return () => {
      active = false;
    };
  }, [branchCode, programCode]);

  useEffect(() => {
    let active = true;

    if (!programCode || !branchCode || !semester || !academicYear) {
      setOfferings([]);
      return;
    }

    const loadOfferings = async () => {
      setIsLoadingOfferings(true);
      setError('');

      try {
        const response = await listOfferings({
          pageSize: 200,
          programCode,
          branchCode,
          semester,
          academicYear,
        });

        if (!active) {
          return;
        }

        setOfferings(response.data);
        setPendingChanges({});
        setSelections({});
        setSearchFaculty({});
        setSaveMessage('');
      } catch (err) {
        if (!active) {
          return;
        }

        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load faculty assignments right now.');
        }
      } finally {
        if (active) {
          setIsLoadingOfferings(false);
        }
      }
    };

    void loadOfferings();

    return () => {
      active = false;
    };
  }, [academicYear, branchCode, programCode, semester]);

  useEffect(() => {
    if (!saveMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSaveMessage(''), 2500);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  const facultyById = useMemo(
    () => new Map(faculty.map((user) => [user.id, user])),
    [faculty],
  );

  const effectiveOfferings = useMemo(() => (
    offerings.map((offering) => {
      const originalFaculty = offering.facultyAssignments[0]?.user ?? null;
      const hasPending = Object.prototype.hasOwnProperty.call(pendingChanges, offering.id);
      const pendingFacultyId = pendingChanges[offering.id];
      const effectiveFaculty = !hasPending
        ? originalFaculty
        : pendingFacultyId
          ? facultyById.get(pendingFacultyId) ?? null
          : null;

      return {
        offering,
        originalFaculty,
        effectiveFaculty,
        hasPending,
      };
    })
  ), [facultyById, offerings, pendingChanges]);

  const unassigned = effectiveOfferings.filter((item) => !item.effectiveFaculty);
  const assigned = effectiveOfferings.filter((item) => item.effectiveFaculty);
  const pendingCount = Object.keys(pendingChanges).length;
  const semesterOptions = useMemo(() => (
    Array.from({ length: selectedBranch?.totalSemesters ?? 8 }, (_, index) => String(index + 1))
  ), [selectedBranch?.totalSemesters]);

  const facultyLoad = useMemo(() => {
    const counts = new Map<string, number>();

    effectiveOfferings.forEach((item) => {
      if (!item.effectiveFaculty) {
        return;
      }

      counts.set(item.effectiveFaculty.id, (counts.get(item.effectiveFaculty.id) ?? 0) + 1);
    });

    return faculty
      .map((user) => ({
        user,
        count: counts.get(user.id) ?? 0,
      }))
      .sort((left, right) => {
        if (left.count !== right.count) {
          return left.count - right.count;
        }

        return left.user.name.localeCompare(right.user.name);
      });
  }, [effectiveOfferings, faculty]);

  const stageAssignment = (offeringId: string) => {
    const selectedFacultyId = selections[offeringId];
    if (!selectedFacultyId) {
      return;
    }

    setPendingChanges((current) => ({
      ...current,
      [offeringId]: selectedFacultyId,
    }));
    setSelections((current) => {
      const next = { ...current };
      delete next[offeringId];
      return next;
    });
  };

  const stageUnassign = (offeringId: string) => {
    setPendingChanges((current) => ({
      ...current,
      [offeringId]: null,
    }));
  };

  const discardChange = (offeringId: string) => {
    setPendingChanges((current) => {
      const next = { ...current };
      delete next[offeringId];
      return next;
    });
  };

  const reloadOfferings = async () => {
    const response = await listOfferings({
      pageSize: 200,
      programCode,
      branchCode,
      semester,
      academicYear,
    });
    setOfferings(response.data);
  };

  const handleSave = async () => {
    if (pendingCount === 0) {
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      for (const item of effectiveOfferings) {
        if (!Object.prototype.hasOwnProperty.call(pendingChanges, item.offering.id)) {
          continue;
        }

        const nextFacultyId = pendingChanges[item.offering.id];
        const currentFacultyId = item.originalFaculty?.id ?? null;

        if (nextFacultyId === currentFacultyId) {
          continue;
        }

        if (nextFacultyId === null) {
          if (currentFacultyId) {
            await unassignOfferingFaculty(item.offering.id, currentFacultyId);
          }
          continue;
        }

        await assignOfferingFaculty(item.offering.id, nextFacultyId);
      }

      await reloadOfferings();
      setPendingChanges({});
      setSaveMessage('Assignments saved.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to save assignment changes.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const headingLabel = selectedBranch
    ? `Course Offerings - ${selectedBranch.code} Sem ${semester}`
    : 'Course Offerings';

  return (
    <PageShell>
      <PageHeader
        title="Faculty Assignment"
        description="Assign faculty members to course offerings per branch and semester."
        actions={(
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={pendingCount === 0 || isSaving || isLoadingOfferings}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg">{isSaving ? 'hourglass_top' : 'save'}</span>
            {isSaving ? 'Saving...' : pendingCount > 0 ? `Save All Changes (${pendingCount})` : 'Save All Changes'}
          </button>
        )}
      />

      {error ? (
        <div className="mb-5 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="mb-5 rounded-xl border border-green-200/60 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {saveMessage}
        </div>
      ) : null}

      <div className="mb-6 rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Filter Offerings</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-on-surface-variant">Program</label>
            <select
              value={programCode}
              onChange={(event) => setProgramCode(event.target.value)}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
              disabled={isBootstrapping}
            >
              {programs.map((program) => (
                <option key={program.id} value={program.code}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-on-surface-variant">Branch</label>
            <select
              value={branchCode}
              onChange={(event) => {
                const nextCode = event.target.value;
                const nextBranch = branches.find((branch) => branch.code === nextCode);
                setBranchCode(nextCode);
                setSemester((current) => (
                  nextBranch && Number(current) > nextBranch.totalSemesters
                    ? getPreferredSemester(nextBranch.totalSemesters)
                    : current
                ));
              }}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
              disabled={!programCode || isBootstrapping}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-on-surface-variant">Semester</label>
            <select
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
              disabled={!selectedBranch}
            >
              {semesterOptions.map((value) => (
                <option key={value} value={value}>
                  Semester {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-on-surface-variant">Academic Year</label>
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
              disabled={isBootstrapping}
            >
              {academicYears.map((item) => (
                <option key={item.id} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-outline-variant/10 p-5">
            <h2 className="text-sm font-bold text-on-surface">{headingLabel}</h2>
            <span className="text-[10px] font-bold text-on-surface-variant">
              {effectiveOfferings.length} courses · {unassigned.length} unassigned
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low/50">
                  {['Subject', 'Code', 'Assigned Faculty', 'Status', ''].map((heading) => (
                    <th key={heading} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {isBootstrapping || isLoadingOfferings ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                      Loading faculty assignments...
                    </td>
                  </tr>
                ) : effectiveOfferings.length > 0 ? (
                  effectiveOfferings.map((item) => {
                    const searchTerm = searchFaculty[item.offering.id]?.toLowerCase() ?? '';
                    const availableFaculty = faculty.filter((person) => (
                      !searchTerm
                      || person.name.toLowerCase().includes(searchTerm)
                      || person.email.toLowerCase().includes(searchTerm)
                    ));

                    return (
                      <tr
                        key={item.offering.id}
                        className={`transition-colors ${
                          item.effectiveFaculty ? 'hover:bg-surface-container-low/30' : 'bg-error-container/10 hover:bg-error-container/20'
                        }`}
                      >
                        <td className="px-5 py-4 font-semibold">{item.offering.subject.name}</td>
                        <td className="px-5 py-4 font-mono text-xs text-primary">{item.offering.subject.code}</td>
                        <td className="px-5 py-4">
                          {item.effectiveFaculty ? (
                            <div className="flex items-center gap-2">
                              <InitialsAvatar name={item.effectiveFaculty.name} size="sm" />
                              <div className="min-w-0">
                                <p className="font-medium text-on-surface">{item.effectiveFaculty.name}</p>
                                <p className="truncate text-[10px] text-on-surface-variant">{item.effectiveFaculty.email}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="w-72">
                              <div className="mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-xs text-on-surface-variant">search</span>
                                <input
                                  type="text"
                                  placeholder="Search Faculty..."
                                  value={searchFaculty[item.offering.id] || ''}
                                  onChange={(event) => setSearchFaculty((current) => ({ ...current, [item.offering.id]: event.target.value }))}
                                  className="w-full border-b border-outline-variant/30 bg-surface-container-low px-2 py-1 text-xs transition-colors focus:border-primary focus:outline-none"
                                />
                              </div>
                              <select
                                value={selections[item.offering.id] || ''}
                                onChange={(event) => setSelections((current) => ({ ...current, [item.offering.id]: event.target.value }))}
                                className="w-full rounded-lg border border-outline-variant/30 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
                              >
                                <option value="">- Select Faculty -</option>
                                {availableFaculty.map((person) => (
                                  <option key={person.id} value={person.id}>
                                    {person.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {item.hasPending ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                              Pending Save
                            </span>
                          ) : item.effectiveFaculty ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-bold uppercase text-green-700">
                              Assigned
                            </span>
                          ) : (
                            <span className="rounded-full bg-error-container px-2 py-0.5 text-[9px] font-bold uppercase text-on-error-container">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {item.effectiveFaculty ? (
                              <button
                                type="button"
                                onClick={() => stageUnassign(item.offering.id)}
                                className="text-xs font-semibold text-error hover:underline"
                              >
                                Unassign
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => stageAssignment(item.offering.id)}
                                disabled={!selections[item.offering.id]}
                                className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                              >
                                Stage Assign
                              </button>
                            )}

                            {item.hasPending ? (
                              <button
                                type="button"
                                onClick={() => discardChange(item.offering.id)}
                                className="text-xs font-semibold text-on-surface-variant hover:underline"
                              >
                                Undo
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                      No offerings found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          {unassigned.length > 0 ? (
            <div className="rounded-xl border border-error/20 bg-error-container/20 p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-error">warning</span>
                <h3 className="text-sm font-bold text-error">
                  {unassigned.length} Unassigned Course{unassigned.length > 1 ? 's' : ''}
                </h3>
              </div>
              <div className="space-y-2">
                {unassigned.map((item) => (
                  <div key={item.offering.id} className="rounded-lg bg-white px-4 py-3">
                    <p className="text-xs font-bold text-on-surface">{item.offering.subject.name}</p>
                    <p className="text-[10px] text-on-surface-variant">{item.offering.subject.code}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-green-200/50 bg-green-50 p-5">
              <span className="material-symbols-outlined text-green-600">check_circle</span>
              <p className="text-sm font-bold text-green-800">All courses assigned!</p>
            </div>
          )}

          <div className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-on-surface">Available Faculty</h3>
            <div className="space-y-3">
              {facultyLoad.slice(0, 6).map(({ user, count }) => (
                <div key={user.id} className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
                  <InitialsAvatar name={user.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-[10px] text-on-surface-variant">{user.designation ?? user.email}</p>
                  </div>
                  <span className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${count === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {count === 0 ? 'Free' : `${count} Course${count > 1 ? 's' : ''}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/10 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-on-surface">Assignment Summary</h3>
            <div className="mb-2 h-2 w-full rounded-full bg-surface-container-high">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: effectiveOfferings.length > 0 ? `${(assigned.length / effectiveOfferings.length) * 100}%` : '0%' }}
              ></div>
            </div>
            <div className="flex justify-between text-xs">
              <span className="font-bold text-green-600">Assigned: {assigned.length}</span>
              <span className="font-bold text-error">Unassigned: {unassigned.length}</span>
            </div>
            {selectedProgram ? (
              <p className="mt-3 text-[11px] text-on-surface-variant">
                {selectedProgram.name} · {selectedBranch?.name ?? 'No branch selected'} · AY {academicYear}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
