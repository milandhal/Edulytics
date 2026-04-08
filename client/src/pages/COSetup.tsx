import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/PageShell';
import { addCODefinition, ApiClientError, getCOSetup, listMyOfferings, removeCODefinition, saveCOSetup } from '../lib/api';
import type { COSetupData, OfferingSummary } from '../types/domain';

type Comp = 'mid' | 'quiz' | 'asn' | 'att' | 'end';
type Sid = 'A' | 'B' | 'MAIN';
type CO = { id: string; label: string; desc: string };
type Q = { id: string; label: string; maxMarks: number; coId: string | null; groupNumber: number | null };
type Section = { id: Sid; name: string; subtitle: string; questions: Q[] };
type Source = { id: string; subjectName: string; branch: string; semester: number; coLabels: string[]; sections: Array<{ id: Sid; name: string; subtitle: string; questions: Array<{ label: string; maxMarks: number; coLabel: string | null; groupNumber: number | null }> }> };

const uid = () => Math.random().toString(36).slice(2, 10);
const compLabel = (c: Comp) => c === 'mid' ? 'Mid Semester' : c === 'quiz' ? 'Quiz' : c === 'asn' ? 'Assignment' : c === 'att' ? 'Attendance' : 'End Semester';
const setupNav: Array<{ id: Comp; label: string; short: string }> = [
  { id: 'mid', label: 'Mid Semester', short: 'MID' },
  { id: 'quiz', label: 'Quiz', short: 'QUIZ' },
  { id: 'asn', label: 'Assignment', short: 'ASN' },
  { id: 'att', label: 'Attendance', short: 'ATT' },
  { id: 'end', label: 'End Semester', short: 'END' },
];
const expectedSectionTotal = (c: Comp, s: Sid) => c === 'mid'
  ? (s === 'A' ? 5 : 15)
  : c === 'quiz'
    ? 5
    : c === 'asn'
      ? 10
      : c === 'end'
        ? (s === 'A' ? 20 : 40)
        : 5;
const meta = (c: Comp, s: Sid) => c === 'mid'
  ? (s === 'A' ? { name: 'Section A', subtitle: 'Each question carries 1 mark' } : { name: 'Section B', subtitle: 'Each question carries 2.5 marks' })
  : c === 'end'
    ? (s === 'A' ? { name: 'Section A', subtitle: '10 compulsory questions of 2 marks each' } : { name: 'Section B', subtitle: 'Q2 to Q5: map all 3 questions, students attempt any 2' })
    : c === 'quiz'
      ? { name: 'Quiz Questions', subtitle: '5 questions of 1 mark each' }
      : { name: 'Assignment Questions', subtitle: '5 questions of 2 marks each' };

function defaults(c: Comp): Section[] {
  if (c === 'mid') return [
    { id: 'A', ...meta(c, 'A'), questions: Array.from({ length: 5 }, (_, i) => ({ id: uid(), label: `1(${String.fromCharCode(97 + i)})`, maxMarks: 1, coId: null, groupNumber: null })) },
    { id: 'B', ...meta(c, 'B'), questions: Array.from({ length: 6 }, (_, i) => ({ id: uid(), label: `2(${String.fromCharCode(97 + i)})`, maxMarks: 2.5, coId: null, groupNumber: null })) },
  ];
  if (c === 'quiz') return [{ id: 'MAIN', ...meta(c, 'MAIN'), questions: Array.from({ length: 5 }, (_, i) => ({ id: uid(), label: String(i + 1), maxMarks: 1, coId: null, groupNumber: null })) }];
  if (c === 'asn') return [{ id: 'MAIN', ...meta(c, 'MAIN'), questions: Array.from({ length: 5 }, (_, i) => ({ id: uid(), label: String(i + 1), maxMarks: 2, coId: null, groupNumber: null })) }];
  if (c === 'end') return [
    { id: 'A', ...meta(c, 'A'), questions: Array.from({ length: 10 }, (_, i) => ({ id: uid(), label: `1(${String.fromCharCode(97 + i)})`, maxMarks: 2, coId: null, groupNumber: null })) },
    { id: 'B', ...meta(c, 'B'), questions: [2, 3, 4, 5].flatMap((g) => ['a', 'b', 'c'].map((s) => ({ id: uid(), label: `${g}(${s})`, maxMarks: 5, coId: null, groupNumber: g }))) },
  ];
  return [];
}

function fromSetup(c: Comp, setup: COSetupData, cos: CO[]): Section[] {
  if (c === 'att') return [];
  if (!setup.questions?.length) return defaults(c);
  const order: Sid[] = c === 'mid' || c === 'end' ? ['A', 'B'] : ['MAIN'];
  const valid = new Set(cos.map((x) => x.id));
  const buckets = new Map<Sid, Q[]>();
  for (const q of setup.questions) {
    const sid: Sid = q.section === 'A' || q.section === 'B' ? q.section : (c === 'mid' || c === 'end' ? 'A' : 'MAIN');
    const list = buckets.get(sid) ?? [];
    list.push({ id: q.id, label: q.label, maxMarks: Number(q.maxMarks), coId: q.coId && valid.has(q.coId) ? q.coId : null, groupNumber: q.groupNumber });
    buckets.set(sid, list);
  }
  return order.filter((sid) => buckets.has(sid)).map((sid) => ({ id: sid, ...meta(c, sid), questions: (buckets.get(sid) ?? []).sort((a, b) => (a.groupNumber ?? 0) - (b.groupNumber ?? 0) || a.label.localeCompare(b.label)) }));
}

function sourceSections(c: Comp, setup: COSetupData) {
  const byId = new Map((setup.cos ?? []).map((co) => [co.id, co.label]));
  return fromSetup(c, setup, (setup.cos ?? []).map((co) => ({ id: co.id, label: co.label, desc: co.desc }))).map((s) => ({
    id: s.id, name: s.name, subtitle: s.subtitle, questions: s.questions.map((q) => ({ label: q.label, maxMarks: q.maxMarks, coLabel: q.coId ? byId.get(q.coId) ?? null : null, groupNumber: q.groupNumber })),
  }));
}

function CopyModal({ offerings, loading, onPick, onClose }: { offerings: Source[]; loading: boolean; onPick: (o: Source) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl"><div className="mb-1 flex items-center justify-between"><h2 className="text-base font-black text-on-surface">Copy CO Mapping</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button></div><p className="mb-4 text-xs text-slate-400">Reuse the saved mapping from another offering with the same subject code.</p>{loading ? <p className="py-6 text-center text-sm text-slate-400">Loading available mappings...</p> : offerings.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No saved mappings found.</p> : <div className="space-y-2">{offerings.map((o) => <button key={o.id} onClick={() => { onPick(o); onClose(); }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"><div><p className="text-sm font-bold text-on-surface">{o.subjectName}</p><p className="mt-0.5 text-xs text-slate-400">{o.branch} - Sem {o.semester}</p><div className="mt-2 flex flex-wrap gap-1">{o.sections.map((s) => <span key={s.id} className="rounded bg-secondary/10 px-2 py-0.5 text-[9px] font-bold text-secondary">{s.name} - {s.questions.length}q</span>)}</div></div><span className="material-symbols-outlined ml-3 flex-shrink-0 text-2xl text-primary">content_copy</span></button>)}</div>}<button onClick={onClose} className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50">Cancel</button></div></div>;
}

export function COSetup() {
  const params = useParams();
  const navigate = useNavigate();
  const offeringId = params.offeringId ?? params.id ?? '';
  const component = (params.component ?? params.assessmentId ?? '') as Comp;
  const [setup, setSetup] = useState<COSetupData | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [cos, setCos] = useState<CO[]>([]);
  const [myOfferings, setMyOfferings] = useState<OfferingSummary[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingCO, setAddingCO] = useState(false);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!offeringId || !component) { setError('Invalid CO setup URL.'); setLoading(false); return; }
      setLoading(true); setError('');
      try {
        const [s, mine] = await Promise.all([getCOSetup(offeringId, component), listMyOfferings({ pageSize: 200 })]);
        if (!active) return;
        const localCos = (s.cos ?? []).map((co) => ({ id: co.id, label: co.label, desc: co.desc }));
        setSetup(s); setCos(localCos); setMyOfferings(mine.data); setWarn(Boolean(s.hasMarksEntered)); setSections(fromSetup(component, s, localCos));
      } catch (e) {
        if (!active) return;
        setError(e instanceof ApiClientError ? e.message : 'Unable to load CO mapping setup right now.');
      } finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [component, offeringId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!showCopy || !setup?.offering) return;
      const candidates = myOfferings.filter((o) => o.id !== offeringId && o.subject.code === setup.offering?.courseCode);
      setLoadingCopy(true);
      try {
        const loaded = await Promise.all(candidates.map(async (o) => {
          const s = await getCOSetup(o.id, component);
          if (!s.questions?.length || !s.offering) return null;
          return { id: o.id, subjectName: s.offering.courseName, branch: s.offering.branch, semester: s.offering.sem, coLabels: (s.cos ?? []).map((co) => co.label), sections: sourceSections(component, s) } as Source;
        }));
        if (active) setSources(loaded.filter((x): x is Source => x !== null));
      } catch { if (active) setSources([]); } finally { if (active) setLoadingCopy(false); }
    };
    void load(); return () => { active = false; };
  }, [component, myOfferings, offeringId, setup, showCopy]);

  const markDirty = () => { setDirty(true); setSaved(false); };
  const requiresMapping = component !== 'att';
  const requiredTotal = component === 'mid' ? 20 : component === 'quiz' ? 5 : component === 'asn' ? 10 : component === 'att' ? 5 : 60;
  const marksRoute = `/offerings/${offeringId}/marks/${component}`;
  const setupRoute = (target: Comp) => `/offerings/${offeringId}/setup/${target}`;
  const rows = sections.flatMap((s) => s.questions);
  const sectionMarks = (section: Section, mappedOnly = false) => {
    const questions = mappedOnly ? section.questions.filter((q) => q.coId) : section.questions;
    if (!(component === 'end' && section.id === 'B')) return questions.reduce((a, q) => a + Number(q.maxMarks), 0);
    const grouped = new Map<number, number>();
    for (const question of questions) {
      const key = question.groupNumber ?? -1;
      grouped.set(key, (grouped.get(key) ?? 0) + Number(question.maxMarks));
    }
    return Array.from(grouped.values()).reduce((sum, groupTotal) => sum + Math.min(groupTotal, 10), 0);
  };
  const total = sections.reduce((sum, section) => sum + sectionMarks(section), 0);
  const mapped = sections.reduce((sum, section) => sum + sectionMarks(section, true), 0);
  const covered = new Set(rows.map((q) => q.coId).filter(Boolean));
  const totalValid = !requiresMapping || Math.abs(total - requiredTotal) < 0.001;
  const complete = (!requiresMapping || (rows.length > 0 && rows.every((q) => q.coId))) && totalValid;

  const addCO = async () => {
    setAddingCO(true); setError('');
    try { const created = await addCODefinition(offeringId, ''); setCos((p) => [...p, created]); setSaved(true); }
    catch (e) { setError(e instanceof ApiClientError ? e.message : 'Unable to add a new CO right now.'); }
    finally { setAddingCO(false); }
  };

  const removeCO = async (coId: string) => {
    setError('');
    try {
      await removeCODefinition(offeringId, coId);
      setCos((prev) => prev.filter((co) => co.id !== coId));
      setSections((prev) => prev.map((section) => ({
        ...section,
        questions: section.questions.map((question) => (
          question.coId === coId ? { ...question, coId: null } : question
        )),
      })));
      markDirty();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Unable to delete CO right now.');
    }
  };

  const copyFrom = async (source: Source) => {
    const byLabel = new Map(cos.map((co) => [co.label, co.id]));
    let next = [...cos];
    for (const label of source.coLabels) if (!byLabel.has(label)) { const created = await addCODefinition(offeringId, ''); byLabel.set(created.label, created.id); next = [...next, created]; }
    setCos(next);
    setSections(source.sections.map((s) => ({ id: s.id, name: s.name, subtitle: s.subtitle, questions: s.questions.map((q) => ({ id: uid(), label: q.label, maxMarks: q.maxMarks, coId: q.coLabel ? byLabel.get(q.coLabel) ?? null : null, groupNumber: q.groupNumber })) })));
    markDirty();
  };

  const updateQ = (sid: Sid, qid: string, patch: Partial<Q>) => { setSections((prev) => prev.map((s) => s.id === sid ? { ...s, questions: s.questions.map((q) => q.id === qid ? { ...q, ...patch } : q) } : s)); markDirty(); };
  const removeQ = (sid: Sid, qid: string) => { setSections((prev) => prev.map((s) => s.id === sid ? { ...s, questions: s.questions.filter((q) => q.id !== qid) } : s)); markDirty(); };
  const addQ = (sid: Sid) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sid) return s;
      if (component === 'mid') return { ...s, questions: [...s.questions, { id: uid(), label: `${sid === 'A' ? '1' : '2'}(${String.fromCharCode(97 + s.questions.length)})`, maxMarks: sid === 'A' ? 1 : 2.5, coId: null, groupNumber: null }] };
      if (component === 'end' && sid === 'B') { const g = Math.max(1, ...s.questions.map((q) => q.groupNumber ?? 1)) + 1; return { ...s, questions: [...s.questions, ...['a', 'b', 'c'].map((x) => ({ id: uid(), label: `${g}(${x})`, maxMarks: 5, coId: null, groupNumber: g }))] }; }
      return { ...s, questions: [...s.questions, { id: uid(), label: String(s.questions.length + 1), maxMarks: component === 'quiz' ? 1 : 2, coId: null, groupNumber: null }] };
    })); markDirty();
  };

  const persist = async () => {
    if (component === 'att') { setDirty(false); return true; }
    if (!totalValid) { setError(`Total must be exactly ${requiredTotal} / ${requiredTotal} before saving.`); return false; }
    if (!complete) { setError('Map every question to a CO before saving.'); return false; }
    setSaving(true); setError('');
    try {
      await saveCOSetup(offeringId, component, { questions: sections.flatMap((s, i) => s.questions.map((q, j) => ({ label: q.label.trim(), maxMarks: Number(q.maxMarks), coId: q.coId as string, section: s.id === 'MAIN' ? null : s.id, groupNumber: q.groupNumber ?? (i + 1) * 100 + j + 1 }))) });
      setDirty(false); setSaved(true); return true;
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Unable to save CO mapping right now.'); return false;
    } finally { setSaving(false); }
  };

  const goMarks = async () => { if (!complete) { setError('Map every question to a CO before continuing to marks entry.'); return; } if (!dirty || await persist()) navigate(marksRoute); };

  if (loading) return <PageShell className="max-w-6xl"><div className="py-20 text-center text-slate-400"><span className="material-symbols-outlined mb-2 block text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>schema</span><p className="font-semibold">Loading CO mapping setup...</p></div></PageShell>;
  if (error && !setup) return <PageShell className="max-w-6xl"><div className="rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">{error}</div></PageShell>;

  return (
    <PageShell className="max-w-7xl pb-44">
      <nav className="mb-4 flex items-center gap-1 text-xs text-slate-400"><Link to="/offerings" className="hover:text-primary">My Offerings</Link><span className="material-symbols-outlined text-sm">chevron_right</span><span>{setup?.offering?.courseCode} - {setup?.offering?.courseName}</span><span className="material-symbols-outlined text-sm">chevron_right</span><span className="font-bold text-primary">CO Setup - {compLabel(component)}</span></nav>
      <PageHeader title="CO Mapping Setup" description={`${compLabel(component)} - Max ${requiredTotal} marks - ${setup?.isStructureLocked ? 'Structure locked.' : 'Always editable.'}`} className="mb-5" actions={<><button onClick={() => setShowCopy(true)} disabled={saving || addingCO} className="flex items-center gap-2 rounded-xl border border-secondary/30 bg-secondary/5 px-3 py-2 text-xs font-bold text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-50"><span className="material-symbols-outlined text-base">content_copy</span>Copy from another offering</button><div className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${totalValid ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'}`}><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</span>{requiresMapping ? `${mapped} / ${requiredTotal}` : '5 / 5'}{totalValid ? <span className="material-symbols-outlined text-lg text-green-500">check_circle</span> : <span className="material-symbols-outlined text-lg text-red-500">cancel</span>}</div></>} />
      {error ? <div className="mb-5 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">{error}</div> : null}
      {warn ? <div className="mb-5 flex items-start gap-3 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4"><span className="material-symbols-outlined flex-shrink-0 text-xl text-amber-500">warning</span><div className="flex-1"><p className="text-sm font-bold text-amber-800">Marks already submitted for this assessment</p><p className="mt-0.5 text-xs text-amber-700">Editing the CO mapping will <strong>recalculate attainment scores</strong> for all students. Marks already entered are preserved.</p></div><button onClick={() => setWarn(false)} className="flex-shrink-0 text-amber-400 hover:text-amber-600"><span className="material-symbols-outlined text-lg">close</span></button></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Course Outcomes</h2><button onClick={() => { void addCO(); }} disabled={addingCO || saving} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-black text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"><span className="material-symbols-outlined text-sm">add</span>Add CO</button></div><div className="space-y-2">{cos.map((co) => <div key={co.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3"><div className="text-sm font-black text-primary">{co.label}</div><button onClick={() => { void removeCO(co.id); }} className="text-slate-300 transition-colors hover:text-error"><span className="material-symbols-outlined text-lg">close</span></button></div>)}</div><div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-500">{component === 'att' ? 'Attendance has no question rows, but CO buttons remain available by default.' : 'Use the CO buttons in each question row to map that row to a CO.'}</div></aside>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-start">
          <div>
          <div className="mb-6 flex gap-3 rounded-xl border-l-4 border-primary bg-primary/5 p-4 text-sm text-on-surface-variant"><span className="material-symbols-outlined flex-shrink-0 text-xl text-primary">info</span><span>Map each question to a <strong className="mx-1 text-primary">Course Outcome (CO)</strong>. Same subject-code offerings can reuse an existing mapping.</span></div>
          {component === 'att' ? <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm"><span className="material-symbols-outlined text-4xl text-slate-300">event_available</span><p className="mt-3 text-lg font-black text-on-surface">No question setup required for Attendance</p><p className="mt-2 text-sm text-slate-500">Attendance carries 5 marks and goes directly to marks entry. The 5 default CO buttons are still available on the left, and you can add more.</p></div> : <div className="space-y-5">{sections.map((s) => { const sectionTotal = sectionMarks(s); const sectionValid = Math.abs(sectionTotal - expectedSectionTotal(component, s.id)) < 0.001; return <div key={s.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-3"><div className="flex items-center gap-3"><span className="text-sm font-black tracking-tight text-secondary">[ {s.name.toUpperCase()} ]</span><span className="text-[10px] font-bold text-slate-400">{s.subtitle}</span></div><div className="flex items-center gap-3"><span className={`text-xs font-bold ${sectionValid ? 'text-slate-400' : 'text-red-600'}`}>{sectionTotal} marks</span><button onClick={() => addQ(s.id)} disabled={saving} className="rounded-lg px-2.5 py-1 text-[11px] font-black text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">+ ADD Q</button></div></div><div className="divide-y divide-slate-50">{s.questions.map((q, i) => { const showGroup = component === 'end' && s.id === 'B' && (i === 0 || s.questions[i - 1]?.groupNumber !== q.groupNumber); return <div key={q.id}>{showGroup ? <div className="border-b border-slate-100 bg-slate-100/70 px-6 py-2 text-[11px] font-black uppercase tracking-wider text-primary">Q{q.groupNumber} Group - 3 questions of 5 marks each, students attempt any 2</div> : null}<div className="group flex items-center gap-4 px-6 py-3 transition-colors hover:bg-slate-50/40"><span className="flex h-8 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">{q.label}</span><div className="flex flex-shrink-0 items-center gap-1.5"><input type="number" min={0.5} step={0.5} value={q.maxMarks} onChange={(e) => updateQ(s.id, q.id, { maxMarks: Number(e.target.value) })} className="w-14 rounded-lg bg-slate-100 py-1.5 text-center text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-300">MARKS</span></div><div className="flex flex-1 gap-1.5">{cos.map((co) => <button key={co.id} onClick={() => updateQ(s.id, q.id, { coId: q.coId === co.id ? null : co.id })} className={`flex-1 rounded-lg py-1.5 text-xs font-black transition-all ${q.coId === co.id ? 'bg-primary text-white shadow-sm' : 'border border-slate-200 text-slate-400 hover:border-primary/40 hover:text-primary'}`}>{co.label}</button>)}</div><button onClick={() => removeQ(s.id, q.id)} className="text-slate-300 transition-colors hover:text-error"><span className="material-symbols-outlined text-lg">close</span></button></div></div>; })}</div></div>; })}</div>}
          <div className="mt-5 flex flex-wrap items-center gap-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-1 items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10"><span className="material-symbols-outlined text-secondary">calculate</span></div><div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mapped Weight</p><p className="text-xl font-black text-secondary">{requiresMapping ? mapped : 5}<span className="ml-1 text-sm font-medium text-slate-400">/ {requiresMapping ? total : 5}</span></p></div></div><div><p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Coverage</p><div className="flex flex-wrap gap-2">{cos.map((co) => <span key={co.id} className={`rounded-lg border px-2.5 py-1 text-xs font-black ${covered.has(co.id) || component === 'att' ? 'border-secondary/20 bg-white text-secondary shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-300'}`}>{co.label}</span>)}</div></div></div>
          </div>
          <aside className="xl:sticky xl:top-24">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Setup Sections</p>
                <p className="mt-1 text-sm text-slate-500">Jump to another assessment setup without leaving this offering.</p>
              </div>
              <div className="space-y-2">
                {setupNav.map((item) => {
                  const active = item.id === component;
                  return (
                    <Link
                      key={item.id}
                      to={setupRoute(item.id)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm transition-all ${
                        active
                          ? 'border-primary/20 bg-primary/5 text-primary shadow-sm'
                          : 'border-slate-100 text-slate-500 hover:border-primary/20 hover:bg-slate-50 hover:text-primary'
                      }`}
                    >
                      <div>
                        <p className="font-black">{item.label}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{item.short}</p>
                      </div>
                      <span className={`material-symbols-outlined text-lg ${active ? 'text-primary' : 'text-slate-300'}`}>
                        {active ? 'radio_button_checked' : 'arrow_forward_ios'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
      <div className="fixed right-6 bottom-6 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl shadow-slate-200/60 backdrop-blur-xl sm:right-8">
        <Link to="/offerings" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50">Back</Link>
        <button onClick={() => { void persist(); }} disabled={saving || (!dirty && component !== 'att') || !totalValid} className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>{saving ? 'Saving...' : 'Save'}</button>
        <button onClick={() => { void goMarks(); }} disabled={saving || !complete} className={`flex items-center gap-2 rounded-xl px-7 py-2.5 text-sm font-black transition-all ${complete ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20 hover:opacity-90' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}><span className="material-symbols-outlined text-base">arrow_forward</span>{complete ? 'Go to Marks Entry' : 'Map all questions first'}</button>
      </div>
      {saved ? <div className="fixed right-8 bottom-24 z-50 flex cursor-pointer items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-lg" onClick={() => setSaved(false)}><span className="material-symbols-outlined text-base">check</span>Saved</div> : null}
      {showCopy ? <CopyModal offerings={sources} loading={loadingCopy} onPick={(o) => { void copyFrom(o); }} onClose={() => setShowCopy(false)} /> : null}
    </PageShell>
  );
}
