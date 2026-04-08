import { useState, useEffect } from 'react';
import { PageHeader, PageShell } from '../components/PageShell';
import { listAcademicYears, setActiveAcademicYear } from '../lib/api';
import type { AcademicYearSummary } from '../types/domain';

// ─── Grade data (OUTR 9-point system) ────────────────────────────────────────
interface Grade {
  grade: string; min: number; max: number; pts: number; pass: boolean;
}
const INITIAL_GRADES: Grade[] = [
  { grade: 'O', min: 91, max: 100, pts: 10, pass: true  },
  { grade: 'A', min: 81, max: 90,  pts: 9,  pass: true  },
  { grade: 'B', min: 71, max: 80,  pts: 8,  pass: true  },
  { grade: 'C', min: 61, max: 70,  pts: 7,  pass: true  },
  { grade: 'D', min: 51, max: 60,  pts: 6,  pass: true  },
  { grade: 'P', min: 35, max: 50,  pts: 5,  pass: true  },
  { grade: 'F', min: 0,  max: 34,  pts: 2,  pass: false },
];
const SPECIAL_GRADES = [
  { grade: 'M', label: 'Absent'          },
  { grade: 'S', label: 'Supplementary'   },
  { grade: 'T', label: 'Transfer'        },
  { grade: 'R', label: 'Result Withheld' },
];
const GRADE_COLORS: Record<string, string> = {
  O: 'text-blue-700 bg-blue-50', A: 'text-blue-600 bg-blue-50',
  B: 'text-sky-600 bg-sky-50',   C: 'text-slate-600 bg-slate-100',
  D: 'text-slate-500 bg-slate-100', P: 'text-amber-700 bg-amber-50',
  F: 'text-red-600 bg-red-50',
};

// ─── Attainment thresholds ────────────────────────────────────────────────────
interface Threshold { level: number; pct: number; label: string; colorCls: string }
const INITIAL_THRESHOLDS: Threshold[] = [
  { level: 1, pct: 60, label: 'Level 1 — Needs Improvement', colorCls: 'text-amber-700 bg-amber-50 border-amber-200' },
  { level: 2, pct: 65, label: 'Level 2 — Satisfactory',      colorCls: 'text-blue-700 bg-blue-50 border-blue-200'   },
  { level: 3, pct: 70, label: 'Level 3 — Outstanding',        colorCls: 'text-primary bg-primary/5 border-primary/20' },
];

// ─── Section card wrapper ─────────────────────────────────────────────────────
function Card({ title, badge, children, footer }: {
  title: string; badge?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-black text-secondary uppercase tracking-widest">[ {title} ]</span>
        {badge}
      </div>
      <div className="p-6">{children}</div>
      {footer && <div className="px-6 py-4 border-t border-slate-100 flex justify-end">{footer}</div>}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const show = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 2800);
  };
  const Toast = msg ? (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-white shadow-lg animate-fade-in ${msg.ok ? 'bg-green-600' : 'bg-red-500'}`}>
      <span className="material-symbols-outlined text-sm">{msg.ok ? 'check_circle' : 'error'}</span>
      {msg.text}
    </div>
  ) : null;
  return { show, Toast };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Settings() {
  const [grades,     setGrades]     = useState<Grade[]>(INITIAL_GRADES);
  const [thresholds, setThresholds] = useState<Threshold[]>(INITIAL_THRESHOLDS);
  
  const [academicYears, setAcademicYears] = useState<AcademicYearSummary[]>([]);
  const [activeYearId, setActiveYearId] = useState('');

  const fetchYears = async () => {
    try {
      const res = await listAcademicYears();
      setAcademicYears(res);
      const current = res.find(y => y.isCurrent) || res[0];
      if (current) setActiveYearId(current.id);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    listAcademicYears()
      .then(res => {
        if (cancelled) return;
        setAcademicYears(res);
        const current = res.find(y => y.isCurrent) ?? res[0];
        if (current) setActiveYearId(current.id);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  const saveActiveYear = async () => {
    if (!activeYearId) return;
    try {
      await setActiveAcademicYear(activeYearId);
      await fetchYears();
      show('Active year updated successfully');
    } catch {
      show('Failed to update active year', false);
    }
  };
  const { show, Toast } = useToast();

  // Update grade field
  const updateGrade = (idx: number, field: keyof Grade, val: number) =>
    setGrades(prev => prev.map((g, i) => i === idx ? { ...g, [field]: val } : g));

  // Update threshold
  const updateThreshold = (idx: number, pct: number) =>
    setThresholds(prev => prev.map((t, i) => i === idx ? { ...t, pct } : t));

  const saveGrades = () => show('Grade scale saved');

  const saveThresholds = () => {
    const [l1, l2, l3] = thresholds.map(t => t.pct);
    if (l1 >= l2 || l2 >= l3) { show('Thresholds must be ascending: L1 < L2 < L3', false); return; }
    show('Attainment thresholds saved');
  };

  return (
    <PageShell className="max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description="Grade scale and attainment configuration."
        className="mb-2"
      />

      {/* ── 1. Grade Scale ──────────────────────────────────────────── */}
      <Card
        title="GRADE SCALE — OUTR 9-POINT SYSTEM"
        badge={
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[9px] font-black text-green-600 uppercase tracking-widest">Live</span>
          </div>
        }
        footer={
          <button onClick={saveGrades}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-white bg-gradient-to-r from-primary to-secondary rounded-xl hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-base">save</span>Save Grade Scale
          </button>
        }
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Grade', 'Min Score', 'Max Score', 'Grade Points', 'Result'].map(h => (
                  <th key={h} className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {grades.map((g, i) => (
                <tr key={g.grade} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black ${GRADE_COLORS[g.grade] ?? 'bg-slate-100 text-slate-500'}`}>
                      {g.grade}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="number" min={0} max={100} value={g.min}
                      onChange={e => updateGrade(i, 'min', Number(e.target.value))}
                      style={{ MozAppearance: 'textfield' } as React.CSSProperties}
                      className="w-16 text-center text-sm font-bold border border-slate-200 rounded-lg py-1.5 focus:outline-none focus:border-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="number" min={0} max={100} value={g.max}
                      onChange={e => updateGrade(i, 'max', Number(e.target.value))}
                      style={{ MozAppearance: 'textfield' } as React.CSSProperties}
                      className="w-16 text-center text-sm font-bold border border-slate-200 rounded-lg py-1.5 focus:outline-none focus:border-primary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="number" min={0} max={10} value={g.pts}
                      onChange={e => updateGrade(i, 'pts', Number(e.target.value))}
                      style={{ MozAppearance: 'textfield' } as React.CSSProperties}
                      className={`w-16 text-center text-sm font-black border rounded-lg py-1.5 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        g.pass ? 'border-slate-200 focus:border-primary/50' : 'border-red-200 text-red-600'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black ${
                      g.pass ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
                    }`}>
                      {g.pass ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}

              {/* Special grades row */}
              <tr className="bg-slate-50/60 border-t-2 border-slate-100">
                <td colSpan={5} className="px-3 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-slate-400 text-sm">lock</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Special Grades (0 points):</span>
                    </div>
                    {SPECIAL_GRADES.map(s => (
                      <div key={s.grade} className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-lg">
                        <span className="font-mono text-xs font-black text-slate-600">{s.grade}</span>
                        <span className="text-[9px] text-slate-400 uppercase">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm text-slate-300">info</span>
          Pass mark = 35. Special grades M/S/T/R — Admin only.
        </p>
      </Card>

      {/* ── 2. CO Attainment Thresholds ─────────────────────────────── */}
      <Card
        title="CO ATTAINMENT THRESHOLDS"
        footer={
          <button onClick={saveThresholds}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-black text-white bg-gradient-to-r from-primary to-secondary rounded-xl hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-base">save</span>Save Thresholds
          </button>
        }
      >
        <p className="text-xs text-slate-500 mb-5">
          Percentage of students who must score above 50% of CO max marks to achieve each attainment level.
        </p>

        <div className="space-y-3">
          {thresholds.map((t, i) => (
            <div key={t.level} className={`flex items-center gap-4 p-4 rounded-xl border ${t.colorCls}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-lg flex-shrink-0 ${t.colorCls}`}>
                {t.level}
              </div>
              <div className="flex-1">
                <p className="text-xs font-black uppercase tracking-widest">{t.label}</p>
                <p className="text-[10px] mt-0.5 opacity-70">{t.pct}% or more students score above 50% of CO max marks</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input type="number" min={1} max={99} value={t.pct}
                  onChange={e => updateThreshold(i, Number(e.target.value))}
                  style={{ MozAppearance: 'textfield' } as React.CSSProperties}
                  className="w-16 text-center text-lg font-black border-b-2 border-current bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="font-bold text-sm">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-primary/5 border border-primary/10 rounded-xl p-3 text-xs text-slate-500 flex gap-2">
          <span className="material-symbols-outlined text-primary text-sm flex-shrink-0">info</span>
          <span>
            Level thresholds must be ascending: <strong>L1 &lt; L2 &lt; L3</strong>.<br />
            Changes affect future calculations only — historical data is not retroactively updated.
          </span>
        </div>
      </Card>

      {/* ── 3. Active Academic Year ──────────────────────────────────── */}
      <Card title="ACTIVE ACADEMIC YEAR">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Current Academic Year</label>
            <select value={activeYearId} onChange={e => setActiveYearId(e.target.value)}
              className="w-full max-w-xs px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold font-mono focus:outline-none focus:border-primary/50">
              {academicYears.map((ay: AcademicYearSummary) => (
                <option key={ay.id} value={ay.id}>{ay.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">
              {academicYears.find((ay: AcademicYearSummary) => ay.isCurrent)?.label || 'None'} Active
            </span>
          </div>
          <button onClick={saveActiveYear}
            className="px-5 py-2.5 text-sm font-black text-white bg-gradient-to-r from-primary to-secondary rounded-xl hover:opacity-90 transition-opacity flex-shrink-0">
            Set Active
          </button>
        </div>
      </Card>

      {Toast}
    </PageShell>
  );
}
