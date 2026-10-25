import { useEffect, useState, type ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import { Stat } from './SectionMetric';
import { Picture } from './ProjectJournal';
import { CardLook, NextActionCard, BlockersCard, SessionsCard, DoneWhenCard, StepDetails } from './ProjectExecution';
import { linksOf, StateChip, budgetLine, effortLine, costLine, toVerify, type ProjectsState } from './Projects';
import {
  projectsApi, AREA_LABEL, PRIORITY_LABEL, COMPLETION_LABEL, phaseNames,
  type Project, type ProjectEntry, type ProjectItem, type ProjectStep, type PlanPhase,
} from '../api/projects';

/**
 * One project's own page — what opening a project from a list leads to
 * (owner, 2026-10-25, after the side-yard concept): the next action, the
 * done-when checklist, the plan, sessions, budget and materials, photos,
 * what's in the way, and what it's connected to, on one screen. Editing every
 * field stays in the drawer (Edit project); the quick things — start a step,
 * tick a check, schedule time — happen here.
 */

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const chip = 'inline-flex items-center gap-1 rounded-lg border border-slate-600/80 bg-slate-950/60 px-2 py-1 text-xs text-slate-200';

/** The newest stored photo, as an object URL for the header's backdrop. Device-only photos never count. */
function useCover(project: Project) {
  const [url, setUrl] = useState<string | null>(null);
  const cover = project.media?.cover ?? null;
  useEffect(() => {
    if (!cover) { setUrl(null); return; }
    let alive = true;
    let made: string | null = null;
    projectsApi.image(project.uuid, cover).then(b => { made = URL.createObjectURL(b); if (alive) setUrl(made); }).catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [project.uuid, cover]);
  return url;
}

function statusOf(p: Project): { value: string; note: string; tone: 'good' | 'ok' | 'low' | 'alert' | 'idle' } {
  const ex = p.execution;
  const c = p.completion;
  if (p.status === 'done') return { value: 'Finished', note: c?.state === 'verified_complete' ? 'outcome confirmed' : 'marked done', tone: 'good' };
  if (p.status === 'dropped') return { value: 'Dropped', note: 'kept for its history', tone: 'idle' };
  if (ex?.dueFollowUps.length) return { value: 'Follow-up due', note: ex.dueFollowUps[0].stepTitle, tone: 'alert' };
  if (c && ['outcome_unverified', 'ready_for_confirmation'].includes(c.state)) return { value: 'Closing out', note: COMPLETION_LABEL[c.state], tone: 'ok' };
  if (p.effectiveStatus === 'waiting') return { value: 'On hold', note: p.waitingOn ? `waiting on ${p.waitingOn}` : 'waiting', tone: 'low' };
  if (p.effectiveStatus === 'blocked' || (ex && !ex.nextAction && ex.blockedSteps.length)) return { value: 'Blocked', note: ex?.noActionReason ?? 'needs something first', tone: 'low' };
  if (ex?.nextAction) return { value: p.effectiveStatus === 'active' ? 'On track' : 'Ready to start', note: 'next step ready', tone: 'good' };
  return { value: 'Planning', note: ex?.noActionReason ?? 'add the steps', tone: 'idle' };
}

export function ProjectDashboard({ state, project, backLabel, onBack, onEdit, onOpen, onAsk }: {
  state: ProjectsState; project: Project; backLabel: string;
  onBack: () => void; onEdit: () => void; onOpen: (uuid: string) => void; onAsk: (text: string) => void;
}) {
  const cover = useCover(project);
  const done = project.progress.steps.done;
  const total = project.progress.steps.total;
  const pct = total ? Math.round((done / total) * 100) : null;
  const status = statusOf(project);
  const month = new Date().getMonth() + 1;
  const inSeason = !project.seasonMonths || project.seasonMonths.includes(month);
  const target = project.hardDeadline ?? project.endsOn;
  const chips = [
    AREA_LABEL[project.primaryArea],
    project.effort.note,
    project.kind && project.kind !== 'program' ? project.kind : project.kind === 'program' ? 'Program' : null,
    `Priority ${project.priority} · ${PRIORITY_LABEL[project.priority]}`,
    project.refCode ? `${project.refCode}${project.revision ? ` v${project.revision}` : ''}` : null,
  ].filter(Boolean) as string[];

  return <>
    <PageHeader
      eyebrow={`${AREA_LABEL[project.primaryArea].toUpperCase()} PROJECT`}
      title={project.title}
      blurb={project.goal ?? undefined}
      backdrop={cover ?? undefined}
      controls={<div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {project.pinnedAt && project.status !== 'done' && <span className={`${chip} text-amber-200`}>▲ Front of the line</span>}
          {chips.map(c => <span key={c} className={chip}>{c}</span>)}
          <StateChip state={project.effectiveStatus} />
        </div>
        <button type="button" className="self-start text-xs text-cyan-300 underline-offset-2 hover:underline" onClick={onBack}>‹ {backLabel}</button>
      </div>}
      aside={<div className="flex flex-col items-end gap-2">
        <button type="button" className="dashboard-chat-cta" onClick={onEdit}>✎ Edit project</button>
        <button type="button" className="text-xs text-slate-300 underline-offset-2 hover:underline" onClick={() => onAsk(`Let's work on "${project.title}". What should I do next, and what can you take off my plate?`)}>Talk it through with Athena ↗</button>
      </div>}
    />
    <div className="stat-row">
      <Stat label="Target completion" icon="Calendar" value={target ? new Date(`${target}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'} note={effortLine(project) ?? (project.hardDeadline ? 'hard deadline' : undefined)} />
      <Stat label="Budget" icon="Tasks" value={project.budget?.working != null ? money(project.budget.working) : '—'} note={budgetLine(project) ?? costLine(project) ?? 'no budget yet'} />
      <Stat label="Completion" icon="Completed" value={pct === null ? '—' : `${pct}%`} note={total ? `${done} of ${total} steps` : 'no steps yet'} tone={pct === 100 ? 'good' : undefined} />
      <Stat label="Status" icon="Projects" value={status.value} note={status.note} tone={status.tone} />
      <Stat label="Season" icon="Weather" value={MONTH[month - 1]} note={!inSeason ? 'out of season' : project.conditions.length ? `needs ${project.conditions.join(', ').replace(/_/g, ' ')} — check the forecast` : 'any weather noted'} tone={inSeason ? 'good' : 'low'} />
    </div>
    {/* Two columns that stack independently, so a long plan never leaves a
        gap beside it the way grid rows did. Below 1150px (where every section
        page goes single-column) the columns dissolve and `order` restores the
        reading order: next action, done when, plan, sessions, … */}
    <CardLook.Provider value="panel">
      <div className="flex flex-col gap-[15px] min-[1151px]:flex-row min-[1151px]:items-start">
        <div className={column}>
          <Slot order={1}>{project.execution && <NextActionCard state={state} project={project} />}</Slot>
          <Slot order={3}><PlanPanel state={state} project={project} /></Slot>
          <Slot order={5}><MaterialsPanel state={state} project={project} /></Slot>
        </div>
        <div className={column}>
          <Slot order={2}><DoneWhenCard state={state} project={project} /></Slot>
          <Slot order={4}>{project.execution && <SessionsCard state={state} project={project} />}</Slot>
          <Slot order={6}><RisksPanel state={state} project={project} /></Slot>
          <Slot order={7}><PhotosPanel project={project} onEdit={onEdit} /></Slot>
          <Slot order={8}><RelatedPanel state={state} project={project} onOpen={onOpen} /></Slot>
        </div>
      </div>
    </CardLook.Provider>
  </>;
}

const column = 'contents min-[1151px]:flex min-[1151px]:min-w-0 min-[1151px]:flex-1 min-[1151px]:flex-col min-[1151px]:gap-[15px]';

/** One place in the page's reading order; empty when its panel has nothing to show. */
function Slot({ order, children }: { order: number; children: ReactNode }) {
  if (!children) return null;
  return <div className="flex min-w-0 flex-col gap-[15px]" style={{ order }}>{children}</div>;
}

function Panel({ title, icon, note, children, wide }: { title: string; icon: string; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <section className={`section-panel${wide ? ' section-panel-wide' : ''}`}>
    <header><h2><span aria-hidden="true" className="mr-2 text-cyan-300">{icon}</span>{title}</h2>{note && <span>{note}</span>}</header>
    {children}
  </section>;
}

/** Phases from the server, or worked out here for a closed project (the server derives them for open ones only). */
function phasesOf(project: Project): PlanPhase[] {
  if (project.execution?.phases) return project.execution.phases;
  const steps = [...project.steps].sort((a, b) => a.ordinal - b.ordinal);
  if (!steps.some(s => s.phase)) return [];
  const groups = new Map<string | null, ProjectStep[]>();
  for (const s of steps) groups.set(s.phase || null, [...(groups.get(s.phase || null) ?? []), s]);
  const out = [...groups.entries()].map(([name, list]) => {
    const counted = list.filter(s => s.status !== 'skipped');
    const days = list.map(s => s.dueOn).filter((d): d is string => !!d).sort();
    return { name, stepUuids: list.map(s => s.uuid), done: counted.filter(s => s.status === 'done').length, total: counted.length,
      blocked: list.filter(s => s.status === 'blocked').length, from: days[0] ?? null, to: days[days.length - 1] ?? null };
  });
  return [...out.filter(g => g.name !== null), ...out.filter(g => g.name === null)];
}

const shortDay = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * The steps, grouped by phase when the plan has phases (each with done/total
 * and its dates), else in one list. ⋯ opens a step's phase, prerequisites,
 * blocker and criteria. A phase never makes anything wait — "needs first" does.
 */
function PlanPanel({ state, project }: { state: ProjectsState; project: Project }) {
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState('');
  const phases = phasesOf(project);
  const nextUuid = project.execution?.nextAction?.stepUuid ?? null;
  // The phase holding the next action starts open; the rest fold to one line each.
  const [shown, setShown] = useState<Set<string>>(() => new Set(phases.filter(g => nextUuid && g.stepUuids.includes(nextUuid)).map(g => g.name ?? '')));
  const ready = new Set((project.execution?.executableSteps ?? []).map(s => s.uuid));
  const titleOf = new Map(project.steps.map(s => [s.uuid, s.title]));
  const numberOf = new Map(project.steps.map((s, i) => [s.uuid, i + 1]));
  const byUuid = new Map(project.steps.map(s => [s.uuid, s]));
  const add = async () => {
    if (!title.trim()) return;
    if (await state.run(() => projectsApi.addStep(project.uuid, { title, ...(phase.trim() ? { phase: phase.trim() } : {}) }))) setTitle('');
  };
  const toggle = (key: string) => setShown(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const row = (s: ProjectStep) => {
    const waiting = (s.dependsOn ?? []).filter(u => !['done', 'skipped'].includes(byUuid.get(u)?.status ?? 'done'));
    const badge = s.status === 'done' ? 'bg-emerald-600 text-white' : ready.has(s.uuid) ? 'bg-cyan-600 text-white' : s.status === 'blocked' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300';
    return <li key={s.uuid} className="border-b border-slate-800/80 py-2 last:border-0">
      <div className="flex items-center gap-3">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${badge}`}>{s.status === 'done' ? '✓' : numberOf.get(s.uuid)}</span>
        <span className={`min-w-0 flex-1 text-sm ${s.status === 'done' ? 'text-slate-500 line-through' : s.status === 'skipped' ? 'text-slate-600 line-through' : 'text-slate-100'}`}>{s.title}</span>
        <span className="shrink-0 text-xs text-slate-400">
          {s.status === 'blocked' ? 'Blocked' : ready.has(s.uuid) ? 'Ready' : waiting.length ? 'Waiting' : s.status === 'in_progress' ? 'Under way' : ''}
          {s.dueOn ? ` · due ${s.dueOn.slice(5)}` : ''}{s.effortMinutes ? ` · ${s.effortMinutes}m` : ''}
        </span>
        <input type="checkbox" aria-label={`Done: ${s.title}`} checked={s.status === 'done'} disabled={state.busy}
          onChange={e => void state.run(() => projectsApi.updateStep(project.uuid, s.uuid, { status: e.target.checked ? 'done' : 'todo' }))} />
        <button type="button" aria-label={`More about ${s.title}`} aria-expanded={open === s.uuid} className="text-slate-400" onClick={() => setOpen(o => (o === s.uuid ? null : s.uuid))}>⋯</button>
      </div>
      {waiting.length > 0 && open !== s.uuid && <small className="block pl-9 text-[11px] text-slate-500">Needs: {waiting.map(u => titleOf.get(u)).join(', ')}</small>}
      {open === s.uuid && <div className="pl-9"><StepDetails state={state} project={project} step={s} /></div>}
    </li>;
  };

  return <Panel title="Project plan" icon="◎" note={`${project.progress.steps.done}/${project.progress.steps.total} done`}>
    {!project.steps.length && <p className="dashboard-empty">No steps yet — add the first one below.</p>}
    {phases.length
      ? <ol className="flex flex-col">{phases.map((g, i) => {
        const key = g.name ?? '';
        const isOpen = shown.has(key);
        const complete = g.total > 0 && g.done === g.total;
        return <li key={key || '(none)'} className="border-b border-slate-800/80 last:border-0">
          <button type="button" aria-expanded={isOpen} onClick={() => toggle(key)} className="flex w-full items-center gap-3 py-2 text-left">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${complete ? 'bg-emerald-600 text-white' : g.stepUuids.includes(nextUuid ?? '') ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{complete ? '✓' : g.name ? i + 1 : '·'}</span>
            <span className="min-w-0 flex-1 text-sm font-medium text-slate-100">{g.name ?? 'Other steps'}</span>
            {g.blocked > 0 && <span className="shrink-0 text-[10px] uppercase tracking-widest text-rose-300">{g.blocked} blocked</span>}
            <span className="w-10 shrink-0 text-right text-xs text-slate-400">{g.done} / {g.total}</span>
            <span className="hidden w-28 shrink-0 text-right text-xs text-slate-400 sm:inline">{g.from ? (g.to && g.to !== g.from ? `${shortDay(g.from)} – ${shortDay(g.to)}` : shortDay(g.from)) : ''}</span>
            <span aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
          </button>
          {isOpen && <ol className="mb-2 ml-3 border-l border-slate-800 pl-3">{g.stepUuids.map(u => byUuid.get(u)).filter((s): s is ProjectStep => !!s).map(row)}</ol>}
        </li>;
      })}</ol>
      : <ol className="flex flex-col">{project.steps.map(row)}</ol>}
    <form className="mt-2 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void add(); }}>
      <input className="min-w-0 flex-1 rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm" value={title} maxLength={190} onChange={e => setTitle(e.target.value)} placeholder="Add a step" aria-label="New step" />
      <input className="w-40 rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm" value={phase} maxLength={64} onChange={e => setPhase(e.target.value)} placeholder="Phase (optional)" aria-label="Phase for the new step" list={`plan-phases-${project.uuid}`} />
      <datalist id={`plan-phases-${project.uuid}`}>{phaseNames(project).map(n => <option key={n} value={n} />)}</datalist>
      <button className="dashboard-chat-cta shrink-0" disabled={state.busy || !title.trim()}>Add</button>
    </form>
  </Panel>;
}

/** The material takeoff as a checklist (ticked = confirmed), totalled against the budget. */
function MaterialsPanel({ state, project }: { state: ProjectsState; project: Project }) {
  const materials = (project.items ?? []).filter(i => i.kind === 'material');
  const priced = materials.filter(i => i.costLow !== null || i.costHigh !== null);
  const total = priced.reduce((t, i) => ({ lo: t.lo + (i.costLow ?? i.costHigh ?? 0), hi: t.hi + (i.costHigh ?? i.costLow ?? 0) }), { lo: 0, hi: 0 });
  const { working, ceiling } = project.budget ?? { working: null, ceiling: null };
  const toggle = (i: ProjectItem) => void state.run(() => projectsApi.updateItem(project.uuid, i.uuid, { status: i.status === 'confirmed' ? 'estimate' : 'confirmed' }));
  return <Panel title="Budget & materials" icon="$" note={working !== null ? `${money(working)} working${ceiling !== null ? ` · ${money(ceiling)} ceiling` : ''}` : undefined}>
    {priced.length > 0 && <div className="mb-3">
      <p className="text-sm text-slate-200">Priced lines: <b className="text-cyan-200">{total.lo === total.hi ? money(total.hi) : `${money(total.lo)}–${money(total.hi)}`}</b></p>
      {working !== null && <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800"><span className={`block h-full ${ceiling !== null && total.hi > ceiling ? 'bg-rose-500' : total.hi > working ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (total.hi / working) * 100)}%` }} /></div>}
    </div>}
    {materials.length ? <ul className="flex flex-col gap-1">{materials.map(i => <li key={i.uuid}>
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input type="checkbox" className="mt-1" checked={i.status === 'confirmed'} disabled={state.busy} onChange={() => toggle(i)} />
        <span className="flex-1">{i.label}{i.value ? ` (${[i.value, i.unit].filter(Boolean).join(' ')})` : ''}</span>
        {(i.costLow !== null || i.costHigh !== null) && <span className="text-xs text-slate-400">{i.costLow !== null && i.costHigh !== null && i.costLow !== i.costHigh ? `${money(i.costLow)}–${money(i.costHigh)}` : money((i.costHigh ?? i.costLow)!)}</span>}
      </label>
    </li>)}</ul> : <p className="dashboard-empty">No materials listed — add the takeoff in Edit project.</p>}
  </Panel>;
}

function PhotosPanel({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const [photos, setPhotos] = useState<ProjectEntry[]>([]);
  useEffect(() => {
    let alive = true;
    projectsApi.entries(project.uuid).then(r => { if (alive) setPhotos(r.entries.filter(e => e.type === 'photo').slice(0, 4)); }).catch(() => {});
    return () => { alive = false; };
  }, [project.uuid, project.media?.entries]);
  // With photos showing, adding one is a small link in the header; the big tile is only for an empty panel.
  const note = photos.length
    ? <span className="flex items-center gap-3">
      {project.media?.photos ? `${project.media.photos} in the journal` : null}
      <button type="button" onClick={onEdit} className="normal-case tracking-normal text-cyan-300 underline-offset-2 hover:underline">＋ Add</button>
    </span>
    : undefined;
  return <Panel title="Photos" icon="▣" note={note}>
    {photos.length
      ? <div className="grid grid-cols-2 gap-2">
        {photos.map(e => <figure key={e.uuid} className="relative">
          <Picture project={project} entry={e} />
          {e.phase && <figcaption className="absolute bottom-1 left-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] capitalize text-slate-200">{e.phase}</figcaption>}
        </figure>)}
      </div>
      : <button type="button" onClick={onEdit} className="flex w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-cyan-800 py-8 text-xs text-cyan-200 hover:border-cyan-500">
        <span className="text-2xl">＋</span>Add the first photo — a "before" is a good start
      </button>}
  </Panel>;
}

/** What's in the way: blocked steps with their check-back dates, and the specs still to verify. */
function RisksPanel({ state, project }: { state: ProjectsState; project: Project }) {
  const pending = toVerify(project);
  const blocked = project.execution?.blockedSteps.length ?? 0;
  if (blocked) {
    return <>
      <BlockersCard state={state} project={project} />
      {pending.length > 0 && <Panel title="To verify" icon="?"><VerifyList state={state} project={project} items={pending} /></Panel>}
    </>;
  }
  return <Panel title="Risks & blockers" icon="⚠">
    {pending.length ? <VerifyList state={state} project={project} items={pending} /> : <p className="dashboard-empty">Nothing in the way right now.</p>}
  </Panel>;
}

function VerifyList({ state, project, items }: { state: ProjectsState; project: Project; items: ProjectItem[] }) {
  return <ul className="flex flex-col gap-2">{items.map(i => <li key={i.uuid} className="flex items-center gap-2 text-sm">
    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
    <span className="min-w-0 flex-1 text-slate-200">{i.label}{i.note ? <small className="block text-xs text-slate-400">{i.note}</small> : null}</span>
    <button type="button" className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-cyan-600" disabled={state.busy}
      onClick={() => void state.run(() => projectsApi.updateItem(project.uuid, i.uuid, { status: 'confirmed' }))}>Verified</button>
  </li>)}</ul>;
}

function RelatedPanel({ state, project, onOpen }: { state: ProjectsState; project: Project; onOpen: (uuid: string) => void }) {
  const l = linksOf(state.snap, project.uuid);
  const concerns = state.snap.concerns.filter(c => c.projects.includes(project.uuid));
  const groups = [
    ['Part of', l.partOf], ['Needs first', l.needs], ['Its parts', l.contributors], ['Waiting on this', l.neededBy],
  ] as const;
  const any = groups.some(([, g]) => g.length) || concerns.length;
  return <Panel title="Related" icon="⛓">
    {!any && <p className="dashboard-empty">Not connected to other projects. Link one in Edit project.</p>}
    {groups.filter(([, g]) => g.length).map(([label, g]) => <div key={label} className="mb-2">
      <p className="text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
      {g.map(({ project: p }) => <button key={p.uuid} type="button" onClick={() => onOpen(p.uuid)} className="flex w-full items-center gap-2 py-1 text-left text-sm text-cyan-200 hover:underline">
        <span className="min-w-0 flex-1 truncate">→ {p.title}</span><StateChip state={p.effectiveStatus} />
      </button>)}
    </div>)}
    {concerns.length > 0 && <div><p className="text-[10px] uppercase tracking-widest text-slate-400">Answers</p>
      {concerns.map(c => <p key={c.uuid} className="py-1 text-sm text-slate-200">{c.title} <span className="text-xs text-slate-500">· severity {c.severity}</span></p>)}</div>}
  </Panel>;
}
