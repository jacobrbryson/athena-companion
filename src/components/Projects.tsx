import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Drawer } from './Drawer';
import { ProjectJournal } from './ProjectJournal';
import { ProjectData } from './ProjectData';
import {
  projectsApi, AREAS, AREA_LABEL, STATES, STATE_LABEL, PRIORITY_LABEL, CONDITIONS,
  type Area, type Concern, type Project, type ProjectInput, type ProjectsSnapshot, type ProjectState, type Relation,
} from '../api/projects';

/**
 * Projects in the Companion app (core_api docs/architecture/projects.md).
 *
 * Everything here is editable — the owner's rule (2026-10-13): imported rows and
 * anything Athena made included. The server answers every write with the whole
 * snapshot and this replaces its copy with it, so links, blocked states and the
 * ranking are never computed twice in two places.
 *
 * None of this is an action. Editing a project is the person doing it in their
 * own app; nothing here reaches the world.
 */

const EMPTY: ProjectsSnapshot = { projects: [], links: [], concerns: [], charters: [] };
const CLOSED = new Set<ProjectState>(['done', 'dropped']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ProjectsState {
  snap: ProjectsSnapshot;
  loading: boolean;
  error: string;
  busy: boolean;
  reload: () => void;
  /** Run a write; the snapshot it answers with replaces ours. Resolves false (and sets error) on failure. */
  run: (write: () => Promise<ProjectsSnapshot>) => Promise<boolean>;
}

export function useProjects(enabled = true): ProjectsState {
  const [snap, setSnap] = useState<ProjectsSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    projectsApi.all()
      .then(s => { if (alive) { setSnap(s); setError(''); } })
      .catch(e => { if (alive) setError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [enabled, attempt]);
  const run = useCallback(async (write: () => Promise<ProjectsSnapshot>) => {
    setBusy(true);
    setError('');
    try {
      const next = await write();
      setSnap({ projects: next.projects, links: next.links, concerns: next.concerns, charters: next.charters });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { snap, loading, error, busy, reload: () => setAttempt(a => a + 1), run };
}

// --- Formatting -------------------------------------------------------------

const money = (n: number) => (n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`);
const range = (lo: number | null, hi: number | null, fmt: (n: number) => string) =>
  lo === null && hi === null ? null : lo !== null && hi !== null && lo !== hi ? `${fmt(lo)}–${fmt(hi)}` : fmt((lo ?? hi)!);
const hours = (m: number) => (m < 60 ? `${m}m` : `${Math.round(m / 6) / 10}h`);

export function costLine(p: Project) {
  const diy = range(p.cost.diyLow, p.cost.diyHigh, money);
  const pro = range(p.cost.proLow, p.cost.proHigh, money);
  return [diy && `${diy} DIY`, pro && `${pro} hired`].filter(Boolean).join(' · ') || p.cost.note || null;
}
export function effortLine(p: Project) {
  const r = range(p.effort.min, p.effort.max, hours);
  return [r, p.effort.note].filter(Boolean).join(' ') || null;
}
function deadlineLine(p: Project) {
  if (!p.hardDeadline) return null;
  const days = Math.floor((Date.parse(`${p.hardDeadline}T23:59:59`) - Date.now()) / 86_400_000);
  return days < 0 ? `${-days}d past deadline` : days === 0 ? 'due today' : `due in ${days}d`;
}
const stateTone: Record<ProjectState, string> = {
  idea: 'border-slate-600 text-slate-300', planning: 'border-sky-700 text-sky-200', ready: 'border-cyan-600 text-cyan-200',
  active: 'border-emerald-500 text-emerald-200', waiting: 'border-amber-600 text-amber-200', blocked: 'border-rose-700 text-rose-200',
  done: 'border-slate-700 text-slate-500', dropped: 'border-slate-800 text-slate-600',
};
export function StateChip({ state }: { state: ProjectState }) {
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${stateTone[state]}`}>{STATE_LABEL[state]}</span>;
}

/** Projects linked to this one, by relation and direction. */
export function linksOf(snap: ProjectsSnapshot, uuid: string) {
  const byId = new Map(snap.projects.map(p => [p.uuid, p]));
  const pick = (rel: Relation, side: 'from' | 'to') => snap.links
    .filter(l => l.relation === rel && l[side] === uuid)
    .map(l => ({ project: byId.get(side === 'from' ? l.to : l.from)!, note: l.note }))
    .filter(x => x.project);
  return {
    partOf: pick('contributes_to', 'from'),
    contributors: pick('contributes_to', 'to'),
    needs: pick('depends_on', 'from'),
    neededBy: pick('depends_on', 'to'),
  };
}

const byRank = (a: Project, b: Project) =>
  (b.rank ?? -1e9) - (a.rank ?? -1e9) || a.title.localeCompare(b.title);

/** Open projects in rank order, optionally limited to an area (primary, or any with `anyArea`). */
export function openProjects(snap: ProjectsSnapshot, area?: Area, { anyArea = false, includeWork = true } = {}) {
  return snap.projects
    .filter(p => !CLOSED.has(p.status))
    .filter(p => includeWork || p.primaryArea !== 'work')
    .filter(p => !area || (anyArea ? p.areas.some(a => a.area === area) : p.primaryArea === area))
    .sort(byRank);
}

// --- List -------------------------------------------------------------------

function nextStepOf(p: Project) {
  return p.steps.find(s => s.status === 'in_progress') || p.steps.find(s => s.status === 'todo') || null;
}

export function ProjectRow({ p, snap, onOpen, compact = false }: { p: Project; snap: ProjectsSnapshot; onOpen: (uuid: string) => void; compact?: boolean }) {
  const links = linksOf(snap, p.uuid);
  const blockers = links.needs.filter(n => !CLOSED.has(n.project.status)).map(n => n.project.title);
  const next = nextStepOf(p);
  const progress = p.progress.contributors.total
    ? { ...p.progress.contributors, label: 'parts done' }
    : p.progress.steps.total ? { ...p.progress.steps, label: 'steps done' } : null;
  const facts = compact ? [deadlineLine(p)] : [deadlineLine(p), effortLine(p), costLine(p)];
  return <li>
    <button type="button" onClick={() => onOpen(p.uuid)}
      className="flex w-full flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-cyan-700">
      <span className="flex w-full items-start justify-between gap-2">
        <strong className="min-w-0 text-sm font-medium text-slate-100">
          {p.kind === 'program' && <span className="mr-1 text-[10px] uppercase tracking-widest text-cyan-400">Program</span>}
          {p.title}
        </strong>
        <StateChip state={p.effectiveStatus} />
      </span>
      <small className="text-xs text-slate-400">
        {[p.priority >= 4 ? PRIORITY_LABEL[p.priority] : null, ...facts, p.rankWhy[0], !compact && p.media?.photos ? `${p.media.photos} photo${p.media.photos === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || ' '}
      </small>
      {blockers.length > 0 && <small className="text-xs text-rose-200/80">Needs first: {blockers.slice(0, 2).join(', ')}{blockers.length > 2 ? ` +${blockers.length - 2}` : ''}</small>}
      {p.effectiveStatus === 'waiting' && p.waitingOn && <small className="text-xs text-amber-200/80">Waiting on {p.waitingOn}</small>}
      {next && !compact && <small className="text-xs text-slate-300">Next: {next.title}</small>}
      {progress && <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
        <span className="h-1 flex-1 overflow-hidden rounded bg-slate-800"><span className="block h-full bg-cyan-500/70" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></span>
        {progress.done}/{progress.total} {progress.label}
      </span>}
    </button>
  </li>;
}

export function ProjectList({ projects, snap, onOpen, empty, compact }: {
  projects: Project[]; snap: ProjectsSnapshot; onOpen: (uuid: string) => void; empty?: ReactNode; compact?: boolean;
}) {
  if (!projects.length) return <p className="dashboard-empty">{empty ?? 'Nothing here yet.'}</p>;
  return <ul className="flex flex-col gap-2">{projects.map(p => <ProjectRow key={p.uuid} p={p} snap={snap} onOpen={onOpen} compact={compact} />)}</ul>;
}

/** The full board: area filter chips, open work by rank, closed work folded away. */
export function ProjectBoard({ state, onOpen, onNew, area: fixedArea }: {
  state: ProjectsState; onOpen: (uuid: string) => void; onNew: (area?: Area) => void; area?: Area;
}) {
  const [filter, setFilter] = useState<Area | 'all'>('all');
  const [query, setQuery] = useState('');
  const area = fixedArea ?? (filter === 'all' ? undefined : filter);
  const q = query.trim().toLowerCase();
  const match = (p: Project) => !q || p.title.toLowerCase().includes(q) || (p.goal || '').toLowerCase().includes(q);
  const open = openProjects(state.snap, area).filter(match);
  const closed = state.snap.projects.filter(p => CLOSED.has(p.status) && (!area || p.primaryArea === area) && match(p));
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {!fixedArea && (['all', ...AREAS] as const).map(a => <button key={a} type="button" onClick={() => setFilter(a)}
        className={`rounded-full border px-3 py-1 uppercase tracking-widest ${filter === a ? 'border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>
        {a === 'all' ? 'All' : AREA_LABEL[a]}
      </button>)}
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find…" aria-label="Find a project"
        className="min-w-[8rem] flex-1 rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs" />
      <button type="button" className="dashboard-chat-cta" onClick={() => onNew(area)}>New project <span>+</span></button>
    </div>
    {state.error && <p role="alert" className="text-sm text-amber-200">{state.error} <button className="underline" onClick={state.reload}>Retry</button></p>}
    {state.loading && !state.snap.projects.length ? <p className="dashboard-empty">Loading projects…</p>
      : <ProjectList projects={open} snap={state.snap} onOpen={onOpen}
        empty={q ? 'Nothing matches that.' : area ? `No open ${AREA_LABEL[area]} projects.` : 'No projects yet — start one.'} />}
    {closed.length > 0 && <details className="rounded-lg border border-slate-800 p-3">
      <summary className="cursor-pointer text-xs uppercase tracking-widest text-slate-400">Done &amp; dropped ({closed.length})</summary>
      <div className="mt-3"><ProjectList projects={closed} snap={state.snap} onOpen={onOpen} /></div>
    </details>}
  </div>;
}

// --- Editor -----------------------------------------------------------------

const field = 'w-full rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';
const label = 'mb-1 block text-[10px] uppercase tracking-widest text-slate-400';
const chip = (on: boolean) => `rounded-full border px-2 py-0.5 text-xs ${on ? 'border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-400'}`;
const num = (v: string) => (v.trim() === '' ? null : Number(v));
const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

interface Draft {
  title: string; goal: string; kind: string; status: ProjectState; waitingOn: string; priority: number;
  areas: Area[]; primaryArea: Area;
  startsOn: string; endsOn: string; hardDeadline: string;
  effortMin: string; effortMax: string; effortNote: string; indoor: '' | 'yes' | 'no';
  diyLow: string; diyHigh: string; proLow: string; proHigh: string; costNote: string; valueNote: string;
  seasonMonths: number[]; conditions: string[]; serves: string;
  metricSource: string; metricStart: string; metricTarget: string; metricUnit: string;
  involvesChildren: boolean;
}

function draftOf(p: Project | null, area: Area): Draft {
  return {
    title: p?.title ?? '', goal: p?.goal ?? '', kind: p?.kind ?? '', status: p?.status ?? 'idea',
    waitingOn: p?.waitingOn ?? '', priority: p?.priority ?? 3,
    areas: p?.areas.map(a => a.area) ?? [area], primaryArea: p?.primaryArea ?? area,
    startsOn: p?.startsOn ?? '', endsOn: p?.endsOn ?? '', hardDeadline: p?.hardDeadline ?? '',
    effortMin: p?.effort.min != null ? String(p.effort.min / 60) : '', effortMax: p?.effort.max != null ? String(p.effort.max / 60) : '',
    effortNote: p?.effort.note ?? '', indoor: p?.indoor === true ? 'yes' : p?.indoor === false ? 'no' : '',
    diyLow: str(p?.cost.diyLow), diyHigh: str(p?.cost.diyHigh), proLow: str(p?.cost.proLow), proHigh: str(p?.cost.proHigh),
    costNote: p?.cost.note ?? '', valueNote: p?.valueNote ?? '',
    seasonMonths: p?.seasonMonths ?? [], conditions: p?.conditions ?? [], serves: (p?.serves ?? []).join(', '),
    metricSource: p?.metric?.source ?? '', metricStart: str(p?.metric?.start), metricTarget: str(p?.metric?.target), metricUnit: p?.metric?.unit ?? '',
    involvesChildren: p?.involvesChildren ?? false,
  };
}

function inputOf(d: Draft): ProjectInput {
  const mins = (h: string) => (h.trim() === '' ? null : Math.round(Number(h) * 60));
  return {
    title: d.title, goal: d.goal || null, kind: d.kind || null, status: d.status,
    waitingOn: d.status === 'waiting' ? d.waitingOn || null : null, priority: d.priority,
    areas: d.areas, primaryArea: d.primaryArea,
    startsOn: d.startsOn || null, endsOn: d.endsOn || null, hardDeadline: d.hardDeadline || null,
    effort: { min: mins(d.effortMin), max: mins(d.effortMax), note: d.effortNote || null },
    indoor: d.indoor === '' ? null : d.indoor === 'yes',
    cost: { diyLow: num(d.diyLow), diyHigh: num(d.diyHigh), proLow: num(d.proLow), proHigh: num(d.proHigh), note: d.costNote || null },
    valueNote: d.valueNote || null,
    seasonMonths: d.seasonMonths.length ? d.seasonMonths : null,
    conditions: d.conditions,
    serves: d.serves.split(',').map(s => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean),
    metric: { source: d.metricSource || null, start: num(d.metricStart), target: num(d.metricTarget), unit: d.metricUnit || null },
    involvesChildren: d.involvesChildren,
  };
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className="mb-4 rounded-lg border border-slate-800 p-3">
    <summary className="cursor-pointer text-xs uppercase tracking-[0.25em] text-cyan-300">{title}</summary>
    <div className="mt-3 flex flex-col gap-3">{children}</div>
  </details>;
}

/**
 * One project, every field editable. `uuid` null means a new one; it opens on
 * the fields that matter and the rest (steps, links) appear once it exists.
 */
export function ProjectEditor({ state, uuid, area = 'home', onClose, onOpen }: {
  state: ProjectsState; uuid: string | null; area?: Area; onClose: () => void; onOpen: (uuid: string) => void;
}) {
  const project = uuid ? state.snap.projects.find(p => p.uuid === uuid) ?? null : null;
  const [draft, setDraft] = useState<Draft>(() => draftOf(project, area));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft(d => ({ ...d, [k]: v })); setDirty(true); setSaved(''); };
  // A different project opened in the same drawer starts from its own values.
  useEffect(() => { setDraft(draftOf(project, area)); setDirty(false); }, [uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (uuid && !project) {
    return <Drawer eyebrow="PROJECT" title="Not found" onClose={onClose}>
      <p className="text-sm text-slate-300">{state.loading ? 'Loading…' : 'That project is gone — it may have been deleted.'}</p>
    </Drawer>;
  }

  const save = async () => {
    if (!draft.title.trim()) return;
    if (!project) {
      let created = '';
      const ok = await state.run(async () => {
        const res = await projectsApi.create(inputOf(draft));
        const fresh = res.projects.filter(p => !state.snap.projects.some(o => o.uuid === p.uuid));
        created = fresh[0]?.uuid ?? '';
        return res;
      });
      if (ok && created) onOpen(created);
      return;
    }
    if (await state.run(() => projectsApi.update(project.uuid, inputOf(draft)))) { setDirty(false); setSaved('Saved.'); }
  };

  const quick = async (patch: ProjectInput) => {
    if (!project) return;
    if (await state.run(() => projectsApi.update(project.uuid, patch))) {
      setDraft(d => ({ ...d, status: patch.status ?? d.status, waitingOn: patch.waitingOn ?? d.waitingOn, priority: patch.priority ?? d.priority }));
    }
  };
  const hold = () => {
    const reason = window.prompt('Waiting on what? (rain, a delivery, a quote, a person…)', project?.waitingOn ?? '');
    if (reason !== null) void quick({ status: 'waiting', waitingOn: reason.trim() || null });
  };
  const remove = async () => {
    if (!project) return;
    const l = linksOf(state.snap, project.uuid);
    const tied = l.partOf.length + l.contributors.length + l.needs.length + l.neededBy.length;
    const concerns = state.snap.concerns.filter(c => c.projects.includes(project.uuid)).length;
    const warn = [tied && `${tied} link${tied === 1 ? '' : 's'}`, concerns && `${concerns} concern${concerns === 1 ? '' : 's'}`, project.steps.length && `${project.steps.length} step${project.steps.length === 1 ? '' : 's'}`].filter(Boolean).join(', ');
    if (!window.confirm(`Delete "${project.title}" for good?${warn ? ` It has ${warn}, which go with it.` : ''}\n\n"Drop" keeps its history instead.`)) return;
    if (await state.run(() => projectsApi.remove(project.uuid))) onClose();
  };

  const title = project ? project.title : 'New project';
  const footer = <div className="flex flex-wrap items-center gap-2 p-3">
    <button type="button" className="dashboard-chat-cta" disabled={state.busy || !draft.title.trim() || (!!project && !dirty)} onClick={() => void save()}>
      {state.busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}
    </button>
    {saved && <span role="status" className="text-xs text-cyan-200">{saved}</span>}
    {dirty && project && <button type="button" className="text-xs text-slate-400 underline" onClick={() => { setDraft(draftOf(project, area)); setDirty(false); }}>Discard</button>}
  </div>;

  return <Drawer eyebrow={project ? `${AREA_LABEL[project.primaryArea].toUpperCase()} PROJECT` : 'PROJECT'} title={title} onClose={onClose} footer={footer}>
    {state.error && <p role="alert" className="mb-3 text-sm text-amber-200">{state.error}</p>}

    {project && <div className="mb-4 flex flex-wrap items-center gap-2">
      <StateChip state={project.effectiveStatus} />
      {project.effectiveStatus === 'blocked' && project.status !== 'blocked' && <span className="text-xs text-rose-200/80">until what it needs is done</span>}
      <span className="flex-1" />
      {project.status !== 'active' && !CLOSED.has(project.status) && <button type="button" className={chip(false)} disabled={state.busy} onClick={() => void quick({ status: 'active' })}>Start</button>}
      {!CLOSED.has(project.status) && <button type="button" className={chip(false)} disabled={state.busy} onClick={() => void quick({ status: 'done' })}>Mark done</button>}
      {!CLOSED.has(project.status) && project.status !== 'waiting' && <button type="button" className={chip(false)} disabled={state.busy} onClick={hold}>Hold</button>}
      {!CLOSED.has(project.status) && <button type="button" className={chip(false)} disabled={state.busy} onClick={() => void quick({ status: 'dropped' })}>Drop</button>}
      {CLOSED.has(project.status) && <button type="button" className={chip(false)} disabled={state.busy} onClick={() => void quick({ status: 'ready' })}>Reopen</button>}
    </div>}

    <Section title="The project">
      <div><label className={label} htmlFor="pj-title">Title</label>
        <input id="pj-title" className={field} value={draft.title} maxLength={190} onChange={e => set('title', e.target.value)} placeholder="Insulate the attic" /></div>
      <div><label className={label} htmlFor="pj-goal">Goal &amp; notes</label>
        <textarea id="pj-goal" rows={4} className={field} value={draft.goal} onChange={e => set('goal', e.target.value)} placeholder="What done looks like, and anything worth remembering" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label} htmlFor="pj-status">Status</label>
          <select id="pj-status" className={field} value={draft.status} onChange={e => set('status', e.target.value as ProjectState)}>
            {STATES.map(s => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select></div>
        <div><label className={label} htmlFor="pj-priority">Priority</label>
          <select id="pj-priority" className={field} value={draft.priority} onChange={e => set('priority', Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{PRIORITY_LABEL[n]}</option>)}
          </select></div>
      </div>
      {draft.status === 'waiting' && <div><label className={label} htmlFor="pj-waiting">Waiting on</label>
        <input id="pj-waiting" className={field} value={draft.waitingOn} maxLength={32} onChange={e => set('waitingOn', e.target.value)} placeholder="rain, season, quote, delivery…" /></div>}
      <div>
        <span className={label}>Areas (tap the star for the main one)</span>
        <div className="flex flex-wrap gap-2">{AREAS.map(a => {
          const on = draft.areas.includes(a);
          return <span key={a} className="inline-flex items-center gap-1">
            <button type="button" className={chip(on)} onClick={() => {
              const next = on ? draft.areas.filter(x => x !== a) : [...draft.areas, a];
              if (!next.length) return;
              set('areas', next);
              if (!next.includes(draft.primaryArea)) set('primaryArea', next[0]);
            }}>{AREA_LABEL[a]}</button>
            {on && <button type="button" aria-label={`Make ${AREA_LABEL[a]} the main area`} title="Main area"
              className={draft.primaryArea === a ? 'text-amber-300' : 'text-slate-600'} onClick={() => set('primaryArea', a)}>★</button>}
          </span>;
        })}</div>
      </div>
      <div><label className={label} htmlFor="pj-kind">Kind (optional)</label>
        <input id="pj-kind" className={field} value={draft.kind} maxLength={32} onChange={e => set('kind', e.target.value)} placeholder="program, fitness, coaching…" />
        <p className="mt-1 text-xs text-slate-500">"program" makes this an umbrella that other projects are part of.</p></div>
    </Section>

    <Section title="When" open={!!(draft.hardDeadline || draft.startsOn || draft.seasonMonths.length || draft.conditions.length)}>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={label} htmlFor="pj-start">Starts</label><input id="pj-start" type="date" className={field} value={draft.startsOn} onChange={e => set('startsOn', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-end">Ends</label><input id="pj-end" type="date" className={field} value={draft.endsOn} onChange={e => set('endsOn', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-deadline">Hard deadline</label><input id="pj-deadline" type="date" className={field} value={draft.hardDeadline} onChange={e => set('hardDeadline', e.target.value)} /></div>
      </div>
      <div><span className={label}>Season (none = any time)</span>
        <div className="flex flex-wrap gap-1">{MONTHS.map((m, i) => {
          const on = draft.seasonMonths.includes(i + 1);
          return <button key={m} type="button" className={chip(on)} onClick={() => set('seasonMonths', on ? draft.seasonMonths.filter(x => x !== i + 1) : [...draft.seasonMonths, i + 1].sort((a, b) => a - b))}>{m}</button>;
        })}</div></div>
      <div><span className={label}>Weather it needs</span>
        <div className="flex flex-wrap gap-1">{CONDITIONS.map(c => {
          const on = draft.conditions.includes(c);
          return <button key={c} type="button" className={chip(on)} onClick={() => set('conditions', on ? draft.conditions.filter(x => x !== c) : [...draft.conditions, c])}>{c.replace('_', ' ')}</button>;
        })}</div></div>
    </Section>

    <Section title="Effort & cost" open={!!(draft.effortMin || draft.diyLow || draft.proLow)}>
      <div className="grid grid-cols-3 gap-2">
        <div><label className={label} htmlFor="pj-emin">Hours (low)</label><input id="pj-emin" inputMode="decimal" className={field} value={draft.effortMin} onChange={e => set('effortMin', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-emax">Hours (high)</label><input id="pj-emax" inputMode="decimal" className={field} value={draft.effortMax} onChange={e => set('effortMax', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-indoor">Where</label>
          <select id="pj-indoor" className={field} value={draft.indoor} onChange={e => set('indoor', e.target.value as Draft['indoor'])}>
            <option value="">Not said</option><option value="yes">Indoors</option><option value="no">Outdoors</option>
          </select></div>
      </div>
      <div><label className={label} htmlFor="pj-enote">Effort note</label><input id="pj-enote" className={field} value={draft.effortNote} maxLength={64} onChange={e => set('effortNote', e.target.value)} placeholder="plus cure, 1–2 Saturdays…" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label} htmlFor="pj-dl">DIY $ low</label><input id="pj-dl" inputMode="decimal" className={field} value={draft.diyLow} onChange={e => set('diyLow', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-dh">DIY $ high</label><input id="pj-dh" inputMode="decimal" className={field} value={draft.diyHigh} onChange={e => set('diyHigh', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-pl">Hired $ low</label><input id="pj-pl" inputMode="decimal" className={field} value={draft.proLow} onChange={e => set('proLow', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-ph">Hired $ high</label><input id="pj-ph" inputMode="decimal" className={field} value={draft.proHigh} onChange={e => set('proHigh', e.target.value)} /></div>
      </div>
      <div><label className={label} htmlFor="pj-cnote">Cost note</label><input id="pj-cnote" className={field} value={draft.costNote} maxLength={190} onChange={e => set('costNote', e.target.value)} /></div>
      <div><label className={label} htmlFor="pj-value">Value / ROI</label><input id="pj-value" className={field} value={draft.valueNote} maxLength={255} onChange={e => set('valueNote', e.target.value)} /></div>
      <div><label className={label} htmlFor="pj-serves">Serves (comma-separated)</label><input id="pj-serves" className={field} value={draft.serves} onChange={e => set('serves', e.target.value)} placeholder="safety, health, resale" />
        <p className="mt-1 text-xs text-slate-500">Matched to your charter's weights to decide what comes first.</p></div>
    </Section>

    <Section title="Target" open={!!draft.metricTarget}>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label} htmlFor="pj-msrc">Measure</label><input id="pj-msrc" className={field} value={draft.metricSource} maxLength={48} onChange={e => set('metricSource', e.target.value)} placeholder="weight" /></div>
        <div><label className={label} htmlFor="pj-munit">Unit</label><input id="pj-munit" className={field} value={draft.metricUnit} maxLength={16} onChange={e => set('metricUnit', e.target.value)} placeholder="lb" /></div>
        <div><label className={label} htmlFor="pj-mstart">Start</label><input id="pj-mstart" inputMode="decimal" className={field} value={draft.metricStart} onChange={e => set('metricStart', e.target.value)} /></div>
        <div><label className={label} htmlFor="pj-mtarget">Target</label><input id="pj-mtarget" inputMode="decimal" className={field} value={draft.metricTarget} onChange={e => set('metricTarget', e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={draft.involvesChildren} onChange={e => set('involvesChildren', e.target.checked)} />
        Involves children (its photos stay on your device; only captions are saved)
      </label>
    </Section>

    {project && <StepsSection state={state} project={project} />}
    {project && <ProjectData state={state} project={project} />}
    {project && <ProjectJournal state={state} project={project} />}
    {project && <LinksSection state={state} project={project} onOpen={onOpen} />}
    {project && <ConcernsOf state={state} project={project} />}

    {project && <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
      {project.source === 'import' && <p className="mb-2">Came from your import{project.importKey ? ` (${project.importKey})` : ''}. Edits here are kept; a re-import never overwrites them.</p>}
      <button type="button" className="text-rose-300 underline" disabled={state.busy} onClick={() => void remove()}>Delete this project</button>
    </div>}
  </Drawer>;
}

function StepsSection({ state, project }: { state: ProjectsState; project: Project }) {
  const [title, setTitle] = useState('');
  const steps = project.steps;
  const add = async () => {
    if (!title.trim()) return;
    if (await state.run(() => projectsApi.addStep(project.uuid, { title }))) setTitle('');
  };
  const move = (i: number, by: number) => {
    const order = steps.map(s => s.uuid);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    void state.run(() => projectsApi.reorderSteps(project.uuid, order));
  };
  return <Section title={`Steps (${project.progress.steps.done}/${project.progress.steps.total})`} open>
    <ul className="flex flex-col gap-1">{steps.map((s, i) => <li key={s.uuid} className="flex items-center gap-2 rounded border border-slate-800 px-2 py-1">
      <input type="checkbox" aria-label={`Done: ${s.title}`} checked={s.status === 'done'} disabled={state.busy}
        onChange={e => void state.run(() => projectsApi.updateStep(project.uuid, s.uuid, { status: e.target.checked ? 'done' : 'todo' }))} />
      <input defaultValue={s.title} key={`${s.uuid}-${s.title}`} aria-label="Step title" maxLength={190}
        className={`min-w-0 flex-1 bg-transparent text-sm ${s.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-100'}`}
        onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.title) void state.run(() => projectsApi.updateStep(project.uuid, s.uuid, { title: v })); }} />
      <select aria-label="Who" value={s.who} className="rounded border border-slate-800 bg-slate-950 text-xs"
        onChange={e => void state.run(() => projectsApi.updateStep(project.uuid, s.uuid, { who: e.target.value as typeof s.who }))}>
        <option value="me">Me</option><option value="someone">Someone</option><option value="athena">Athena</option>
      </select>
      <button type="button" aria-label="Move up" className="text-xs text-slate-400" disabled={i === 0 || state.busy} onClick={() => move(i, -1)}>↑</button>
      <button type="button" aria-label="Move down" className="text-xs text-slate-400" disabled={i === steps.length - 1 || state.busy} onClick={() => move(i, 1)}>↓</button>
      <button type="button" aria-label={`Remove step ${s.title}`} className="text-xs text-slate-500 hover:text-rose-300" disabled={state.busy}
        onClick={() => void state.run(() => projectsApi.removeStep(project.uuid, s.uuid))}>✕</button>
    </li>)}</ul>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void add(); }}>
      <input className={`${field} min-w-0 flex-1`} value={title} maxLength={190} onChange={e => setTitle(e.target.value)} placeholder="Add a step" aria-label="New step" />
      <button className="dashboard-chat-cta shrink-0" disabled={state.busy || !title.trim()}>Add</button>
    </form>
  </Section>;
}

function LinkGroup({ title, items, onOpen, onRemove, busy }: {
  title: string; items: { project: Project; note: string | null }[]; onOpen: (uuid: string) => void; onRemove?: (uuid: string) => void; busy: boolean;
}) {
  if (!items.length) return null;
  return <div><span className={label}>{title}</span>
    <ul className="flex flex-col gap-1">{items.map(({ project: p, note }) => <li key={p.uuid} className="flex items-center gap-2 text-sm">
      <button type="button" className="min-w-0 flex-1 truncate text-left text-cyan-200 underline-offset-2 hover:underline" onClick={() => onOpen(p.uuid)}>{p.title}</button>
      {note && <span className="hidden truncate text-xs text-slate-500 sm:inline">{note}</span>}
      <StateChip state={p.effectiveStatus} />
      {onRemove && <button type="button" aria-label={`Unlink ${p.title}`} className="text-xs text-slate-500 hover:text-rose-300" disabled={busy} onClick={() => onRemove(p.uuid)}>✕</button>}
    </li>)}</ul>
  </div>;
}

function LinksSection({ state, project, onOpen }: { state: ProjectsState; project: Project; onOpen: (uuid: string) => void }) {
  const l = linksOf(state.snap, project.uuid);
  const [relation, setRelation] = useState<Relation>('contributes_to');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const others = useMemo(() => state.snap.projects.filter(p => p.uuid !== project.uuid).sort((a, b) => a.title.localeCompare(b.title)), [state.snap.projects, project.uuid]);
  const add = async () => {
    if (!target) return;
    if (await state.run(() => projectsApi.addLink(project.uuid, relation, target, note || undefined))) { setTarget(''); setNote(''); }
  };
  const unlink = (rel: Relation, from: string, to: string) => void state.run(() => projectsApi.removeLink(from, rel, to));
  return <Section title="Connected projects" open={!!(l.partOf.length || l.contributors.length || l.needs.length || l.neededBy.length)}>
    <LinkGroup title="Part of" items={l.partOf} onOpen={onOpen} busy={state.busy} onRemove={to => unlink('contributes_to', project.uuid, to)} />
    <LinkGroup title="Needs first" items={l.needs} onOpen={onOpen} busy={state.busy} onRemove={to => unlink('depends_on', project.uuid, to)} />
    <LinkGroup title="Its parts" items={l.contributors} onOpen={onOpen} busy={state.busy} onRemove={from => unlink('contributes_to', from, project.uuid)} />
    <LinkGroup title="Waiting on this" items={l.neededBy} onOpen={onOpen} busy={state.busy} onRemove={from => unlink('depends_on', from, project.uuid)} />
    <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void add(); }}>
      <div className="flex gap-2">
        <select aria-label="Relation" className={`${field} max-w-[9rem]`} value={relation} onChange={e => setRelation(e.target.value as Relation)}>
          <option value="contributes_to">Part of</option><option value="depends_on">Needs first</option>
        </select>
        <select aria-label="Project" className={`${field} min-w-0 flex-1`} value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">Choose a project…</option>
          {others.map(p => <option key={p.uuid} value={p.uuid}>{p.kind === 'program' ? '▸ ' : ''}{p.title}</option>)}
        </select>
      </div>
      {relation === 'depends_on' && <input className={field} value={note} maxLength={190} onChange={e => setNote(e.target.value)} placeholder="Why (optional) — survey first" aria-label="Why" />}
      <button className="dashboard-chat-cta self-start" disabled={state.busy || !target}>Link</button>
    </form>
  </Section>;
}

function ConcernsOf({ state, project }: { state: ProjectsState; project: Project }) {
  const linked = state.snap.concerns.filter(c => c.projects.includes(project.uuid));
  const [pick, setPick] = useState('');
  const available = state.snap.concerns.filter(c => !c.projects.includes(project.uuid));
  const setLinked = (c: Concern, on: boolean) => state.run(() => projectsApi.updateConcern(c.uuid, {
    projects: on ? [...c.projects, project.uuid] : c.projects.filter(u => u !== project.uuid),
  }));
  if (!state.snap.concerns.length) return null;
  return <Section title="Concerns it answers" open={linked.length > 0}>
    {linked.map(c => <div key={c.uuid} className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{c.title}</span>
      <span className="text-xs text-slate-500">{PRIORITY_LABEL[c.severity]} · {c.status}</span>
      <button type="button" aria-label={`Unlink ${c.title}`} className="text-xs text-slate-500 hover:text-rose-300" disabled={state.busy} onClick={() => void setLinked(c, false)}>✕</button>
    </div>)}
    {available.length > 0 && <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const c = available.find(x => x.uuid === pick); if (c) void setLinked(c, true).then(() => setPick('')); }}>
      <select aria-label="Concern" className={`${field} min-w-0 flex-1`} value={pick} onChange={e => setPick(e.target.value)}>
        <option value="">Link a concern…</option>
        {available.map(c => <option key={c.uuid} value={c.uuid}>{c.title}</option>)}
      </select>
      <button className="dashboard-chat-cta shrink-0" disabled={state.busy || !pick}>Link</button>
    </form>}
  </Section>;
}

// --- Concerns ---------------------------------------------------------------

export function ConcernList({ state, area, onOpen, onNew }: { state: ProjectsState; area: Area; onOpen: (uuid: string) => void; onNew: () => void }) {
  const [showResolved, setShowResolved] = useState(false);
  const list = state.snap.concerns.filter(c => c.area === area && (showResolved || c.status !== 'resolved'))
    .sort((a, b) => (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0) || b.severity - a.severity);
  const resolved = state.snap.concerns.filter(c => c.area === area && c.status === 'resolved').length;
  return <div className="flex flex-col gap-2">
    {list.length ? <ul className="flex flex-col gap-2">{list.map(c => <li key={c.uuid}>
      <button type="button" onClick={() => onOpen(c.uuid)} className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-cyan-700">
        <span className="min-w-0"><strong className="block text-sm font-medium text-slate-100">{c.title}</strong>
          <small className="text-xs text-slate-400">{[c.frequency, `${c.projects.length} project${c.projects.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small></span>
        <span className={`shrink-0 text-[10px] uppercase tracking-widest ${c.status === 'resolved' ? 'text-slate-500' : c.severity >= 5 ? 'text-rose-300' : c.severity >= 4 ? 'text-amber-200' : 'text-slate-300'}`}>
          {c.status === 'open' ? PRIORITY_LABEL[c.severity] : c.status}
        </span>
      </button>
    </li>)}</ul> : <p className="dashboard-empty">No open concerns.</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" className="dashboard-chat-cta" onClick={onNew}>Add a concern <span>+</span></button>
      {resolved > 0 && <button type="button" className="text-xs text-slate-400 underline" onClick={() => setShowResolved(v => !v)}>{showResolved ? 'Hide' : 'Show'} resolved ({resolved})</button>}
    </div>
  </div>;
}

export function ConcernEditor({ state, uuid, area, onClose, onOpenProject }: {
  state: ProjectsState; uuid: string | null; area: Area; onClose: () => void; onOpenProject: (uuid: string) => void;
}) {
  const concern = uuid ? state.snap.concerns.find(c => c.uuid === uuid) ?? null : null;
  const [d, setD] = useState(() => ({
    title: concern?.title ?? '', severity: concern?.severity ?? 3, frequency: concern?.frequency ?? '',
    likelyCause: concern?.likelyCause ?? '', goalImpact: concern?.goalImpact ?? '', assessment: concern?.assessment ?? '',
    status: concern?.status ?? 'open' as Concern['status'], projects: concern?.projects ?? [] as string[],
  }));
  const [pick, setPick] = useState('');
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(x => ({ ...x, [k]: v }));
  const byId = new Map(state.snap.projects.map(p => [p.uuid, p]));
  const save = async () => {
    const input = { ...d, area, frequency: d.frequency || null, likelyCause: d.likelyCause || null, goalImpact: d.goalImpact || null, assessment: d.assessment || null };
    if (await state.run(() => (concern ? projectsApi.updateConcern(concern.uuid, input) : projectsApi.createConcern(input)))) onClose();
  };
  const remove = async () => {
    if (!concern || !window.confirm(`Delete the concern "${concern.title}"? Marking it resolved keeps its history instead.`)) return;
    if (await state.run(() => projectsApi.removeConcern(concern.uuid))) onClose();
  };
  return <Drawer eyebrow={`${AREA_LABEL[area].toUpperCase()} CONCERN`} title={concern ? concern.title : 'New concern'} onClose={onClose}
    footer={<div className="p-3"><button type="button" className="dashboard-chat-cta" disabled={state.busy || !d.title.trim()} onClick={() => void save()}>{state.busy ? 'Saving…' : concern ? 'Save changes' : 'Add concern'}</button></div>}>
    {state.error && <p role="alert" className="mb-3 text-sm text-amber-200">{state.error}</p>}
    <div className="flex flex-col gap-3">
      <div><label className={label} htmlFor="cn-title">What's wrong</label><input id="cn-title" className={field} value={d.title} maxLength={190} onChange={e => set('title', e.target.value)} placeholder="Crawlspace smells musty" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label} htmlFor="cn-sev">Severity</label>
          <select id="cn-sev" className={field} value={d.severity} onChange={e => set('severity', Number(e.target.value))}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{PRIORITY_LABEL[n]}</option>)}</select></div>
        <div><label className={label} htmlFor="cn-status">Status</label>
          <select id="cn-status" className={field} value={d.status} onChange={e => set('status', e.target.value as Concern['status'])}>
            <option value="open">Open</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select></div>
      </div>
      <div><label className={label} htmlFor="cn-freq">How often / when</label><input id="cn-freq" className={field} value={d.frequency} maxLength={64} onChange={e => set('frequency', e.target.value)} placeholder="during rain" /></div>
      <div><label className={label} htmlFor="cn-cause">Likely cause</label><textarea id="cn-cause" rows={2} className={field} value={d.likelyCause} onChange={e => set('likelyCause', e.target.value)} /></div>
      <div><label className={label} htmlFor="cn-impact">What it affects</label><input id="cn-impact" className={field} value={d.goalImpact} maxLength={255} onChange={e => set('goalImpact', e.target.value)} /></div>
      <div><label className={label} htmlFor="cn-assess">Current thinking</label><textarea id="cn-assess" rows={4} className={field} value={d.assessment} onChange={e => set('assessment', e.target.value)} /></div>
      <div><span className={label}>Projects that answer it</span>
        <ul className="mb-2 flex flex-col gap-1">{d.projects.map(u => byId.get(u)).filter(Boolean).map(p => <li key={p!.uuid} className="flex items-center gap-2 text-sm">
          <button type="button" className="min-w-0 flex-1 truncate text-left text-cyan-200 hover:underline" onClick={() => onOpenProject(p!.uuid)}>{p!.title}</button>
          <StateChip state={p!.effectiveStatus} />
          <button type="button" aria-label={`Unlink ${p!.title}`} className="text-xs text-slate-500 hover:text-rose-300" onClick={() => set('projects', d.projects.filter(x => x !== p!.uuid))}>✕</button>
        </li>)}</ul>
        <div className="flex gap-2">
          <select aria-label="Project" className={`${field} min-w-0 flex-1`} value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Add a project…</option>
            {state.snap.projects.filter(p => !d.projects.includes(p.uuid)).sort((a, b) => a.title.localeCompare(b.title)).map(p => <option key={p.uuid} value={p.uuid}>{p.title}</option>)}
          </select>
          <button type="button" className="dashboard-chat-cta shrink-0" disabled={!pick} onClick={() => { set('projects', [...d.projects, pick]); setPick(''); }}>Add</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Finishing these doesn't resolve it — you do, once it's actually gone.</p>
      </div>
      {concern && <button type="button" className="self-start text-xs text-rose-300 underline" disabled={state.busy} onClick={() => void remove()}>Delete this concern</button>}
    </div>
  </Drawer>;
}

// --- Charter ----------------------------------------------------------------

export function CharterView({ state, area, onEdit }: { state: ProjectsState; area: Area; onEdit: () => void }) {
  const charter = state.snap.charters.find(c => c.area === area);
  if (!charter) return <div className="flex flex-col gap-2">
    <p className="dashboard-empty">No charter yet — the vision and rules you decide {AREA_LABEL[area].toLowerCase()} projects by.</p>
    <button type="button" className="dashboard-chat-cta self-start" onClick={onEdit}>Write one <span>↗</span></button>
  </div>;
  const weights = Object.entries(charter.weights || {}).sort((a, b) => b[1] - a[1]);
  const vision = charter.body.split(/\n## /)[0].replace(/^## [^\n]*\n/, '').trim();
  return <div className="flex flex-col gap-3">
    <p className="text-sm leading-relaxed text-slate-200">{vision.length > 420 ? `${vision.slice(0, 420)}…` : vision}</p>
    {weights.length > 0 && <div className="flex flex-wrap gap-1">{weights.map(([k, v]) => <span key={k} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{k.replace(/_/g, ' ')} <b className="text-cyan-200">{v}</b></span>)}</div>}
    <button type="button" className="dashboard-chat-cta self-start" onClick={onEdit}>Read &amp; edit <span>↗</span></button>
  </div>;
}

export function CharterEditor({ state, area, onClose }: { state: ProjectsState; area: Area; onClose: () => void }) {
  const charter = state.snap.charters.find(c => c.area === area);
  const [body, setBody] = useState(charter?.body ?? '');
  const [rows, setRows] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(charter?.weights || {}).sort((a, b) => b[1] - a[1]).map(([key, value]) => ({ key, value: String(value) })));
  const save = async () => {
    const weights: Record<string, number> = {};
    for (const r of rows) if (r.key.trim() && r.value.trim() !== '') weights[r.key.trim().toLowerCase().replace(/\s+/g, '_')] = Number(r.value);
    if (await state.run(() => projectsApi.putCharter(area, body, Object.keys(weights).length ? weights : null))) onClose();
  };
  return <Drawer eyebrow={`${AREA_LABEL[area].toUpperCase()} CHARTER`} title="How you decide" onClose={onClose}
    footer={<div className="p-3"><button type="button" className="dashboard-chat-cta" disabled={state.busy || !body.trim()} onClick={() => void save()}>{state.busy ? 'Saving…' : 'Save charter'}</button></div>}>
    {state.error && <p role="alert" className="mb-3 text-sm text-amber-200">{state.error}</p>}
    <p className="mb-3 text-xs text-slate-400">Your vision, priorities and rules. Athena reads it when she orders projects and suggests help; the weights below decide how much each kind of value counts (0–10).</p>
    <label className={label} htmlFor="ch-body">Charter</label>
    <textarea id="ch-body" rows={16} className={`${field} font-mono text-xs`} value={body} onChange={e => setBody(e.target.value)} />
    <span className={`${label} mt-4`}>Weights</span>
    <ul className="flex flex-col gap-1">{rows.map((r, i) => <li key={i} className="flex gap-2">
      <input aria-label="Goal" className={`${field} min-w-0 flex-1`} value={r.key} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
      <input aria-label="Weight" inputMode="decimal" className={`${field} w-16`} value={r.value} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
      <button type="button" aria-label={`Remove ${r.key}`} className="text-xs text-slate-500 hover:text-rose-300" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
    </li>)}</ul>
    <button type="button" className="mt-2 text-xs text-cyan-300 underline" onClick={() => setRows([...rows, { key: '', value: '5' }])}>Add a weight</button>
  </Drawer>;
}

// --- The drawers, as one piece a page can drop in ----------------------------

export type ProjectsDrawer =
  | { kind: 'project'; uuid: string | null; area?: Area }
  | { kind: 'concern'; uuid: string | null; area: Area }
  | { kind: 'charter'; area: Area }
  | null;

export function ProjectsDrawers({ state, drawer, setDrawer }: { state: ProjectsState; drawer: ProjectsDrawer; setDrawer: (d: ProjectsDrawer) => void }) {
  if (!drawer) return null;
  const close = () => setDrawer(null);
  const openProject = (uuid: string) => setDrawer({ kind: 'project', uuid });
  if (drawer.kind === 'project') return <ProjectEditor key={drawer.uuid ?? 'new'} state={state} uuid={drawer.uuid} area={drawer.area} onClose={close} onOpen={openProject} />;
  if (drawer.kind === 'concern') return <ConcernEditor key={drawer.uuid ?? 'new'} state={state} uuid={drawer.uuid} area={drawer.area} onClose={close} onOpenProject={openProject} />;
  return <CharterEditor state={state} area={drawer.area} onClose={close} />;
}
