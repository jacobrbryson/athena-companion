import { createContext, useContext, useState, type ReactNode } from 'react';
import { actionsApi } from '../api/companion';
import {
  projectsApi, criteriaOf, phaseNames, COMPLETION_LABEL,
  type FollowUp, type Project, type ProjectStep, type WorkSession,
} from '../api/projects';
import type { ProjectsState } from './Projects';

/**
 * What it takes to finish a project, at the top of its drawer (core_api
 * services/projects/execution.js): the next action and why it's ready, what's
 * blocked and when to look again, the time set aside, and what done looks like.
 *
 * Everything shown is the server's derivation from the snapshot — nothing is
 * worked out twice here. Writes are the person's own edits, except putting a
 * session on the calendar, which is the approved calendar action (the button
 * is the approval) and never happens any other way.
 */

const box = 'rounded-lg border border-slate-800 bg-slate-950/60 p-3';
const head = 'mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cyan-300';
const small = 'rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-cyan-600 disabled:opacity-50';
const primary = 'rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50';
const field = 'rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const minutes = (m: number) => (m < 90 ? `${m} min` : `${Math.round(m / 30) / 2} h`);
/** A datetime-local value, in the browser's zone, for a moment. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const tomorrowAtNine = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; };
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

/** 'panel' draws the cards as section panels — the project's own dashboard page; 'box' is the drawer's compact look. */
export const CardLook = createContext<'box' | 'panel'>('box');

function Card({ title, icon, children, aside }: { title: string; icon: string; children: ReactNode; aside?: ReactNode }) {
  if (useContext(CardLook) === 'panel') {
    return <section className="section-panel">
      <header><h2><span aria-hidden="true" className="mr-2 text-cyan-300">{icon}</span>{title}</h2>{aside}</header>
      {children}
    </section>;
  }
  return <section className={box}>
    <div className={head}><span aria-hidden="true">{icon}</span><span className="flex-1">{title}</span>{aside}</div>
    {children}
  </section>;
}

export function ProjectExecution({ state, project }: { state: ProjectsState; project: Project }) {
  const ex = project.execution;
  if (!ex && !project.doneWhen) return null;
  return <div className="mb-4 flex flex-col gap-3">
    {ex && <NextActionCard state={state} project={project} />}
    {ex && ex.blockedSteps.length > 0 && <BlockersCard state={state} project={project} />}
    {ex && <SessionsCard state={state} project={project} />}
    <DoneWhenCard state={state} project={project} />
  </div>;
}

export function NextActionCard({ state, project }: { state: ProjectsState; project: Project }) {
  const ex = project.execution!;
  const next = ex.nextAction;
  const [scheduling, setScheduling] = useState(false);
  if (!next) {
    return <Card title="Next action" icon="▶">
      <p className="text-sm text-slate-200">{ex.noActionReason || 'Nothing ready yet.'}</p>
      {ex.unblock && <p className="mt-1 text-xs text-amber-200">To get it moving: {ex.unblock}</p>}
    </Card>;
  }
  const step = project.steps.find(s => s.uuid === next.stepUuid);
  const chips = [
    next.effortMinutes ? `⏱ ${minutes(next.effortMinutes)}` : null,
    next.indoor === false ? '☀ Outdoor' : next.indoor === true ? '⌂ Indoor' : null,
    ...next.conditions.map(c => c.replace('_', ' ')),
    next.dueOn ? `due ${next.dueOn}` : null,
    next.who === 'someone' ? 'someone else does it' : null,
  ].filter(Boolean) as string[];
  const finish = async () => {
    const checks = criteriaOf(step?.acceptanceCriteria);
    if (checks.length && !window.confirm(`Mark "${next.title}" done? You're confirming:\n\n${checks.map(c => `✓ ${c}`).join('\n')}`)) return;
    await state.run(() => projectsApi.updateStep(project.uuid, next.stepUuid, { status: 'done' }));
  };
  return <Card title="Next action" icon="▶">
    <h3 className="text-base font-semibold text-slate-100">{next.title}</h3>
    {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{chips.map(c => <span key={c} className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{c}</span>)}</div>}
    {next.detail && <p className="mt-2 text-sm text-slate-300">{next.detail}</p>}
    <p className="mt-2 text-xs text-emerald-200/90">Ready — {next.reasons.slice(0, 3).join(' · ')}</p>
    {next.startsNew && <p className="mt-1 text-xs text-slate-400">This would start the project.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {next.status === 'todo'
        ? <button type="button" className={primary} disabled={state.busy} onClick={() => void state.run(() => projectsApi.updateStep(project.uuid, next.stepUuid, { status: 'in_progress' }))}>Start this task</button>
        : <button type="button" className={primary} disabled={state.busy} onClick={() => void finish()}>Mark step done</button>}
      <button type="button" className={small} disabled={state.busy} onClick={() => setScheduling(s => !s)}>Schedule time…</button>
    </div>
    {scheduling && <ScheduleForm state={state} project={project} stepUuid={next.stepUuid} defaultMinutes={next.effortMinutes ?? 60} onDone={() => setScheduling(false)} />}
  </Card>;
}

function ScheduleForm({ state, project, stepUuid, defaultMinutes, onDone, session }: {
  state: ProjectsState; project: Project; stepUuid: string | null; defaultMinutes: number; onDone: () => void; session?: WorkSession;
}) {
  const [at, setAt] = useState(localInput(session ? new Date(session.plannedStart) : tomorrowAtNine()));
  const [mins, setMins] = useState(String(session?.plannedMinutes ?? defaultMinutes));
  const save = async () => {
    const plannedStart = new Date(at).toISOString();
    const plannedMinutes = Math.round(Number(mins));
    const ok = await state.run(() => session
      ? projectsApi.updateSession(project.uuid, session.uuid, { plannedStart, plannedMinutes })
      : projectsApi.addSession(project.uuid, { stepUuid, plannedStart, plannedMinutes }));
    if (ok) onDone();
  };
  return <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label className="text-xs text-slate-400">When<br /><input type="datetime-local" className={field} value={at} onChange={e => setAt(e.target.value)} required /></label>
    <label className="text-xs text-slate-400">Minutes<br /><input inputMode="numeric" className={`${field} w-20`} value={mins} onChange={e => setMins(e.target.value)} required /></label>
    <button className={primary} disabled={state.busy || !at || !Number(mins)}>{session ? 'Move' : 'Set aside'}</button>
    <button type="button" className="text-xs text-slate-400 underline" onClick={onDone}>Cancel</button>
  </form>;
}

export function BlockersCard({ state, project }: { state: ProjectsState; project: Project }) {
  const list = project.execution!.blockedSteps;
  const recheck = (f: FollowUp) => {
    const date = window.prompt(`Still waiting on ${f.waitingOn || f.blockedOn || 'it'}? Check again on (YYYY-MM-DD):`, inDays(3));
    if (date) void state.run(() => projectsApi.updateStep(project.uuid, f.stepUuid, { reviewAt: date.trim() }));
  };
  return <Card title="Blocked & waiting" icon="⚠">
    <ul className="flex flex-col gap-2">{list.map(f => <li key={f.key} className="flex flex-col gap-1 border-b border-slate-800 pb-2 last:border-0 last:pb-0">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${f.due ? 'bg-rose-400' : f.triage ? 'bg-amber-400' : 'bg-sky-400'}`} />
        <strong className="min-w-0 flex-1 text-sm font-medium text-slate-100">{f.stepTitle}</strong>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${f.due ? 'border-rose-700 text-rose-200' : f.triage ? 'border-amber-700 text-amber-200' : 'border-slate-700 text-slate-400'}`}>
          {f.due ? 'Check now' : f.triage ? 'No check-back' : `Check ${dayOf(f.reviewAt!)}`}
        </span>
      </span>
      <small className="pl-4 text-xs text-slate-400">{[f.blockedOn, f.waitingOn && `waiting on ${f.waitingOn}`].filter(Boolean).join(' — ') || 'Marked blocked'}</small>
      {(f.due || f.triage) && <small className="pl-4 text-xs text-amber-200">{f.action}</small>}
      <span className="flex gap-2 pl-4">
        <button type="button" className={small} disabled={state.busy} onClick={() => recheck(f)}>{f.triage ? 'Pick a check-back day' : 'Still waiting…'}</button>
        <button type="button" className={small} disabled={state.busy} onClick={() => void state.run(() => projectsApi.updateStep(project.uuid, f.stepUuid, { status: 'todo' }))}>Unblocked</button>
      </span>
    </li>)}</ul>
  </Card>;
}

export function SessionsCard({ state, project }: { state: ProjectsState; project: Project }) {
  const ex = project.execution!;
  const [moving, setMoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [calendarNote, setCalendarNote] = useState('');
  const stepTitle = (s: WorkSession) => (s.stepUuid ? project.steps.find(x => x.uuid === s.stepUuid)?.title : null) || 'General work';
  const toCalendar = async (s: WorkSession) => {
    setCalendarNote('');
    try {
      const { action } = await actionsApi.perform('put_project_session_on_calendar', { session_uuid: s.uuid });
      setCalendarNote(action.status === 'done' ? 'On your calendar.' : action.error || 'The calendar didn\'t take it.');
      state.reload();
    } catch (e) {
      setCalendarNote(`${(e as Error).message} The session is still planned here.`);
    }
  };
  const howItWent = async (s: WorkSession, status: 'completed' | 'skipped') => {
    const ok = await state.run(() => projectsApi.updateSession(project.uuid, s.uuid, { status, madeProgress: status === 'completed' ? true : null }));
    // A session finishing never finishes its step — ask.
    const step = s.stepUuid ? project.steps.find(x => x.uuid === s.stepUuid) : null;
    if (ok && status === 'completed' && step && step.status !== 'done' && window.confirm(`Is "${step.title}" itself done?`)) {
      await state.run(() => projectsApi.updateStep(project.uuid, step.uuid, { status: 'done' }));
    }
  };
  const prep = ex.preparation;
  return <Card title="Work sessions" icon="▦" aside={<button type="button" className={small} onClick={() => setAdding(a => !a)}>＋ Add session</button>}>
    {adding && <ScheduleForm state={state} project={project} stepUuid={ex.nextAction?.stepUuid ?? null} defaultMinutes={ex.nextAction?.effortMinutes ?? 60} onDone={() => setAdding(false)} />}
    {ex.sessionsToCheckIn.map(s => <div key={s.uuid} className="mb-2 rounded border border-amber-800/60 p-2">
      <p className="text-sm text-amber-100">How did {dayOf(s.plannedStart)}'s session on "{stepTitle(s)}" go?</p>
      <span className="mt-1 flex gap-2">
        <button type="button" className={small} disabled={state.busy} onClick={() => void howItWent(s, 'completed')}>Got work done</button>
        <button type="button" className={small} disabled={state.busy} onClick={() => void howItWent(s, 'skipped')}>Didn't happen</button>
      </span>
    </div>)}
    {!ex.upcomingSessions.length && !ex.sessionsToCheckIn.length && !adding && <p className="text-sm text-slate-400">
      Nothing scheduled.{ex.unscheduled.length ? ` ${ex.unscheduled.length} ready step${ex.unscheduled.length === 1 ? '' : 's'} could use a slot.` : ''}
    </p>}
    <ul className="flex flex-col gap-2">{ex.upcomingSessions.map(s => <li key={s.uuid} className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <strong className="font-medium text-slate-100">{when(s.plannedStart)}</strong>
        <span className="text-xs text-slate-400">{minutes(s.plannedMinutes)} · {stepTitle(s)}</span>
        <span className="flex-1" />
        {s.calendarEventId && s.calendarInSync !== false
          ? <span className="text-[10px] uppercase tracking-widest text-emerald-300">On calendar</span>
          : <button type="button" className={small} disabled={state.busy} onClick={() => void toCalendar(s)}>{s.calendarEventId ? 'Update calendar' : 'Add to calendar'}</button>}
        <button type="button" className={small} disabled={state.busy} onClick={() => setMoving(m => (m === s.uuid ? null : s.uuid))}>Move</button>
        <button type="button" className={small} disabled={state.busy} onClick={() => void state.run(() => projectsApi.updateSession(project.uuid, s.uuid, { status: 'cancelled' }))}>Cancel</button>
      </span>
      {moving === s.uuid && <ScheduleForm state={state} project={project} stepUuid={s.stepUuid} defaultMinutes={s.plannedMinutes} session={s} onDone={() => setMoving(null)} />}
    </li>)}</ul>
    {calendarNote && <p role="status" className="mt-2 text-xs text-cyan-200">{calendarNote}</p>}
    {prep && <details className="mt-3 text-xs text-slate-300">
      <summary className="cursor-pointer text-slate-400">Before {dayOf(prep.plannedStart)}: what to have ready</summary>
      <ul className="mt-2 list-disc pl-5">
        <li>Work: {prep.work.title}{prep.work.acceptanceCriteria.length ? ` — done means ${prep.work.acceptanceCriteria.join('; ')}` : ''}</li>
        {prep.materials.length > 0 && <li>Materials: {prep.materials.map(m => `${m.label}${m.value ? ` (${m.value})` : ''}`).join(', ')}</li>}
        {prep.toVerify.length > 0 && <li>Still to verify: {prep.toVerify.join(', ')}</li>}
        {prep.blockers.map(b => <li key={b.text} className="text-amber-200">{b.text} {b.action}</li>)}
        {(prep.weather.needs.length > 0 || prep.weather.outdoor) && <li>Weather: {prep.weather.outdoor ? 'outdoor work' : ''}{prep.weather.needs.length ? `${prep.weather.outdoor ? ', ' : ''}needs ${prep.weather.needs.join(', ').replace(/_/g, ' ')}` : ''} — check the forecast first.</li>}
      </ul>
    </details>}
  </Card>;
}

export function DoneWhenCard({ state, project }: { state: ProjectsState; project: Project }) {
  const criteria = criteriaOf(project.doneWhen);
  const confirmed = new Set(project.doneWhenConfirmed ?? []);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.doneWhen ?? '');
  const completion = project.completion;
  const closed = project.status === 'done' || project.status === 'dropped';
  const toggle = (c: string) => {
    const next = confirmed.has(c) ? [...confirmed].filter(x => x !== c) : [...confirmed, c];
    void state.run(() => projectsApi.update(project.uuid, { doneWhenConfirmed: next }));
  };
  const save = async () => {
    if (await state.run(() => projectsApi.update(project.uuid, { doneWhen: text.trim() || null }))) setEditing(false);
  };
  const aside = !closed && <button type="button" className={small} onClick={() => { setText(project.doneWhen ?? ''); setEditing(e => !e); }}>{criteria.length ? 'Edit' : 'Add'}</button>;
  return <Card title="Done when" icon="✓" aside={aside}>
    {completion && <p className="mb-2 text-xs text-slate-400"><b className="text-slate-200">{COMPLETION_LABEL[completion.state]}</b> — {completion.message}</p>}
    {editing ? <div className="flex flex-col gap-2">
      <textarea rows={5} className={`${field} w-full`} value={text} onChange={e => setText(e.target.value)} placeholder={'One check per line:\nGate opens and latches correctly\nTrash cans roll through easily'} aria-label="Done when" />
      <span className="flex gap-2"><button type="button" className={primary} disabled={state.busy} onClick={() => void save()}>Save</button>
        <button type="button" className="text-xs text-slate-400 underline" onClick={() => setEditing(false)}>Cancel</button></span>
    </div>
      : criteria.length ? <ul className="flex flex-col gap-1">{criteria.map(c => <li key={c}>
        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input type="checkbox" className="mt-1" checked={confirmed.has(c) || project.status === 'done'} disabled={state.busy || closed} onChange={() => toggle(c)} />
          <span className={confirmed.has(c) ? 'text-slate-400' : ''}>{c}</span>
        </label>
      </li>)}</ul>
        : <p className="text-sm text-slate-400">Say what finished looks like, so ticking the last step isn't mistaken for done.</p>}
    {!closed && project.closeout?.canClose && <CloseOut state={state} project={project} />}
  </Card>;
}

/** Closing out: the person confirming each check. Shown once every step is done. */
export function CloseOut({ state, project }: { state: ProjectsState; project: Project }) {
  const close = async () => {
    const checks = criteriaOf(project.doneWhen);
    const message = checks.length
      ? `Close out "${project.title}"? You're confirming:\n\n${checks.map(c => `✓ ${c}`).join('\n')}`
      : `Mark "${project.title}" finished?`;
    if (!window.confirm(message)) return;
    await state.run(() => projectsApi.update(project.uuid, { status: 'done', outcomeConfirmed: true }));
  };
  const left = project.closeout?.toVerify ?? [];
  return <div className="mt-3 flex flex-col gap-1">
    {left.length > 0 && <p className="text-xs text-amber-200">Still marked to verify: {left.join(', ')}</p>}
    <button type="button" className={`${primary} self-start`} disabled={state.busy} onClick={() => void close()}>Close out project…</button>
  </div>;
}

/** The step editor's execution fields: what it needs first, its blocker follow-through, criteria and effort. */
export function StepDetails({ state, project, step }: { state: ProjectsState; project: Project; step: ProjectStep }) {
  const others = project.steps.filter(s => s.uuid !== step.uuid);
  const needs = new Set(step.dependsOn ?? []);
  const patch = (p: Parameters<typeof projectsApi.updateStep>[2]) => void state.run(() => projectsApi.updateStep(project.uuid, step.uuid, p));
  const toggleNeed = (uuid: string) => void state.run(() => needs.has(uuid)
    ? projectsApi.removeDependency(project.uuid, step.uuid, uuid)
    : projectsApi.addDependency(project.uuid, step.uuid, uuid));
  const blur = (key: 'blockedOn' | 'waitingOnActor' | 'unblockAction' | 'acceptanceCriteria', current: string | null | undefined) =>
    (e: { target: { value: string } }) => { const v = e.target.value.trim() || null; if (v !== (current ?? null)) patch({ [key]: v }); };
  const input = 'w-full rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs';
  const listId = `phases-${project.uuid}`;
  return <div className="mt-1 flex flex-col gap-2 rounded border border-slate-800 p-2 text-xs text-slate-400">
    <label>Phase (groups the plan; doesn't make it wait)
      <input className={input} list={listId} defaultValue={step.phase ?? ''} key={`ph-${step.phase}`} maxLength={64} placeholder="Concrete and Foundations"
        onBlur={e => { const v = e.target.value.trim() || null; if (v !== (step.phase ?? null)) patch({ phase: v }); }} />
      <datalist id={listId}>{phaseNames(project).map(n => <option key={n} value={n} />)}</datalist>
    </label>
    <label>Status{' '}
      <select className="rounded border border-slate-800 bg-slate-950 text-xs" value={step.status} disabled={state.busy}
        onChange={e => patch({ status: e.target.value as ProjectStep['status'] })}>
        <option value="todo">To do</option><option value="in_progress">Under way</option><option value="blocked">Blocked</option>
        <option value="done">Done</option><option value="skipped">Skipped</option>
      </select></label>
    {step.status === 'blocked' && <div className="grid grid-cols-2 gap-2">
      <label>What's in the way<input className={input} defaultValue={step.blockedOn ?? ''} key={`b-${step.blockedOn}`} maxLength={190} placeholder="permit response" onBlur={blur('blockedOn', step.blockedOn)} /></label>
      <label>Waiting on<input className={input} defaultValue={step.waitingOnActor ?? ''} key={`w-${step.waitingOnActor}`} maxLength={190} placeholder="the county" onBlur={blur('waitingOnActor', step.waitingOnActor)} /></label>
      <label>Check back<input type="date" className={input} value={step.reviewAt ? step.reviewAt.slice(0, 10) : ''} onChange={e => patch({ reviewAt: e.target.value || null })} /></label>
      <label>What would clear it<input className={input} defaultValue={step.unblockAction ?? ''} key={`u-${step.unblockAction}`} maxLength={190} placeholder="Call the permit office" onBlur={blur('unblockAction', step.unblockAction)} /></label>
    </div>}
    {others.length > 0 && <div>Needs first:
      <span className="mt-1 flex flex-wrap gap-1">{others.map(o => <button key={o.uuid} type="button" disabled={state.busy} onClick={() => toggleNeed(o.uuid)}
        className={`rounded-full border px-2 py-0.5 ${needs.has(o.uuid) ? 'border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-500'}`}>{o.title}</button>)}</span>
    </div>}
    <label>Done means (one per line)<textarea rows={2} className={input} defaultValue={step.acceptanceCriteria ?? ''} key={`a-${step.acceptanceCriteria}`} onBlur={blur('acceptanceCriteria', step.acceptanceCriteria)} /></label>
    <label>Effort (minutes){' '}<input inputMode="numeric" className="w-20 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs" defaultValue={step.effortMinutes ?? ''} key={`e-${step.effortMinutes}`}
      onBlur={e => { const v = e.target.value.trim() === '' ? null : Math.round(Number(e.target.value)); if (v !== step.effortMinutes) patch({ effortMinutes: v }); }} /></label>
  </div>;
}
