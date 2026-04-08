import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageShell';
import { ApiClientError, getCOSetup, getOfferingMarks, getOfferingStudents, saveStudentMarksRequest } from '../lib/api';
import type { COSetupData, MarksEntryStudent } from '../types/domain';

type ComponentKey = 'mid' | 'quiz' | 'asn' | 'att' | 'end';

type Question = {
  id: string;
  label: string;
  maxMarks: number;
  co: string;
  section: string | null;
  groupNumber: number | null;
};

type Section = {
  id: string;
  name: string;
  questions: Question[];
};

type StudentView = {
  id: string;
  regNo: string;
  name: string;
  initials: string;
  done: boolean;
};

type MarksByStudent = Record<string, Record<string, number | null>>;

const validComponents: ComponentKey[] = ['mid', 'quiz', 'asn', 'att', 'end'];

const componentLabel = (component: ComponentKey) =>
  component === 'mid'
    ? 'Mid Semester'
    : component === 'quiz'
      ? 'Quiz'
      : component === 'asn'
        ? 'Assignment'
        : component === 'att'
          ? 'Attendance'
          : 'End Semester';

const sectionTitle = (component: ComponentKey, sectionId: string | null) => {
  if (component === 'mid' || component === 'end') return sectionId === 'B' ? 'Section B' : 'Section A';
  if (component === 'quiz') return 'Quiz';
  if (component === 'asn') return 'Assignment';
  return 'Attendance';
};

const attendanceQuestion: Question = {
  id: 'attendance-score',
  label: 'ATT',
  maxMarks: 5,
  co: 'ATT',
  section: 'MAIN',
  groupNumber: null,
};

const coColorPalette = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
];

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'ST'
  );
}

function toDisplayValue(value: number | null | undefined) {
  return value == null ? '' : String(value);
}

function toNumericValue(value: string | null | undefined) {
  if (value == null) return null;
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isComponentKey(value: string | undefined): value is ComponentKey {
  return value != null && validComponents.includes(value as ComponentKey);
}

function getAttendanceScore(entry?: Record<string, number | null> | { score: number | null }) {
  if (!entry) return null;
  if ('score' in entry) return entry.score;
  return entry[attendanceQuestion.id] ?? null;
}

function buildSections(component: ComponentKey, setup: COSetupData): Section[] {
  if (component === 'att') return [{ id: 'MAIN', name: 'Attendance', questions: [attendanceQuestion] }];

  const coById = new Map((setup.cos ?? []).map((co) => [co.id, co.label]));
  const buckets = new Map<string, Question[]>();

  for (const question of setup.questions ?? []) {
    const bucketId = question.section ?? 'MAIN';
    const list = buckets.get(bucketId) ?? [];
    list.push({
      id: question.id,
      label: question.label,
      maxMarks: Number(question.maxMarks),
      co: coById.get(question.coId ?? '') ?? 'CO?',
      section: question.section,
      groupNumber: question.groupNumber,
    });
    buckets.set(bucketId, list);
  }

  const order = component === 'mid' || component === 'end' ? ['A', 'B'] : ['MAIN'];
  return order
    .filter((sectionId) => buckets.has(sectionId))
    .map((sectionId) => ({
      id: sectionId,
      name: sectionTitle(component, sectionId),
      questions: (buckets.get(sectionId) ?? []).sort(
        (left, right) =>
          (left.groupNumber ?? 0) - (right.groupNumber ?? 0) ||
          left.label.localeCompare(right.label, undefined, { numeric: true }),
      ),
    }));
}

function isStudentDone(component: ComponentKey, sections: Section[], marks: Record<string, number | null>) {
  if (component === 'att') return marks[attendanceQuestion.id] != null;
  if (component !== 'end') return sections.flatMap((section) => section.questions).every((question) => marks[question.id] != null);

  const sectionA = sections.find((section) => section.id === 'A');
  const sectionB = sections.find((section) => section.id === 'B');
  const sectionAComplete = (sectionA?.questions ?? []).every((question) => marks[question.id] != null);
  if (!sectionAComplete) return false;

  const groups = new Map<number, Question[]>();
  for (const question of sectionB?.questions ?? []) {
    const group = question.groupNumber ?? 0;
    groups.set(group, [...(groups.get(group) ?? []), question]);
  }

  return Array.from(groups.values()).every((questions) => questions.filter((question) => marks[question.id] != null).length >= 2);
}

function cappedSectionScore(component: ComponentKey, section: Section, values: Record<string, string>) {
  if (!(component === 'end' && section.id === 'B')) {
    return section.questions.reduce((sum, question) => sum + Math.min(toNumericValue(values[question.id]) ?? 0, question.maxMarks), 0);
  }

  const groups = new Map<number, number[]>();
  for (const question of section.questions) {
    const group = question.groupNumber ?? 0;
    const score = Math.min(toNumericValue(values[question.id]) ?? 0, question.maxMarks);
    groups.set(group, [...(groups.get(group) ?? []), score]);
  }

  return Array.from(groups.values()).reduce((sum, scores) => {
    const topTwo = [...scores].sort((left, right) => right - left).slice(0, 2);
    return sum + topTwo.reduce((groupSum, score) => groupSum + score, 0);
  }, 0);
}

function cappedSectionMax(component: ComponentKey, section: Section) {
  if (!(component === 'end' && section.id === 'B')) {
    return section.questions.reduce((sum, question) => sum + question.maxMarks, 0);
  }

  const groups = new Map<number, number[]>();
  for (const question of section.questions) {
    const group = question.groupNumber ?? 0;
    groups.set(group, [...(groups.get(group) ?? []), question.maxMarks]);
  }

  return Array.from(groups.values()).reduce((sum, marks) => {
    const topTwo = [...marks].sort((left, right) => right - left).slice(0, 2);
    return sum + topTwo.reduce((groupSum, mark) => groupSum + mark, 0);
  }, 0);
}

function seedMarksFromMatrix(
  component: ComponentKey,
  questions: Question[],
  matrixEntry?: Record<string, number | null> | { score: number | null },
) {
  const seeded: Record<string, string> = {};
  if (component === 'att') {
    seeded[attendanceQuestion.id] = toDisplayValue(getAttendanceScore(matrixEntry));
    return seeded;
  }

  for (const question of questions) {
    const value = matrixEntry && !('score' in matrixEntry) ? matrixEntry[question.id] : null;
    seeded[question.id] = toDisplayValue(value);
  }
  return seeded;
}

export function MarksEntryCard() {
  const params = useParams<{ id?: string; offeringId?: string; component?: string }>();
  const offeringId = params.offeringId ?? params.id ?? '';
  const component = isComponentKey(params.component) ? params.component : 'mid';

  const [setup, setSetup] = useState<COSetupData | null>(null);
  const [students, setStudents] = useState<MarksEntryStudent[]>([]);
  const [marksByStudent, setMarksByStudent] = useState<MarksByStudent>({});
  const [studentIndex, setStudentIndex] = useState(0);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completionNotice, setCompletionNotice] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const sections = useMemo(() => buildSections(component, setup ?? { requiresSetup: component === 'att' }), [component, setup]);
  const allQuestions = useMemo(() => sections.flatMap((section) => section.questions), [sections]);

  const coColors = useMemo(() => {
    const labels = Array.from(new Set(allQuestions.map((question) => question.co).filter((co) => co !== 'ATT')));
    return labels.reduce<Record<string, string>>((acc, label, index) => {
      acc[label] = coColorPalette[index % coColorPalette.length];
      return acc;
    }, {});
  }, [allQuestions]);

  const studentViews = useMemo<StudentView[]>(
    () =>
      students.map((student) => ({
        id: student.id,
        regNo: student.registrationNumber,
        name: student.name,
        initials: getInitials(student.name),
        done: isStudentDone(component, sections, marksByStudent[student.id] ?? {}),
      })),
    [component, marksByStudent, sections, students],
  );

  const student = studentViews[studentIndex] ?? null;
  const totalMax = useMemo(() => sections.reduce((sum, section) => sum + cappedSectionMax(component, section), 0), [component, sections]);
  const totalScored = useMemo(() => sections.reduce((sum, section) => sum + cappedSectionScore(component, section, marks), 0), [component, marks, sections]);
  const doneCount = useMemo(() => studentViews.filter((entry) => entry.done).length, [studentViews]);

  const coTotals = useMemo(() => {
    const totals: Record<string, { scored: number; max: number }> = {};
    for (const question of allQuestions) {
      if (question.co === 'ATT') continue;
      if (!totals[question.co]) totals[question.co] = { scored: 0, max: 0 };
      totals[question.co].max += question.maxMarks;
      totals[question.co].scored += Math.min(toNumericValue(marks[question.id]) ?? 0, question.maxMarks);
    }
    return totals;
  }, [allQuestions, marks]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!offeringId) {
        setError('Offering not found.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [setupData, studentData, marksData] = await Promise.all([
          getCOSetup(offeringId, component),
          getOfferingStudents(offeringId),
          getOfferingMarks(offeringId, component),
        ]);

        if (cancelled) return;

        const nextSetup = setupData;
        const nextStudents = studentData.students;
        const nextSections = buildSections(component, nextSetup);
        const nextQuestions = nextSections.flatMap((section) => section.questions);

        const nextMatrix = nextStudents.reduce<MarksByStudent>((acc, currentStudent) => {
          const rawEntry = marksData.marks[currentStudent.id];
          if (component === 'att') {
            acc[currentStudent.id] = { [attendanceQuestion.id]: getAttendanceScore(rawEntry) };
          } else {
            const seeded: Record<string, number | null> = {};
            for (const question of nextQuestions) {
              seeded[question.id] = rawEntry && !('score' in rawEntry) ? rawEntry[question.id] ?? null : null;
            }
            acc[currentStudent.id] = seeded;
          }
          return acc;
        }, {});

        setSetup(nextSetup);
        setStudents(nextStudents);
        setMarksByStudent(nextMatrix);
        setStudentIndex(0);
        setMarks(seedMarksFromMatrix(component, nextQuestions, marksData.marks[nextStudents[0]?.id]));
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof ApiClientError ? loadError.message : 'Unable to load marks entry data.';
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [component, offeringId]);

  useEffect(() => {
    if (!student) return;
    setMarks(seedMarksFromMatrix(component, allQuestions, marksByStudent[student.id]));
    setSaved(false);
    setCompletionNotice('');
  }, [allQuestions, component, marksByStudent, student]);

  useEffect(() => {
    if (studentViews.length === 0) {
      setStudentIndex(0);
      return;
    }

    if (studentIndex > studentViews.length - 1) {
      setStudentIndex(studentViews.length - 1);
    }
  }, [studentIndex, studentViews.length]);

  useEffect(() => {
    if (!loading) inputRefs.current[0]?.focus();
  }, [loading, studentIndex]);

  const setMark = (questionId: string, value: string) => {
    setMarks((prev) => ({ ...prev, [questionId]: value }));
    setSaved(false);
    setCompletionNotice('');
  };

  const fillMax = useCallback((questionId: string, maxMarks: number) => {
    setMarks((prev) => ({ ...prev, [questionId]: String(maxMarks) }));
    setSaved(false);
    setCompletionNotice('');
  }, []);

  const fillAllMax = () => {
    const next: Record<string, string> = {};
    if (component === 'end') {
      for (const section of sections) {
        if (section.id !== 'B') {
          for (const question of section.questions) next[question.id] = String(question.maxMarks);
          continue;
        }

        const groups = new Map<number, Question[]>();
        for (const question of section.questions) {
          const group = question.groupNumber ?? 0;
          groups.set(group, [...(groups.get(group) ?? []), question]);
        }
        for (const questions of groups.values()) {
          questions.forEach((question, index) => {
            next[question.id] = index < 2 ? String(question.maxMarks) : '';
          });
        }
      }
    } else {
      for (const question of allQuestions) next[question.id] = String(question.maxMarks);
    }
    setMarks(next);
    setSaved(false);
    setCompletionNotice('');
  };

  const markZero = () => {
    const next: Record<string, string> = {};
    for (const question of allQuestions) next[question.id] = '0';
    setMarks(next);
    setSaved(false);
    setCompletionNotice('');
  };

  const markAbsent = () => {
    const next: Record<string, string> = {};
    for (const question of allQuestions) next[question.id] = '';
    setMarks(next);
    setSaved(false);
    setCompletionNotice('');
  };

  const goToStudent = (index: number) => {
    setStudentIndex(index);
    setSaved(false);
    setCompletionNotice('');
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const persistCurrentStudent = async () => {
    if (!student) return false;

    setSaving(true);
    setError('');

    try {
      if (component === 'att') {
        const attendanceScore = toNumericValue(marks[attendanceQuestion.id] ?? '');
        await saveStudentMarksRequest(offeringId, component, student.id, { attendanceScore: attendanceScore ?? 0 });
        setMarksByStudent((prev) => ({ ...prev, [student.id]: { [attendanceQuestion.id]: attendanceScore } }));
      } else {
        const payload = allQuestions.reduce<Record<string, number | null>>((acc, question) => {
          acc[question.id] = toNumericValue(marks[question.id] ?? '');
          return acc;
        }, {});

        await saveStudentMarksRequest(offeringId, component, student.id, { marks: payload });
        setMarksByStudent((prev) => ({ ...prev, [student.id]: payload }));
      }

      setSaved(true);
      return true;
    } catch (saveError) {
      const message = saveError instanceof ApiClientError ? saveError.message : 'Unable to save marks.';
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndNext = async () => {
    const success = await persistCurrentStudent();
    if (!success) return;

    if (studentIndex < studentViews.length - 1) {
      setTimeout(() => {
        setStudentIndex((currentIndex) => currentIndex + 1);
        setSaved(false);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }, 250);
      return;
    }

    setCompletionNotice(`${componentLabel(component)} marks saved for all ${studentViews.length} students.`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (index === allQuestions.length - 1) void saveAndNext();
      else inputRefs.current[index + 1]?.focus();
    }
  };

  if (loading) return <div className="px-8 py-10 text-sm text-slate-500">Loading marks entry...</div>;
  if (error && !setup) return <div className="px-8 py-10 text-sm font-semibold text-error">{error}</div>;

  const pageDescription = setup?.offering
    ? `${componentLabel(component)} - ${setup.offering.courseCode} ${setup.offering.courseName} - ${setup.offering.branch} Sem ${setup.offering.sem}`
    : componentLabel(component);

  if (component === 'att') {
    const attendanceValue = marks[attendanceQuestion.id] ?? '';
    const attendanceNumeric = toNumericValue(attendanceValue);

    return (
      <div className="flex h-full overflow-hidden">
        <div className={`flex-shrink-0 transition-all duration-300 ${panelOpen ? 'w-52' : 'w-0 overflow-hidden'}`}>
          <div className="flex h-full flex-col border-r border-slate-100 bg-white">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-3 pb-2 pt-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Students</p>
                <p className="text-[9px] text-slate-400">{doneCount} / {studentViews.length} done</p>
              </div>
              <button onClick={() => setPanelOpen(false)} className="text-slate-300 transition-colors hover:text-slate-500" tabIndex={-1}>
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
              {studentViews.map((entry, index) => (
                <button
                  key={entry.id}
                  onClick={() => goToStudent(index)}
                  tabIndex={-1}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
                    index === studentIndex
                      ? 'bg-primary text-white'
                      : entry.done
                        ? 'border border-green-100 bg-green-50 text-green-700'
                        : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                    index === studentIndex ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {entry.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{entry.name}</p>
                    <p className={`text-[9px] ${index === studentIndex ? 'text-white/60' : 'text-slate-400'}`}>{entry.regNo}</p>
                  </div>
                  {entry.done && index !== studentIndex ? <span className="material-symbols-outlined flex-shrink-0 text-sm text-green-500">check_circle</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Link to="/offerings" className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary" tabIndex={-1}>
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                My Offerings
              </Link>
              {!panelOpen ? (
                <button
                  onClick={() => setPanelOpen(true)}
                  tabIndex={-1}
                  className="flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                  {doneCount}/{studentViews.length}
                </button>
              ) : null}
            </div>

            <PageHeader title="Attendance Entry" description={pageDescription} className="mb-6" />
            {error ? <div className="mb-4 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">{error}</div> : null}
            {completionNotice ? (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
                {completionNotice}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <div className="flex items-center justify-between overflow-hidden rounded-2xl border border-l-4 border-slate-100 border-l-secondary bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-black text-primary">
                      {student?.initials ?? 'ST'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-on-surface">{student?.name ?? 'No students found'}</h2>
                        {student ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black tracking-widest text-slate-400">{student.regNo}</span> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {student ? `Student ${studentIndex + 1} of ${studentViews.length}` : 'No active students for this branch and semester'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Attendance Score</p>
                    <p className="text-3xl font-black leading-none text-secondary">
                      {attendanceNumeric ?? 0}
                      <span className="text-base font-medium text-slate-400">/5</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Attendance</p>
                      <h3 className="mt-1 text-xl font-black text-on-surface">Enter attendance marks out of 5</h3>
                    </div>
                    <button
                      onClick={() => fillMax(attendanceQuestion.id, attendanceQuestion.maxMarks)}
                      tabIndex={-1}
                      className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-700 transition-colors hover:bg-green-100"
                    >
                      Mark Full
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
                    <div className="rounded-2xl bg-primary px-5 py-4 text-center text-white shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/60">ATT</div>
                      <div className="mt-2 text-3xl font-black">{attendanceNumeric ?? '-'}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor="attendance-score-input">
                        Score
                      </label>
                      <input
                        id="attendance-score-input"
                        ref={(element) => {
                          inputRefs.current[0] = element;
                        }}
                        type="number"
                        min={0}
                        max={attendanceQuestion.maxMarks}
                        step={0.5}
                        value={attendanceValue}
                        placeholder="0 - 5"
                        onChange={(event) => setMark(attendanceQuestion.id, event.target.value)}
                        onKeyDown={(event) => handleKeyDown(event, 0)}
                        style={{ MozAppearance: 'textfield' } as CSSProperties}
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-center text-3xl font-black text-on-surface outline-none transition-colors [appearance:textfield] focus:border-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <p className="mt-3 text-sm text-slate-500">Use 0 to 5 marks. Press <span className="font-bold text-slate-700">Enter</span> to save and move to the next student.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (studentIndex > 0) goToStudent(studentIndex - 1);
                    }}
                    disabled={studentIndex === 0}
                    tabIndex={-1}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-base">arrow_back</span>
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      void saveAndNext();
                    }}
                    disabled={!student || saving}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all ${
                      saved
                        ? 'bg-green-500 text-white'
                        : 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20 hover:opacity-90'
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {saved ? (
                      <>
                        <span className="material-symbols-outlined text-base">check</span>
                        Saved!
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
                        {saving ? 'Saving...' : 'Save & Next'}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl bg-primary p-5 text-white shadow-lg shadow-primary/20">
                  <h4 className="mb-1 text-[10px] font-black uppercase tracking-widest opacity-70">Batch Progress</h4>
                  <div className="mb-1 text-3xl font-black">
                    {doneCount}
                    <span className="text-base font-medium opacity-60"> / {studentViews.length}</span>
                  </div>
                  <p className="mb-4 text-xs opacity-60">{Math.max(studentViews.length - doneCount, 0)} students remaining</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white transition-all" style={{ width: `${studentViews.length > 0 ? (doneCount / studentViews.length) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Shortcuts</p>
                  {[
                    ['Tab', 'Next field'],
                    ['Enter', 'Save & next student'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{label}</span>
                      <kbd className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500 shadow-sm">{key}</kbd>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`flex-shrink-0 transition-all duration-300 ${panelOpen ? 'w-52' : 'w-0 overflow-hidden'}`}>
        <div className="flex h-full flex-col border-r border-slate-100 bg-white">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-3 pb-2 pt-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Students</p>
              <p className="text-[9px] text-slate-400">{doneCount} / {studentViews.length} done</p>
            </div>
            <button onClick={() => setPanelOpen(false)} className="text-slate-300 transition-colors hover:text-slate-500" tabIndex={-1}>
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {studentViews.map((entry, index) => (
              <button
                key={entry.id}
                onClick={() => goToStudent(index)}
                tabIndex={-1}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
                  index === studentIndex
                    ? 'bg-primary text-white'
                    : entry.done
                      ? 'border border-green-100 bg-green-50 text-green-700'
                      : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                  index === studentIndex ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {entry.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{entry.name}</p>
                  <p className={`text-[9px] ${index === studentIndex ? 'text-white/60' : 'text-slate-400'}`}>{entry.regNo}</p>
                </div>
                {entry.done && index !== studentIndex ? <span className="material-symbols-outlined flex-shrink-0 text-sm text-green-500">check_circle</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 sm:py-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link to="/offerings" className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary" tabIndex={-1}>
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              My Offerings
            </Link>
            {!panelOpen ? (
              <button
                onClick={() => setPanelOpen(true)}
                tabIndex={-1}
                className="flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                {doneCount}/{studentViews.length}
              </button>
            ) : null}
          </div>

          <PageHeader title="Marks Entry" description={pageDescription} className="mb-6" />
          {error ? <div className="mb-4 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">{error}</div> : null}
          {completionNotice ? (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
              {completionNotice}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              <div className="flex items-center justify-between overflow-hidden rounded-2xl border border-l-4 border-slate-100 border-l-secondary bg-white p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-black text-primary">
                    {student?.initials ?? 'ST'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-on-surface">{student?.name ?? 'No students found'}</h2>
                      {student ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black tracking-widest text-slate-400">{student.regNo}</span> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {student ? `Student ${studentIndex + 1} of ${studentViews.length}` : 'No active students for this branch and semester'}
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Score</p>
                  <p className={`text-3xl font-black leading-none ${totalScored > totalMax ? 'text-error' : 'text-secondary'}`}>
                    {totalScored}
                    <span className="text-base font-medium text-slate-400">/{totalMax}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Quick fill:</span>
                <button onClick={fillAllMax} tabIndex={-1} className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 transition-colors hover:bg-green-100">
                  <span className="material-symbols-outlined text-sm">done_all</span>
                  All Correct
                </button>
                <button onClick={markZero} tabIndex={-1} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200">
                  <span className="material-symbols-outlined text-sm">remove</span>
                  All Zero
                </button>
                <button onClick={markAbsent} tabIndex={-1} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100">
                  <span className="material-symbols-outlined text-sm">person_off</span>
                  Absent
                </button>
                <div className="ml-auto hidden items-center gap-1 text-[10px] text-slate-300 sm:flex">
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-400">Tab</kbd> next -
                  <kbd className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-400">Enter</kbd> save &amp; next
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                {sections.map((section, sectionIndex) => (
                  <div key={section.id}>
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary">[ {section.name.toUpperCase()} ]</span>
                      <span className="text-[10px] text-slate-400">{cappedSectionMax(component, section)} marks</span>
                    </div>

                    <div className="divide-y divide-slate-50">
                      {section.questions.map((question, questionIndex) => {
                        const globalIndex =
                          sections.slice(0, sectionIndex).reduce((count, currentSection) => count + currentSection.questions.length, 0) + questionIndex;
                        const value = marks[question.id] ?? '';
                        const numericValue = toNumericValue(value);
                        const over = numericValue !== null && numericValue > question.maxMarks;
                        const full = numericValue !== null && numericValue === question.maxMarks;

                        return (
                          <div
                            key={question.id}
                            className={`group flex items-center gap-4 px-5 py-3 transition-colors ${
                              over ? 'bg-red-50/60' : full ? 'bg-green-50/40' : 'hover:bg-slate-50/40'
                            }`}
                          >
                            <span className="flex h-8 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
                              {question.label}
                            </span>
                            {question.co !== 'ATT' ? (
                              <span className={`flex-shrink-0 rounded px-2 py-0.5 text-[10px] font-black ${coColors[question.co] ?? 'bg-slate-100 text-slate-500'}`}>
                                {question.co}
                              </span>
                            ) : null}
                            <span className="w-12 flex-shrink-0 text-xs text-slate-400">
                              <span className="block text-[9px] uppercase tracking-widest text-slate-300">max</span>
                              <span className="font-bold text-slate-500">{question.maxMarks}</span>
                            </span>
                            <button
                              onClick={() => fillMax(question.id, question.maxMarks)}
                              tabIndex={-1}
                              title="Fill max"
                              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600 opacity-0 transition-all hover:bg-green-100 group-hover:opacity-100"
                            >
                              <span className="material-symbols-outlined text-sm">check</span>
                            </button>
                            <div className="flex flex-1 justify-end">
                              <input
                                ref={(element) => {
                                  inputRefs.current[globalIndex] = element;
                                }}
                                type="number"
                                min={0}
                                max={question.maxMarks}
                                step={0.5}
                                value={value}
                                placeholder="-"
                                onChange={(event) => setMark(question.id, event.target.value)}
                                onKeyDown={(event) => handleKeyDown(event, globalIndex)}
                                style={{ MozAppearance: 'textfield' } as CSSProperties}
                                className={`w-20 rounded-xl border-2 py-2 text-center text-xl font-black transition-all focus:outline-none
                                  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
                                  ${
                                    over
                                      ? 'border-red-400 bg-red-50 text-red-600'
                                      : full
                                        ? 'border-green-400 bg-green-50 text-green-700'
                                        : 'border-slate-200 bg-slate-50 text-on-surface focus:border-primary focus:bg-white'
                                  }`}
                              />
                            </div>
                            {over ? <span className="flex-shrink-0 text-[9px] font-bold text-red-500">Over!</span> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (studentIndex > 0) goToStudent(studentIndex - 1);
                  }}
                  disabled={studentIndex === 0}
                  tabIndex={-1}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Previous
                </button>
                <button
                  onClick={() => {
                    void saveAndNext();
                  }}
                  disabled={!student || saving}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-black transition-all ${
                    saved
                      ? 'bg-green-500 text-white'
                      : 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20 hover:opacity-90'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {saved ? (
                    <>
                      <span className="material-symbols-outlined text-base">check</span>
                      Saved!
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
                      {saving ? 'Saving...' : 'Save & Next'}
                      {!saving ? <span className="ml-1 text-xs opacity-60">(Enter)</span> : null}
                    </>
                  )}
                </button>
              </div>
            </div>

            <aside className="space-y-4 lg:col-span-4">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-500">CO Score - This Student</h3>
                <div className="space-y-3">
                  {Object.entries(coTotals).map(([co, totals]) => {
                    const pct = totals.max > 0 ? (totals.scored / totals.max) * 100 : 0;
                    return (
                      <div key={co}>
                        <div className="mb-1 flex justify-between text-xs font-bold">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-black ${coColors[co] ?? 'bg-slate-100 text-slate-500'}`}>{co}</span>
                          <span className="text-slate-600">{totals.scored} / {totals.max}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 50 ? 'bg-green-500' : 'bg-amber-400'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(coTotals).length === 0 ? <p className="text-xs text-slate-400">No mapped CO data available for this component.</p> : null}
                </div>
              </div>

              <div className="rounded-2xl bg-primary p-5 text-white shadow-lg shadow-primary/20">
                <h4 className="mb-1 text-[10px] font-black uppercase tracking-widest opacity-70">Batch Progress</h4>
                <div className="mb-1 text-3xl font-black">
                  {doneCount}
                  <span className="text-base font-medium opacity-60"> / {studentViews.length}</span>
                </div>
                <p className="mb-4 text-xs opacity-60">{Math.max(studentViews.length - doneCount, 0)} students remaining</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${studentViews.length > 0 ? (doneCount / studentViews.length) * 100 : 0}%` }} />
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Keyboard Shortcuts</p>
                {[
                  ['Tab', 'Next question'],
                  ['Shift+Tab', 'Previous question'],
                  ['Enter', 'Save & next student'],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{label}</span>
                    <kbd className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500 shadow-sm">{key}</kbd>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
