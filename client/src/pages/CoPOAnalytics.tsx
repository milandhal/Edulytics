import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/PageShell';
import { ApiClientError, getCOSetup, getOfferingMarks, getOfferingStudents, listMyOfferings } from '../lib/api';
import type { COSetupData, MarksEntryStudent, OfferingSummary } from '../types/domain';

type ComponentKey = 'mid' | 'quiz' | 'asn' | 'att' | 'end';
type GroupKey = 'internal' | 'external';
type InternalView = 'all' | 'mid' | 'quiz' | 'asn' | 'att';

type MarksMap = Record<string, Record<string, number | null> | { score: number | null }>;

type ComponentDataset = {
  setup: COSetupData | null;
  marks: MarksMap;
};

type StudentAggregate = {
  id: string;
  name: string;
  reg: string;
  totalRaw: number;
  gapFromAverage: number;
  breakdownRaw: Record<ComponentKey, number>;
};

type ComparisonBar = {
  label: string;
  studentRaw: number;
  classRaw: number;
  maxRaw: number;
};

type CoMetric = {
  label: string;
  maxMarks: number;
  averageRaw: number;
  aboveThreshold: number;
};

const rainbowPalette = [
  'from-sky-500 via-cyan-400 to-blue-500',
  'from-violet-500 via-fuchsia-500 to-pink-500',
  'from-emerald-500 via-lime-400 to-green-500',
  'from-amber-400 via-orange-400 to-rose-500',
  'from-indigo-500 via-purple-500 to-fuchsia-500',
] as const;

const componentLabels: Record<ComponentKey, string> = {
  mid: 'Mid Semester',
  quiz: 'Quiz',
  asn: 'Assignment',
  att: 'Attendance',
  end: 'End Semester',
};

const internalComponents: ComponentKey[] = ['mid', 'quiz', 'asn', 'att'];
const externalComponents: ComponentKey[] = ['end'];

function getQuestions(component: ComponentKey, setup: COSetupData | null) {
  if (component === 'att' || !setup) return [];

  const coById = new Map((setup.cos ?? []).map((co) => [co.id, co.label]));

  return (setup.questions ?? []).map((question) => ({
    id: question.id,
    maxMarks: Number(question.maxMarks),
    coLabel: coById.get(question.coId ?? '') ?? 'CO?',
  }));
}

function getComponentMax(component: ComponentKey, setup: COSetupData | null) {
  if (component === 'att') return 5;
  return getQuestions(component, setup).reduce((sum, question) => sum + question.maxMarks, 0);
}

function getStudentRawForComponent(
  component: ComponentKey,
  dataset: ComponentDataset | undefined,
  studentId: string,
) {
  if (!dataset) return 0;

  const entry = dataset.marks[studentId];

  if (component === 'att') {
    return entry && 'score' in entry ? Number(entry.score ?? 0) : 0;
  }

  const questions = getQuestions(component, dataset.setup);

  if (!entry || 'score' in entry) return 0;

  return questions.reduce((sum, question) => sum + Number(entry[question.id] ?? 0), 0);
}

function formatOfferingLabel(offering: OfferingSummary) {
  return `${offering.subject.code} - ${offering.subject.name} (${offering.branch.code} Sem ${offering.semesterNumber})`;
}

function chartHeight(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(8, Math.round((value / max) * 180));
}

function hasRecordedMarks(dataset: ComponentDataset | undefined, component: ComponentKey) {
  if (!dataset) return false;

  return Object.values(dataset.marks).some((entry) => {
    if (!entry) return false;

    if (component === 'att') {
      return 'score' in entry && entry.score != null;
    }

    if ('score' in entry) {
      return entry.score != null;
    }

    return Object.values(entry).some((value) => value != null);
  });
}

export function CoPOAnalytics() {
  const [offerings, setOfferings] = useState<OfferingSummary[]>([]);
  const [selectedOfferingId, setSelectedOfferingId] = useState('');
  const [group, setGroup] = useState<GroupKey>('internal');
  const [internalView, setInternalView] = useState<InternalView>('all');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [thresholdPercent, setThresholdPercent] = useState(60);
  const [chartZoom, setChartZoom] = useState(1);
  const [analysisComponent, setAnalysisComponent] = useState<ComponentKey>('mid');
  const [students, setStudents] = useState<MarksEntryStudent[]>([]);
  const [datasets, setDatasets] = useState<Partial<Record<ComponentKey, ComponentDataset>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadOfferings = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await listMyOfferings({ pageSize: 200 });

        if (!active) return;

        setOfferings(response.data);
        setSelectedOfferingId((current) => current || response.data[0]?.id || '');
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiClientError ? err.message : 'Unable to load analytics offerings right now.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOfferings();

    return () => {
      active = false;
    };
  }, []);

  const activeComponents = useMemo<ComponentKey[]>(() => {
    if (group === 'external') return externalComponents;
    if (internalView === 'all') return internalComponents;
    return [internalView];
  }, [group, internalView]);

  useEffect(() => {
    let active = true;

    const loadAnalytics = async () => {
      if (!selectedOfferingId) {
        setStudents([]);
        setDatasets({});
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [studentData, componentData] = await Promise.all([
          getOfferingStudents(selectedOfferingId),
          Promise.all(activeComponents.map(async (component) => {
            const [setup, marks] = await Promise.all([
              component === 'att' ? Promise.resolve(null) : getCOSetup(selectedOfferingId, component),
              getOfferingMarks(selectedOfferingId, component),
            ]);

            return {
              component,
              setup,
              marks: marks.marks,
            };
          })),
        ]);

        if (!active) return;

        setStudents(studentData.students);
        setDatasets(componentData.reduce<Partial<Record<ComponentKey, ComponentDataset>>>((acc, item) => {
          acc[item.component] = { setup: item.setup, marks: item.marks };
          return acc;
        }, {}));
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiClientError ? err.message : 'Unable to load analytics data right now.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadAnalytics();

    return () => {
      active = false;
    };
  }, [activeComponents, selectedOfferingId]);

  const selectedOffering = useMemo(
    () => offerings.find((offering) => offering.id === selectedOfferingId) ?? null,
    [offerings, selectedOfferingId],
  );

  const componentMaxMap = useMemo(() => (
    activeComponents.reduce<Record<ComponentKey, number>>((acc, component) => {
      acc[component] = getComponentMax(component, datasets[component]?.setup ?? null);
      return acc;
    }, {} as Record<ComponentKey, number>)
  ), [activeComponents, datasets]);

  const totalMax = useMemo(
    () => activeComponents.reduce((sum, component) => sum + (componentMaxMap[component] ?? 0), 0),
    [activeComponents, componentMaxMap],
  );

  const studentRows = useMemo<StudentAggregate[]>(() => {
    if (students.length === 0) return [];

    const base = students.map((student) => {
      const breakdownRaw = {
        mid: getStudentRawForComponent('mid', datasets.mid, student.id),
        quiz: getStudentRawForComponent('quiz', datasets.quiz, student.id),
        asn: getStudentRawForComponent('asn', datasets.asn, student.id),
        att: getStudentRawForComponent('att', datasets.att, student.id),
        end: getStudentRawForComponent('end', datasets.end, student.id),
      } as Record<ComponentKey, number>;

      const totalRaw = activeComponents.reduce((sum, component) => sum + breakdownRaw[component], 0);

      return {
        id: student.id,
        name: student.name,
        reg: student.registrationNumber,
        totalRaw,
        gapFromAverage: 0,
        breakdownRaw,
      };
    });

    const classAverageValue = base.length
      ? base.reduce((sum, row) => sum + row.totalRaw, 0) / base.length
      : 0;

    return base
      .map((row) => ({
        ...row,
        gapFromAverage: Number((row.totalRaw - classAverageValue).toFixed(1)),
      }))
      .sort((left, right) => right.totalRaw - left.totalRaw);
  }, [activeComponents, datasets, students]);

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!query) return studentRows;

    return studentRows.filter((student) => (
      student.name.toLowerCase().includes(query)
      || student.reg.toLowerCase().includes(query)
    ));
  }, [studentQuery, studentRows]);

  useEffect(() => {
    if (selectedStudentId && !studentRows.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [selectedStudentId, studentRows]);

  const selectedStudent = useMemo(
    () => studentRows.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, studentRows],
  );

  const classAverage = useMemo(
    () => studentRows.length ? Number((studentRows.reduce((sum, row) => sum + row.totalRaw, 0) / studentRows.length).toFixed(1)) : 0,
    [studentRows],
  );

  const thresholdQualified = useMemo(
    () => studentRows.filter((row) => totalMax > 0 && (row.totalRaw / totalMax) >= 0.6).length,
    [studentRows, totalMax],
  );

  const thresholdQualifiedAtSelected = useMemo(
    () => studentRows.filter((row) => totalMax > 0 && (row.totalRaw / totalMax) >= (thresholdPercent / 100)).length,
    [studentRows, thresholdPercent, totalMax],
  );

  const hasAnyRecordedMarks = useMemo(
    () => activeComponents.some((component) => hasRecordedMarks(datasets[component], component)),
    [activeComponents, datasets],
  );

  const topPerformer = hasAnyRecordedMarks ? (studentRows[0] ?? null) : null;
  const lowestStudent = hasAnyRecordedMarks ? (studentRows.at(-1) ?? null) : null;
  const thresholdBelowCount = Math.max(studentRows.length - thresholdQualified, 0);
  const thresholdBelowCountAtSelected = Math.max(studentRows.length - thresholdQualifiedAtSelected, 0);
  const currentScopeSummary = `${selectedOffering?.subject.code ?? '--'} · ${group === 'internal' ? 'Internal' : 'External'}${group === 'internal' && internalView !== 'all' ? ` · ${componentLabels[internalView]}` : ''}`;

  const comparisonSeries = useMemo<ComparisonBar[]>(() => {
    if (!selectedStudent) return [];

    if (group === 'internal' && internalView === 'all') {
      return internalComponents.map((component) => {
        const classRaw = studentRows.length
          ? Number((studentRows.reduce((sum, row) => sum + row.breakdownRaw[component], 0) / studentRows.length).toFixed(1))
          : 0;

        return {
          label: componentLabels[component],
          studentRaw: selectedStudent.breakdownRaw[component],
          classRaw,
          maxRaw: componentMaxMap[component] ?? 0,
        };
      });
    }

    return activeComponents.map((component) => ({
      label: componentLabels[component],
      studentRaw: selectedStudent.breakdownRaw[component],
      classRaw: classAverage,
      maxRaw: totalMax,
    }));
  }, [activeComponents, classAverage, componentMaxMap, group, internalView, selectedStudent, studentRows, totalMax]);

  const coMetrics = useMemo<CoMetric[]>(() => {
    const component = analysisComponent;
    if (!component || component === 'att') return [];

    const dataset = datasets[component];
    if (!dataset?.setup) return [];

    const questions = getQuestions(component, dataset.setup);
    const coLabels = Array.from(new Set(questions.map((question) => question.coLabel)));

    return coLabels.map((label) => {
      const relevantQuestions = questions.filter((question) => question.coLabel === label);
      const maxMarks = relevantQuestions.reduce((sum, question) => sum + question.maxMarks, 0);

      const scores = students.map((student) => {
        const entry = dataset.marks[student.id];
        if (!entry || 'score' in entry) return 0;
        return relevantQuestions.reduce((sum, question) => sum + Number(entry[question.id] ?? 0), 0);
      });

      const averageRaw = scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : 0;
      const aboveThreshold = scores.filter((score) => score > maxMarks * 0.5).length;

      return {
        label,
        maxMarks,
        averageRaw,
        aboveThreshold,
      };
    });
  }, [analysisComponent, datasets, students]);

  const strongestCO = coMetrics.reduce<CoMetric | null>(
    (best, metric) => (!best || metric.averageRaw > best.averageRaw ? metric : best),
    null,
  );

  const weakestCO = coMetrics.reduce<CoMetric | null>(
    (worst, metric) => (!worst || metric.averageRaw < worst.averageRaw ? metric : worst),
    null,
  );

  const chartBarMinWidth = Math.round(92 * chartZoom);
  const chartBarMaxWidth = Math.round(46 * chartZoom);
  const chartGapClass = chartZoom > 1.35 ? 'gap-2' : chartZoom < 0.95 ? 'gap-0' : 'gap-0';
  const yTicks = useMemo(() => {
    if (totalMax <= 0) return [0];
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => Math.round((totalMax * i) / steps));
  }, [totalMax]);

  if (loading && !selectedOffering) {
    return <PageShell><div className="py-16 text-sm text-slate-500">Loading analytics...</div></PageShell>;
  }

  return (
    <PageShell className="print:px-0 print:py-0 print:w-full print:max-w-none">
      {/* Print-only Cover Header */}
      <div className="hidden print:block mb-8 border-b-2 border-slate-800 pb-4">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Subject Performance & Analytics Report</h1>
        <div className="mt-3 flex justify-between text-sm text-slate-700">
          <p><strong>Subject:</strong> {selectedOffering?.subject.name} ({selectedOffering?.subject.code})</p>
          <p><strong>Branch:</strong> {selectedOffering?.branch.name} &bull; <strong>Semester:</strong> {selectedOffering?.semesterNumber}</p>
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <p><strong>Academic Year:</strong> {selectedOffering?.academicYear.label}</p>
          <p>Generated on: {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <PageHeader
        title="Analytics"
        className="print:hidden"
        description="Subject-wise performance insights for the offerings assigned to you."
        actions={(
          <div className="print:hidden flex items-center gap-2">
            <button
              onClick={() => setFilterOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-lg">tune</span>
              Filters
            </button>
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg border border-outline-variant/30 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-lg">file_download</span>
              Export PDF
            </button>
          </div>
        )}
      />

      {error ? (
        <div className="mb-6 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <div className="rounded-lg border border-primary/10 bg-primary/5 px-4 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Current Scope</p>
          <p className="mt-1 text-sm font-bold text-on-surface">{currentScopeSummary}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{students.length} students in this offering</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            title: 'Class Average',
            value: `${classAverage}/${totalMax}`,
            sub: `${group === 'internal' ? 'Internal' : 'External'} marks`,
            color: 'text-primary',
          },
          {
            title: 'Students >= 60%',
            value: `${thresholdQualified}/${studentRows.length || 0}`,
            sub: `${thresholdBelowCount} students below threshold`,
            color: thresholdQualified > 0 ? 'text-secondary' : 'text-on-surface',
          },
          {
            title: 'Top Performer',
            value: topPerformer ? `${topPerformer.totalRaw}/${totalMax}` : '--',
            sub: topPerformer ? topPerformer.name : 'No marks recorded yet',
            color: 'text-green-600',
          },
          {
            title: selectedStudent ? 'Selected Student' : 'Watchlist',
            value: selectedStudent ? `${selectedStudent.totalRaw}/${totalMax}` : (lowestStudent ? lowestStudent.name : '--'),
            sub: selectedStudent
              ? `${selectedStudent.gapFromAverage >= 0 ? '+' : ''}${selectedStudent.gapFromAverage} vs class avg`
              : lowestStudent ? `${lowestStudent.totalRaw}/${totalMax}` : 'No marks recorded yet',
            color: selectedStudent ? 'text-secondary' : 'text-error',
          },
        ].map((card) => (
          <div key={card.title} className="rounded-2xl border border-outline-variant/10 bg-white p-5 shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{card.title}</p>
            <h3 className={`mb-1 truncate text-2xl font-black ${card.color}`}>{card.value}</h3>
            <p className="text-[10px] font-bold text-on-surface-variant">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="overflow-hidden rounded-2xl border border-outline-variant/10 bg-white shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
          <div className="border-b border-outline-variant/10 p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">bar_chart</span>
              Whole Class Performance
            </h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              {group === 'internal'
                ? 'Compare actual internal marks student by student.'
                : 'Compare actual external marks for the selected subject.'}
            </p>
          </div>

          <div className="p-5">
            {filteredStudents.length > 0 ? (
              <>
                <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedStudentId}
                      onChange={(event) => setSelectedStudentId(event.target.value)}
                      className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Whole class view</option>
                      {filteredStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name} ({student.reg})
                        </option>
                      ))}
                    </select>

                    <div className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/20 bg-surface-container-low p-1">
                      <button
                        type="button"
                        onClick={() => setChartZoom((current) => Math.max(0.7, Number((current - 0.15).toFixed(2))))}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-white"
                        aria-label="Zoom out chart"
                      >
                        <span className="material-symbols-outlined text-base">remove</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartZoom(1)}
                        className="min-w-[56px] rounded-md px-2 py-1 text-[11px] font-bold text-on-surface-variant transition-colors hover:bg-white"
                      >
                        {Math.round(chartZoom * 100)}%
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartZoom((current) => Math.min(1.8, Number((current + 0.15).toFixed(2))))}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-white"
                        aria-label="Zoom in chart"
                      >
                        <span className="material-symbols-outlined text-base">add</span>
                      </button>
                    </div>
                  </div>

                  <div className="text-right text-xs text-on-surface-variant">
                    <p>Average line at {classAverage}/{totalMax}</p>
                  </div>
                </div>

                <div className="flex">
                  {/* Y-axis — fixed, non-scrolling */}
                  {totalMax > 0 && (
                    <div className="flex flex-shrink-0 select-none flex-col" style={{ width: '42px' }}>
                      {/* Chart tick area matches the bar area height (190px) */}
                      <div className="relative flex-shrink-0" style={{ height: '190px' }}>
                        {yTicks.map((tick) => (
                          <div
                            key={tick}
                            className="absolute right-0 flex items-center justify-end gap-1"
                            style={{ bottom: `${(tick / totalMax) * 180}px`, transform: 'translateY(50%)' }}
                          >
                            <span className="text-[9px] font-semibold tabular-nums text-on-surface-variant/60">{tick}</span>
                            <div className="h-px w-2 flex-shrink-0 bg-outline-variant/40" />
                          </div>
                        ))}
                        {/* Axis border line */}
                        <div className="absolute bottom-0 right-0 top-0 w-px bg-outline-variant/20" />
                      </div>
                      {/* Empty space matching the label row height */}
                      <div className="flex-shrink-0" style={{ height: '56px' }} />
                    </div>
                  )}

                  {/* Scrollable area — bars + labels scroll together */}
                  <div className="flex-1 overflow-x-auto">
                    <div className={`flex flex-col min-w-max`}>
                      {/* Bar chart area — fixed 190px, all bottom: values measured from here */}
                      <div className={`relative flex h-[190px] items-end border-b border-outline-variant/20 ${chartGapClass}`}>
                        {/* Grid lines — same bottom formula as bars */}
                        {totalMax > 0 && yTicks.map((tick) => (
                          <div
                            key={tick}
                            className="pointer-events-none absolute left-0 right-0 border-t border-outline-variant/10"
                            style={{ bottom: `${(tick / totalMax) * 180}px` }}
                          />
                        ))}
                        {/* Average line — same coordinate system */}
                        {totalMax > 0 && (
                          <div
                            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-slate-400/60"
                            style={{ bottom: `${(classAverage / totalMax) * 180}px` }}
                          />
                        )}

                        {filteredStudents.map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => setSelectedStudentId(student.id)}
                            className="group relative flex h-full flex-shrink-0 items-end justify-center"
                            style={{ minWidth: `${chartBarMinWidth}px` }}
                          >
                            <div
                              className={`w-full rounded-t-xl bg-gradient-to-t transition-all ${
                                selectedStudentId === student.id
                                  ? 'from-fuchsia-500 via-violet-500 to-indigo-600'
                                  : rainbowPalette[Math.abs(student.reg.charCodeAt(student.reg.length - 1) || 0) % rainbowPalette.length]
                              }`}
                              style={{ height: `${chartHeight(student.totalRaw, totalMax)}px`, maxWidth: `${chartBarMaxWidth}px` }}
                            />
                            {/* Hover name tooltip */}
                            <div className="pointer-events-none absolute inset-x-0 top-1.5 z-20 flex justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                              <div className="max-w-[90%] rounded-lg bg-slate-800/90 px-2 py-1 text-center text-[9px] font-bold leading-tight text-white shadow-lg backdrop-blur-sm">
                                {student.name}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* Label row — scrolls in sync with bars above */}
                      <div className={`flex ${chartGapClass}`}>
                        {filteredStudents.map((student) => (
                          <div
                            key={student.id}
                            className="flex flex-shrink-0 flex-col items-center pt-2 pb-4 text-center"
                            style={{ minWidth: `${chartBarMinWidth}px` }}
                          >
                            <p className="text-sm font-black text-on-surface">{student.totalRaw}</p>
                            <p className="text-[10px] font-bold tracking-wide text-on-surface-variant">{student.reg}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-outline-variant/20 px-4 py-10 text-center text-sm text-on-surface-variant">
                No students match this search.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-outline-variant/10 bg-white p-5 shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">donut_large</span>
              <h2 className="text-sm font-bold text-on-surface">Score Distribution</h2>
            </div>

            <div className="mb-4 flex flex-wrap gap-2 print:hidden">
              {[50, 60, 70, 80, 90].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setThresholdPercent(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    thresholdPercent === value
                      ? 'bg-primary text-white'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>

            <div className="flex items-center gap-5">
              <div className="relative flex h-32 w-32 items-center justify-center">
                <div
                  className="h-32 w-32 rounded-full transition-all duration-500 ease-out"
                  style={{
                    background: `conic-gradient(#ef4444 0 12%, #f59e0b 12% 24%, #eab308 24% 36%, #22c55e 36% 52%, #06b6d4 52% 68%, #3b82f6 68% 84%, #8b5cf6 84% ${studentRows.length ? (thresholdQualifiedAtSelected / studentRows.length) * 100 : 0}%, #e7ebf2 ${studentRows.length ? (thresholdQualifiedAtSelected / studentRows.length) * 100 : 0}% 100%)`,
                    transform: 'rotate(-90deg)',
                  }}
                />
                <div className="absolute inset-[18px] rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl font-black text-on-surface">{thresholdPercent}%</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Threshold</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-bold text-on-surface">{thresholdQualifiedAtSelected} students</p>
                  <p className="text-xs text-on-surface-variant">scored {thresholdPercent}% or above</p>
                </div>
                <div>
                  <p className="font-bold text-on-surface">{thresholdBelowCountAtSelected} students</p>
                  <p className="text-xs text-on-surface-variant">scored below {thresholdPercent}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-outline-variant/10 bg-white p-5 shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">insights</span>
              <h2 className="text-sm font-bold text-on-surface">Quick Signals</h2>
            </div>

            <div className="space-y-3">
              {strongestCO ? (
                <div className="rounded-xl bg-green-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Strongest CO</p>
                  <p className="mt-1 text-sm font-bold text-green-900">
                    {strongestCO.label} averages {strongestCO.averageRaw}/{strongestCO.maxMarks}.
                  </p>
                </div>
              ) : null}

              {weakestCO ? (
                <div className="rounded-xl bg-rose-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Needs Attention</p>
                  <p className="mt-1 text-sm font-bold text-rose-900">
                    {weakestCO.label} averages {weakestCO.averageRaw}/{weakestCO.maxMarks}.
                  </p>
                </div>
              ) : null}

              <div className="rounded-xl bg-primary/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Suggested Next Step</p>
                <p className="mt-1 text-sm font-bold text-on-surface">
                  Review {selectedStudent ? selectedStudent.name : 'students below the average line'} before moving back to marks entry.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-2xl border border-outline-variant/10 bg-white p-6 shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-on-surface">
                <span className="material-symbols-outlined text-secondary">person_search</span>
                {selectedStudent ? `${selectedStudent.name} vs Class Average` : 'Pick a Student to Compare'}
              </h2>
              <p className="mt-1 text-xs text-on-surface-variant">
                {selectedStudent
                  ? 'Compare actual marks against the class average.'
                  : 'Select a student from the chart to open an individual comparison.'}
              </p>
            </div>

            {selectedOffering ? (
              <Link
                to={`/offerings/${selectedOffering.id}/marks/${group === 'external' ? 'end' : (internalView === 'all' ? 'mid' : internalView)}`}
                className="rounded-lg border border-outline-variant/20 px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/5 print:hidden"
              >
                Open Marks Entry
              </Link>
            ) : null}
          </div>

          {selectedStudent ? (
            <div className="space-y-5">
              {comparisonSeries.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-xs font-bold">
                    <span className="text-on-surface">{item.label}</span>
                    <span className="text-on-surface-variant">{item.studentRaw} vs {item.classRaw}</span>
                  </div>

                  <div className="grid grid-cols-[72px_1fr] gap-3">
                    <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Student</p>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${item.maxRaw > 0 ? (item.studentRaw / item.maxRaw) * 100 : 0}%` }} />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-[72px_1fr] gap-3">
                    <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Class Avg</p>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.maxRaw > 0 ? (item.classRaw / item.maxRaw) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-outline-variant/20 px-4 py-10 text-center text-sm text-on-surface-variant">
              No student selected yet.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-outline-variant/10 bg-white p-6 shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="material-symbols-outlined text-primary">bar_chart</span>
              Mark Analysis (CO-wise)
            </h2>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              {(['mid', 'quiz', 'asn', 'end'] as ComponentKey[]).map((compKey) => (
                <button
                  key={compKey}
                  type="button"
                  onClick={() => setAnalysisComponent(compKey)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    analysisComponent === compKey
                      ? 'bg-primary text-white'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {componentLabels[compKey]}
                </button>
              ))}
            </div>
            <p className="mt-3 hidden print:block text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              Selected Component: {componentLabels[analysisComponent]}
            </p>
          </div>

          <div className="space-y-5">
            {coMetrics.length > 0 ? (
              coMetrics.map((metric) => (
                <div key={metric.label}>
                  <div className="mb-2 flex items-center justify-between text-xs font-bold">
                    <span className="text-on-surface">{metric.label}</span>
                    <span className="text-on-surface-variant">{metric.averageRaw}/{metric.maxMarks}</span>
                  </div>

                  <div className="h-7 overflow-hidden rounded-xl bg-surface-container-high">
                    <div
                      className={`flex h-full items-center bg-gradient-to-r px-3 text-[10px] font-bold text-white transition-all ${
                        rainbowPalette[Math.max(Number(metric.label.replace(/\D/g, '')) - 1, 0) % rainbowPalette.length]
                      }`}
                      style={{ width: `${metric.maxMarks > 0 ? (metric.averageRaw / metric.maxMarks) * 100 : 0}%` }}
                    >
                      {metric.averageRaw}
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{metric.aboveThreshold}/{students.length} students above 50%</span>
                    <span>Max {metric.maxMarks}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-outline-variant/20 py-8 text-center text-sm text-on-surface-variant">
                No CO mapping found for this assessment.
              </div>
            )}
          </div>
        </div>
      </div>

      {lowestStudent ? (
        <div className="mt-6 rounded-2xl border border-outline-variant/10 bg-white p-5 shadow-sm print:shadow-none print:border-slate-200 print:break-inside-avoid">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-on-surface">Watchlist</h2>
              <p className="mt-1 text-xs text-on-surface-variant">
                Lowest current performer in this subject and view.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedStudentId(lowestStudent.id)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 print:hidden"
            >
              Focus {lowestStudent.name}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-on-surface">{lowestStudent.name}</p>
              <p className="text-xs text-on-surface-variant">{lowestStudent.reg}</p>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Score</p>
                <p className="text-lg font-black text-on-surface">{lowestStudent.totalRaw}/{totalMax}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Gap</p>
                <p className="text-lg font-black text-error">{lowestStudent.gapFromAverage}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {filterOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-sm">
          <div className="h-full w-full max-w-md border-l border-outline-variant/10 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-on-surface">Filters</h2>
                <p className="mt-1 text-sm text-on-surface-variant">Refine the analytics view without leaving the page.</p>
              </div>
              <button
                onClick={() => setFilterOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-xs font-bold text-on-surface-variant">Subject</label>
                <select
                  value={selectedOfferingId}
                  onChange={(event) => setSelectedOfferingId(event.target.value)}
                  className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {offerings.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {formatOfferingLabel(offering)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-on-surface-variant">Assessment Group</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setGroup('internal')}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                      group === 'internal' ? 'bg-primary text-white' : 'border border-outline-variant/20 bg-white text-on-surface'
                    }`}
                  >
                    Internal
                  </button>
                  <button
                    onClick={() => setGroup('external')}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                      group === 'external' ? 'bg-primary text-white' : 'border border-outline-variant/20 bg-white text-on-surface'
                    }`}
                  >
                    External
                  </button>
                </div>
              </div>

              {group === 'internal' ? (
                <div>
                  <label className="mb-1 block text-xs font-bold text-on-surface-variant">Internal View</label>
                  <select
                    value={internalView}
                    onChange={(event) => setInternalView(event.target.value as InternalView)}
                    className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="all">All Internal</option>
                    <option value="mid">Mid Semester</option>
                    <option value="quiz">Quiz</option>
                    <option value="asn">Assignment</option>
                    <option value="att">Attendance</option>
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-bold text-on-surface-variant">Student Search</label>
                <input
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                  placeholder="Search by name or reg. no."
                  className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <button
                onClick={() => {
                  setGroup('internal');
                  setInternalView('all');
                  setStudentQuery('');
                  setSelectedStudentId('');
                }}
                className="w-full rounded-xl border border-outline-variant/20 px-4 py-3 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-low"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
