import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiClientError, downloadComponentSpreadsheet, downloadOfferingSpreadsheet, getCOSetup, getOfferingMarks, getOfferingStudents } from '../lib/api';
import type { COSetupData, MarksEntryStudent, MarksMatrixResponse } from '../types/domain';

type ComponentKey = 'mid' | 'quiz' | 'asn' | 'att' | 'end';

type Question = {
  id: string;
  label: string;
  maxMarks: number;
  coLabel: string;
  section: string | null;
  groupNumber: number | null;
};

type SheetData = {
  setup: COSetupData;
  questions: Question[];
  marks: MarksMatrixResponse['marks'];
};

const tabs: Array<{ key: ComponentKey; label: string }> = [
  { key: 'mid', label: 'Mid Semester' },
  { key: 'quiz', label: 'Quiz Test' },
  { key: 'asn', label: 'Assignment' },
  { key: 'att', label: 'Attendance' },
  { key: 'end', label: 'End Sem' },
];

const defaultThresholds = { level1: 60, level2: 65, level3: 70 };

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : value == null ? null : Number(value);
  return parsed == null || Number.isNaN(parsed) ? null : parsed;
};

const formatMark = (value: number | null) => {
  if (value == null) return '';
  return Number.isInteger(value) ? value.toFixed(1) : String(Number(value.toFixed(2)));
};

const getLetters = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    let current = index;
    let value = '';
    do {
      value = String.fromCharCode(65 + (current % 26)) + value;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);
    return value;
  });

function buildAttendanceCoDistribution(score: number, labels: string[]) {
  const distribution = Object.fromEntries(labels.map((label) => [label, 0])) as Record<string, number>;
  if (labels.length === 0) return distribution;

  const normalizedScore = Math.max(0, score);
  const wholeMarks = Math.floor(normalizedScore);
  const remainder = Number((normalizedScore - wholeMarks).toFixed(2));
  const baseShare = Math.floor(wholeMarks / labels.length);
  const extraWholeMarks = wholeMarks % labels.length;

  labels.forEach((label) => {
    distribution[label] = baseShare;
  });

  labels.slice(0, extraWholeMarks).forEach((label) => {
    distribution[label] += 1;
  });

  if (remainder > 0) {
    distribution[labels[extraWholeMarks % labels.length]] += remainder;
  }

  return distribution;
}

function buildQuestions(component: ComponentKey, setup: COSetupData) {
  if (component === 'att') {
    return [{ id: 'attendance-score', label: 'Attendance', maxMarks: 5, coLabel: '', section: 'MAIN', groupNumber: null }];
  }

  const coById = new Map((setup.cos ?? []).map((co) => [co.id, co.label]));
  return (setup.questions ?? [])
    .map((question) => ({
      id: question.id,
      label: question.label,
      maxMarks: Number(question.maxMarks),
      coLabel: coById.get(question.coId ?? '') ?? 'CO?',
      section: question.section,
      groupNumber: question.groupNumber,
    }))
    .sort((left, right) => {
      const sectionRank = `${left.section ?? 'MAIN'}-${left.groupNumber ?? 0}-${left.label}`;
      const otherRank = `${right.section ?? 'MAIN'}-${right.groupNumber ?? 0}-${right.label}`;
      return sectionRank.localeCompare(otherRank, undefined, { numeric: true });
    });
}

function buildMarkMap(component: ComponentKey, questions: Question[], rawMarks: MarksMatrixResponse['marks'], studentId: string) {
  const entry = rawMarks[studentId];
  if (component === 'att') {
    const score = entry && 'score' in entry ? entry.score : null;
    return { 'attendance-score': toNumber(score) };
  }

  const values: Record<string, number | null> = {};
  for (const question of questions) {
    values[question.id] = entry && !('score' in entry) ? toNumber(entry[question.id]) : null;
  }
  return values;
}

function computeTotal(component: ComponentKey, questions: Question[], values: Record<string, number | null>) {
  if (component !== 'end') {
    return questions.reduce((sum, question) => sum + (values[question.id] ?? 0), 0);
  }

  const sectionA = questions.filter((question) => question.section !== 'B');
  const sectionB = questions.filter((question) => question.section === 'B');
  const groupMap = new Map<number, number[]>();

  for (const question of sectionB) {
    const key = question.groupNumber ?? 0;
    groupMap.set(key, [...(groupMap.get(key) ?? []), values[question.id] ?? 0]);
  }

  return (
    sectionA.reduce((sum, question) => sum + (values[question.id] ?? 0), 0) +
    Array.from(groupMap.values()).reduce((sum, scores) => sum + scores.sort((a, b) => b - a).slice(0, 2).reduce((groupSum, score) => groupSum + score, 0), 0)
  );
}

function computeComponentMax(component: ComponentKey, questions: Question[]) {
  return computeTotal(
    component,
    questions,
    questions.reduce<Record<string, number>>((acc, question) => {
      acc[question.id] = question.maxMarks;
      return acc;
    }, {}),
  );
}

function buildCoStats(
  component: ComponentKey,
  questions: Question[],
  students: MarksEntryStudent[],
  marks: MarksMatrixResponse['marks'],
  cos: Array<{ label: string }> = [],
) {
  const questionLabels = Array.from(new Set(questions.map((question) => question.coLabel).filter(Boolean)));
  const labels = questionLabels.length > 0 ? questionLabels : (cos.map((co) => co.label).length > 0 ? cos.map((co) => co.label) : ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']);
  const max: Record<string, number> = Object.fromEntries(labels.map((label) => [label, 0]));
  const totalsByStudent: Record<string, Record<string, number>> = {};

  if (component === 'att') {
    const maxDistribution = buildAttendanceCoDistribution(5, labels);
    labels.forEach((label) => {
      max[label] = maxDistribution[label] ?? 0;
    });

    for (const student of students) {
      const values = buildMarkMap(component, questions, marks, student.id);
      const score = values['attendance-score'] ?? 0;
      totalsByStudent[student.id] = buildAttendanceCoDistribution(score, labels);
    }

    return { labels, max, totalsByStudent };
  }

  for (const question of questions) {
    if (question.coLabel) max[question.coLabel] = (max[question.coLabel] ?? 0) + question.maxMarks;
  }

  for (const student of students) {
    const values = buildMarkMap(component, questions, marks, student.id);
    totalsByStudent[student.id] = Object.fromEntries(labels.map((label) => [label, 0]));
    for (const question of questions) {
      if (!question.coLabel) continue;
      totalsByStudent[student.id][question.coLabel] += values[question.id] ?? 0;
    }
  }

  return { labels, max, totalsByStudent };
}

export function MarksEntrySpreadsheet() {
  const { id: offeringId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = (searchParams.get('component') as ComponentKey) || 'mid';

  const [students, setStudents] = useState<MarksEntryStudent[]>([]);
  const [sheets, setSheets] = useState<Partial<Record<ComponentKey, SheetData>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'current' | 'all' | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [showHint, setShowHint] = useState(true);

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!offeringId) {
      setError('Offering not found.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError('');

      const [studentData, ...componentData] = await Promise.all([
        getOfferingStudents(offeringId),
        ...tabs.map(async (tab) => {
          const [setup, marks] = await Promise.all([
            getCOSetup(offeringId, tab.key),
            getOfferingMarks(offeringId, tab.key),
          ]);
          return [tab.key, { setup, questions: buildQuestions(tab.key, setup), marks: marks.marks }] as const;
        }),
      ]);

      setStudents(studentData.students);
      setSheets(Object.fromEntries(componentData));
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (loadError) {
      const message = loadError instanceof ApiClientError ? loadError.message : 'Unable to load spreadsheet data.';
      setError(message);
    } finally {
      if (mode === 'initial') setLoading(false);
      else setRefreshing(false);
    }
  }, [offeringId]);

  useEffect(() => {
    void loadData('initial');
  }, [loadData]);

  useEffect(() => {
    if (!offeringId) return;
    const key = `spars_sheet_hint_dismissed:${offeringId}`;
    setShowHint(localStorage.getItem(key) !== 'true');
  }, [offeringId]);

  const currentSheet = sheets[active];
  const questions = currentSheet?.questions ?? [];
  const setup = currentSheet?.setup;
  const marks = currentSheet?.marks ?? {};
  const componentMax = useMemo(() => computeComponentMax(active, questions), [active, questions]);
  const coStats = useMemo(() => buildCoStats(active, questions, students, marks, setup?.cos ?? []), [active, marks, questions, setup?.cos, students]);
  const totals = useMemo(
    () =>
      students.map((student) => {
        const values = buildMarkMap(active, questions, marks, student.id);
        return computeTotal(active, questions, values);
      }),
    [active, marks, questions, students],
  );

  const averageScore = totals.length ? (totals.reduce((sum, total) => sum + total, 0) / totals.length).toFixed(1) : '0.0';
  const completedStudents = students.filter((student) => computeTotal(active, questions, buildMarkMap(active, questions, marks, student.id)) > 0).length;

  const attainment = useMemo(() => {
    return coStats.labels.map((label) => {
      const threshold = (coStats.max[label] ?? 0) * 0.5;
      const above = students.filter((student) => (coStats.totalsByStudent[student.id]?.[label] ?? 0) > threshold).length;
      const percentage = students.length ? (above / students.length) * 100 : 0;
      const level = percentage >= defaultThresholds.level3 ? 3 : percentage >= defaultThresholds.level2 ? 2 : percentage >= defaultThresholds.level1 ? 1 : 0;
      return { label, above, percentage, level };
    });
  }, [coStats, students]);
  const attainmentTotals = useMemo(() => {
    const threshold = componentMax * 0.5;
    const above = totals.filter((total) => total > threshold).length;
    const percentage = students.length ? (above / students.length) * 100 : 0;
    const level = percentage >= defaultThresholds.level3 ? 3 : percentage >= defaultThresholds.level2 ? 2 : percentage >= defaultThresholds.level1 ? 1 : 0;
    return { above, percentage, level };
  }, [componentMax, students.length, totals]);

  const isMidSheet = active === 'mid';
  const isDetailedSheet = active === 'mid' || active === 'end';
  const detailedMetaCols = 5;
  const detailedColumnCount = isDetailedSheet
    ? questions.length + coStats.labels.length + detailedMetaCols + 1
    : coStats.labels.length + 7;
  const letters = getLetters(Math.max(detailedColumnCount, 22));
  const metadataTitleCols = 4;
  const metadataRightCols = 5;
  const metadataSpacerCols = Math.max(letters.length - metadataTitleCols - metadataRightCols, 1);
  const pageTitle = setup?.offering
    ? `${setup.offering.courseCode} - ${setup.offering.courseName}`
    : 'Spreadsheet View';

  const handleDownload = useCallback(async (mode: 'current' | 'all') => {
    if (!offeringId) return;

    setExporting(mode);
    setError('');
    try {
      const file = mode === 'current'
        ? await downloadComponentSpreadsheet(offeringId, active)
        : await downloadOfferingSpreadsheet(offeringId);
      const href = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (downloadError) {
      setError(downloadError instanceof ApiClientError ? downloadError.message : 'Unable to export spreadsheet right now.');
    } finally {
      setExporting(null);
    }
  }, [active, offeringId]);

  if (loading) return <div className="px-8 py-10 text-sm text-slate-500">Loading spreadsheet...</div>;
  if (error && !currentSheet) return <div className="px-8 py-10 text-sm font-semibold text-error">{error}</div>;

  const goToMarks = () => navigate(`/offerings/${offeringId}/marks/${active}`);
  const goToSetup = () => navigate(`/offerings/${offeringId}/setup/${active}`);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)]">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link to="/offerings" className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 hover:text-primary">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              My Offerings
            </Link>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <p className="text-[13px] font-black tracking-tight text-on-surface">{pageTitle}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {setup?.offering?.branch} Sem {setup?.offering?.sem} · {students.length} students · synced {updatedAt || '--:--'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
              Spreadsheet is read-only
            </span>
            <button
              onClick={() => {
                void handleDownload('current');
              }}
              disabled={exporting !== null}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === 'current' ? 'Exporting current...' : 'Export current sheet'}
            </button>
            <button
              onClick={() => {
                void handleDownload('all');
              }}
              disabled={exporting !== null}
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting === 'all' ? 'Exporting workbook...' : 'Export all sheets'}
            </button>
            <button onClick={goToMarks} className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-[11px] font-black text-primary transition-colors hover:bg-primary/10">
              Edit student marks
            </button>
            <button onClick={goToSetup} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black text-slate-600 transition-colors hover:bg-slate-50">
              Edit exam setup
            </button>
            <button
              onClick={() => {
                void loadData('refresh');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black text-slate-600 transition-colors hover:bg-slate-50"
            >
              <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/70 px-6">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSearchParams({ component: tab.key })}
                className={`border-b-2 px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
                  active === tab.key ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:flex">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
            Manual refresh
          </div>
        </div>
      </div>

      {showHint ? (
        <div className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50/80 px-6 py-2 text-[11px] text-amber-800">
          <p className="min-w-0">
            This sheet is read-only. Use refresh after updating marks or CO setup if you want the latest snapshot here.
          </p>
          <button
            onClick={() => {
              if (!offeringId) return;
              const key = `spars_sheet_hint_dismissed:${offeringId}`;
              localStorage.setItem(key, 'true');
              setShowHint(false);
            }}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-amber-700/70 transition-colors hover:bg-amber-100 hover:text-amber-900"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto">
        <div className="min-w-max px-6 py-6">
          <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(48,86,181,0.07)]" style={{ fontFamily: "'Aptos', 'Calibri', 'Segoe UI', sans-serif" }}>
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-2 font-mono text-[10px] text-slate-500">
              <span className="mr-4 font-bold text-primary">A1</span>
              {tabs.find((tab) => tab.key === active)?.label} · {setup?.offering?.courseCode} · Read-only sheet view
            </div>

            <div className="overflow-auto">
              <table className="border-collapse text-[11px] text-slate-700">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[44px] border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-400" />
                    {letters.map((letter) => (
                      <th key={letter} className="min-w-[58px] border border-slate-200 bg-slate-100 px-2 py-1 text-center font-mono text-[10px] text-slate-400">
                        {letter}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">1</td>
                    <td colSpan={metadataTitleCols} className="border border-slate-200 bg-white px-3 py-2 text-center text-[13px] font-black text-on-surface">OUTR</td>
                    <td colSpan={metadataSpacerCols} className="border border-slate-200 bg-white px-3 py-2" />
                    <td colSpan={2} className="border border-slate-200 bg-slate-100 px-3 py-2 text-center font-bold text-slate-700">Attainment Level</td>
                    <td colSpan={3} className="border border-slate-200 bg-slate-100 px-3 py-2 text-center font-bold text-slate-700">Description</td>
                  </tr>
                  {[1, 2, 3].map((level, index) => (
                    <tr key={level}>
                      <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">{index + 2}</td>
                      <td colSpan={metadataTitleCols} className="border border-slate-200 bg-white px-3 py-2 text-center text-[11px] text-slate-600">
                        {index === 0 ? setup?.offering?.branchName : index === 1 ? `${setup?.offering?.courseCode}: ${setup?.offering?.courseName}` : `Sem-${setup?.offering?.sem}, ${setup?.offering?.branch}`}
                      </td>
                      <td colSpan={metadataSpacerCols} className="border border-slate-200 bg-white px-3 py-2" />
                      <td colSpan={2} className="border border-slate-200 bg-white px-3 py-2 text-center font-black text-primary">{level}</td>
                      <td colSpan={3} className="border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                        {level === 1 ? `${defaultThresholds.level1}% students scored more than 50%` : level === 2 ? `${defaultThresholds.level2}% students scored more than 50%` : `${defaultThresholds.level3}% students scored more than 50%`}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">5</td>
                    <td colSpan={metadataTitleCols} className="border border-slate-200 bg-white px-3 py-2" />
                    <td colSpan={metadataSpacerCols} className="border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-black text-slate-700">
                      {isDetailedSheet ? 'all questions are compulsory' : ''}
                    </td>
                    <td colSpan={2} className="border border-slate-200 bg-white px-3 py-2" />
                    <td colSpan={3} className="border border-slate-200 bg-white px-3 py-2" />
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">6</td>
                    {isDetailedSheet ? (
                      <>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">SL NO</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">NAME</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">REGNO</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">SUBJECT CODE</td>
                        {isMidSheet ? (
                          <td className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">QNo</td>
                        ) : (
                          <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">QNo</td>
                        )}
                        {questions.map((question) => (
                          <td key={question.id} className="border border-slate-200 bg-[#2c3442] px-3 py-2 text-center font-black text-white">{question.label}</td>
                        ))}
                        <td colSpan={coStats.labels.length + 1} className="border border-primary/20 bg-slate-100 px-3 py-2 text-center font-black text-slate-700">MARK ANALYSIS</td>
                      </>
                    ) : (
                      <>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">SL NO</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">NAME OF THE STUDENT</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">REGD. NO.</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">SUBJECT CODE</td>
                        <td rowSpan={3} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center font-black text-white">MARKS ({componentMax})</td>
                        <td colSpan={coStats.labels.length} className="border border-primary/20 bg-slate-100 px-3 py-2 text-center font-black text-slate-700">
                          {tabs.find((tab) => tab.key === active)?.label?.toUpperCase()}
                        </td>
                      </>
                    )}
                  </tr>
                  {isDetailedSheet ? (
                    <>
                    <tr>
                      <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">7</td>
                        {isMidSheet ? (
                          <td className="border border-slate-200 bg-white px-3 py-2 text-center font-black text-slate-500">CO</td>
                        ) : null}
                        {questions.map((question) => (
                          <td key={`${question.id}-co`} className="border border-slate-200 bg-[#fafaf7] px-3 py-2 text-center font-bold text-slate-700">{question.coLabel || '-'}</td>
                        ))}
                        {coStats.labels.map((label) => (
                          <td key={`${label}-analysis`} className="border border-primary/20 bg-slate-50 px-3 py-2 text-center font-black text-primary">{label}</td>
                        ))}
                        <td className="border border-primary/20 bg-slate-50 px-3 py-2 text-center font-black text-primary">Total</td>
                      </tr>
                    <tr>
                      <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">8</td>
                      {isMidSheet ? (
                        <td className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold italic text-slate-500">{`Mark (${componentMax})`}</td>
                      ) : null}
                        {questions.map((question) => (
                          <td key={`${question.id}-max`} className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-bold italic text-slate-500">{question.maxMarks}</td>
                        ))}
                        {coStats.labels.map((label) => (
                          <td key={`${label}-max`} className="border border-primary/20 bg-[#f5f8ff] px-3 py-2 text-center font-bold text-slate-700">{coStats.max[label] ?? 0}</td>
                        ))}
                        <td className="border border-primary/20 bg-[#f5f8ff] px-3 py-2 text-center font-bold text-slate-700">{componentMax}</td>
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">7</td>
                        {coStats.labels.map((label) => (
                          <td key={`${label}-analysis`} className="border border-slate-200 bg-[#fafaf7] px-3 py-2 text-center font-black text-primary">{label}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">8</td>
                        {coStats.labels.map((label) => (
                          <td key={`${label}-max`} className="border border-primary/20 bg-[#f5f8ff] px-3 py-2 text-center font-bold text-slate-700">{coStats.max[label] ?? 0}</td>
                        ))}
                      </tr>
                    </>
                  )}
                  {students.map((student, index) => {
                    const values = buildMarkMap(active, questions, marks, student.id);
                    const total = computeTotal(active, questions, values);
                    const coTotals = coStats.labels.map((label) => coStats.totalsByStudent[student.id]?.[label] ?? 0);
                    return (
                      <tr key={student.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                        <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">{index + 9}</td>
                        {isDetailedSheet ? (
                          <>
                            <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{index + 1}</td>
                            <td className="border border-slate-200 px-3 py-2 font-bold text-slate-700">{student.name}</td>
                            <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-primary">{student.registrationNumber}</td>
                            <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{setup?.offering?.courseCode}</td>
                            <td className="border border-slate-200 px-3 py-2 text-center font-bold text-slate-700">{formatMark(total)}</td>
                            {questions.map((question) => (
                              <td key={`${student.id}-${question.id}`} className="border border-slate-200 px-3 py-2 text-center">{formatMark(values[question.id] ?? null)}</td>
                            ))}
                            {coTotals.map((value, valueIndex) => (
                              <td key={`${student.id}-co-${valueIndex}`} className="border border-primary/10 bg-[#f5f8ff] px-3 py-2 text-center">{formatMark(value)}</td>
                            ))}
                            <td className="border border-slate-200 bg-white px-3 py-2 text-center font-bold text-slate-700">{formatMark(total)}</td>
                          </>
                        ) : (
                          <>
                            <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{index + 1}</td>
                            <td className="border border-slate-200 px-3 py-2 font-bold text-slate-700">{student.name}</td>
                            <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-primary">{student.registrationNumber}</td>
                            <td className="border border-slate-200 px-3 py-2 text-center text-slate-600">{setup?.offering?.courseCode}</td>
                            <td className="border border-slate-200 px-3 py-2 text-center font-bold text-slate-700">{formatMark(total)}</td>
                            {coTotals.map((value, valueIndex) => (
                              <td key={`${student.id}-co-${valueIndex}`} className="border border-primary/10 bg-[#f5f8ff] px-3 py-2 text-center">{formatMark(value)}</td>
                            ))}
                          </>
                        )}
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">{students.length + 9}</td>
                    <td colSpan={isDetailedSheet ? questions.length + 5 : 5} className="border border-slate-200 bg-[#f6faf4] px-3 py-2 text-[11px] italic font-bold text-slate-600">
                      No of Students Scored more than 50% in relevant CO
                    </td>
                    {attainment.map((item) => (
                      <td key={`${item.label}-above`} className="border border-emerald-100 bg-[#f6faf4] px-3 py-2 text-center">{item.above}</td>
                    ))}
                    {isDetailedSheet ? <td className="border border-slate-200 bg-white px-3 py-2 text-center font-bold text-slate-700">{attainmentTotals.above}</td> : null}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">{students.length + 10}</td>
                    <td colSpan={isDetailedSheet ? questions.length + 5 : 5} className="border border-emerald-100 bg-[#eef7ea] px-3 py-2 text-[11px] font-black text-emerald-800">
                      Percentage of Students Scored more than 50% in relevant CO
                    </td>
                    {attainment.map((item) => (
                      <td key={`${item.label}-pct`} className="border border-emerald-100 bg-[#eef7ea] px-3 py-2 text-center font-bold text-emerald-800">{item.percentage.toFixed(2)}</td>
                    ))}
                    {isDetailedSheet ? <td className="border border-slate-200 bg-white px-3 py-2 text-center font-bold text-emerald-800">{attainmentTotals.percentage.toFixed(2)}</td> : null}
                  </tr>
                  <tr>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-400">{students.length + 11}</td>
                    <td colSpan={isDetailedSheet ? questions.length + 5 : 5} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center text-[11px] font-black uppercase tracking-[0.12em] text-white">
                      Level achieved
                    </td>
                    {attainment.map((item) => (
                      <td key={`${item.label}-level`} className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center text-[14px] font-black text-white">{item.level}</td>
                    ))}
                    {isDetailedSheet ? <td className="border border-slate-200 bg-[#1f2430] px-3 py-2 text-center text-[14px] font-black text-white">{attainmentTotals.level}</td> : null}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-[10px] text-slate-500">
              <div className="flex flex-wrap items-center gap-5">
                <span className="font-bold text-slate-700">{completedStudents} / {students.length} students have saved marks</span>
                <span>Average score: <strong className="text-slate-700">{averageScore}</strong></span>
                <span>Component max: <strong className="text-slate-700">{componentMax}</strong></span>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={goToMarks} className="font-bold text-primary hover:underline">Card view</button>
                <button onClick={goToSetup} className="font-bold text-slate-600 hover:underline">CO setup</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
