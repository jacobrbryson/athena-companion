import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { actionsApi } from '../api/companion';
import type { GoogleTask, JiraIssue } from '../api/dashboard';
import { isInProgress, isReadyToStart } from './workStatus';
import { CardHeader } from './YourDay';
import { AddTaskDrawer } from './AddTaskDrawer';
import { JiraIssueDrawer } from './JiraIssueDrawer';

/**
 * The Tasks card's list (owner, 2026-11-13): open Google Tasks, soonest due
 * first, each with a checkbox. Ticking runs the complete_google_task direct
 * action — the click is the approval, recorded and audited like the Family
 * page's chore checkbox — and an Undo reopens it for a few seconds.
 */
/**
 * Ticking a task off (and the Undo after it), shared by both Tasks cards.
 * The row stays put and strikes through over 1.5 s (owner, 2026-11-21); it
 * leaves once both the strike and Google's save are done, so a slow save just
 * holds it struck through a little longer. A failed save un-strikes it.
 */
const STRIKE_MS = 1500;
function useTaskTicks() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [striking, setStriking] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ task: GoogleTask; kind: 'done' | 'error'; text: string } | null>(null);
  const strike = (id: string, on: boolean) => setStriking(s => { const n = { ...s }; if (on) n[id] = true; else delete n[id]; return n; });

  async function tick(t: GoogleTask) {
    if (striking[t.id] || done[t.id] || busy === t.id) return;
    strike(t.id, true);
    const shown = new Promise(r => setTimeout(r, STRIKE_MS));
    try {
      await Promise.all([actionsApi.perform('complete_google_task', { task_id: t.id, task_list: t.listId }), shown]);
      setDone(d => ({ ...d, [t.id]: true }));
      setNote({ task: t, kind: 'done', text: `“${t.title}” done` });
    } catch (e) {
      setNote({ task: t, kind: 'error', text: `Couldn’t tick it off${(e as Error)?.message ? `: ${(e as Error).message}` : '.'}` });
    } finally {
      strike(t.id, false);
    }
  }

  async function undo() {
    if (!note || note.kind !== 'done' || busy) return;
    const t = note.task;
    setBusy(t.id);
    try {
      await actionsApi.perform('reopen_google_task', { task_id: t.id, task_list: t.listId });
      setDone(d => ({ ...d, [t.id]: false }));
      setNote(null);
    } catch (e) {
      setNote({ task: t, kind: 'error', text: `Couldn’t reopen it${(e as Error)?.message ? `: ${(e as Error).message}` : '.'}` });
    } finally {
      setBusy(null);
    }
  }
  return { done, striking, busy, note, setNote, tick, undo };
}

export function TasksCardBody({ tasks, total, limit = 5, today }: { tasks: GoogleTask[]; total: number; limit?: number; today: string }) {
  const { done, striking, busy, note, setNote, tick, undo } = useTaskTicks();
  const shown = tasks.filter(t => !done[t.id]).slice(0, limit);
  const hidden = Math.max(0, total - Object.values(done).filter(Boolean).length - shown.filter(t => !done[t.id]).length);

  const when = (due: string | null) => !due ? null : due < today ? `Overdue · ${due}` : due === today ? 'Due today' : `Due ${due}`;

  if (!tasks.length) return <p className="dashboard-empty">Nothing open on your Google Tasks.</p>;
  return <>
    <ul className="dashboard-data-list task-list">
      {shown.map(t => {
        const ticked = !!striking[t.id];
        const due = when(t.due);
        return <li key={t.id} className={ticked ? 'task-done' : ''}>
          <button type="button" className="task-check" aria-pressed={ticked} disabled={ticked || busy === t.id}
            aria-label={ticked ? `${t.title} is done` : `Tick off ${t.title}`} onClick={() => void tick(t)}>{ticked ? '✓' : ''}</button>
          <div><strong>{t.title}</strong><small className={t.due && t.due < today && !ticked ? 'task-overdue' : undefined}>{[due, t.list].filter(Boolean).join(' · ')}</small></div>
        </li>;
      })}
    </ul>
    {hidden > 0 && <p className="source-note">+{hidden} more</p>}
    {note && <p className="task-note" role="status">{note.text}{note.kind === 'done' && <button type="button" onClick={() => void undo()} disabled={!!busy}>Undo</button>}<button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>×</button></p>}
  </>;
}

// --- Home's Tasks card (owner mockup, 2026-11-17) ---------------------------
// Google Tasks and your open Jira issues together (owner, 2026-11-17). Google
// Tasks has no "in progress", so the ring splits by when things are due; only
// Jira's own status says In Progress. Each Google Task's list is its chip.

const LIST_ICONS: Record<string, ReactNode> = {
  house: <><path d="M3.6 11.2 12 4.6l8.4 6.6" /><path d="M5.8 9.6v9.6h12.4V9.6" /><path d="M10.2 19.2v-4.6h3.6v4.6" /></>,
  sprout: <><path d="M12 21v-9" /><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6ZM12 14c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5Z" /></>,
  car: <><path d="M5 16H3.5v-3.5L6 8h12l2.5 4.5V16H19M5 12.5h14" /><circle cx="7.5" cy="16" r="1.8" /><circle cx="16.5" cy="16" r="1.8" /><path d="M9.3 16h5.4" /></>,
  person: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20c0-3.8 3.1-6.3 7-6.3s7 2.5 7 6.3" /></>,
  work: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V5.5h6v2M3.5 12.5h17" /></>,
  cart: <><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  list: <><circle cx="5" cy="7" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="17" r="1" /><path d="M9 7h11M9 12h11M9 17h11" /></>,
};
type Tone = 'teal' | 'green' | 'violet' | 'blue' | 'amber' | 'cyan';
/** A list's chip, from its own name. Nothing else about the task is assumed. */
function listLook(name: string): { icon: string; tone: Tone } {
  if (/propert|house|repair|maint|reno/i.test(name)) return { icon: 'house', tone: 'teal' };
  if (/home|garden|yard|plant|herb/i.test(name)) return { icon: 'sprout', tone: 'green' };
  if (/car|vehicle|auto/i.test(name)) return { icon: 'car', tone: 'violet' };
  if (/personal|me\b|mine|private/i.test(name)) return { icon: 'person', tone: 'violet' };
  if (/work|job|office|career/i.test(name)) return { icon: 'work', tone: 'blue' };
  if (/grocer|shop|buy|errand/i.test(name)) return { icon: 'cart', tone: 'amber' };
  const tones: Tone[] = ['cyan', 'violet', 'amber', 'teal', 'blue'];
  return { icon: 'list', tone: tones[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length] };
}
function ListIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{LIST_ICONS[name] || LIST_ICONS.list}</svg>;
}

const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A ring split by when the open tasks are due, with the on-track share in the middle. */
function DueRing({ parts, percent }: { parts: { value: number; color: string }[]; percent: number | null }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const r = 40, c = 2 * Math.PI * r;
  let at = 0;
  return <div className="dt-ring" role="img" aria-label={percent == null ? 'No open tasks' : `${percent}% of open tasks are not overdue`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="dt-ring-track" />
      {total > 0 && parts.filter(p => p.value).map((p, i) => {
        const len = (p.value / total) * c;
        const seg = <circle key={i} cx="50" cy="50" r={r} stroke={p.color} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-at} />;
        at += len;
        return seg;
      })}
    </svg>
    <span><strong>{percent == null ? '—' : `${percent}%`}</strong><small>on track</small></span>
  </div>;
}

/** One row of the combined card: a Google Task (tickable) or a Jira issue (read in the app). */
type Row = { kind: 'google'; id: string; title: string; due: string | null; task: GoogleTask }
  | { kind: 'jira'; id: string; title: string; due: string | null; issue: JiraIssue; started: boolean };

/** Jira issues that aren't done; Jira's own "done" grouping, else the status name. */
export const openJira = (issues: JiraIssue[]) => issues.filter(i => i.statusCategory ? i.statusCategory !== 'done' : !/\b(done|closed|resolved|cancel)/i.test(i.status || ''));

const JIRA_ICON = <path d="M12 3 3 12l9 9 9-9-9-9Zm0 5.2L15.8 12 12 15.8 8.2 12 12 8.2Z" />;

export function TasksPanel({ tasks, jira = [], today, limit = 5, notes, googleReady }: {
  tasks: GoogleTask[]; total: number;
  /** Open Jira issues assigned to you, any site. */
  jira?: JiraIssue[];
  today: string; limit?: number;
  /** Source notes (a source that can't be read, lists that couldn't be read), shown above the list. */
  notes?: ReactNode;
  /** False when Google Tasks can't be read; Jira still shows. */
  googleReady: boolean;
}) {
  const { done, striking, busy, note, setNote, tick, undo } = useTaskTicks();
  // The Add task drawer (owner, 2026-11-20), and what it says once it's added.
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  // Everything stays in the app (owner, 2026-11-20): the card expands instead of linking out to Google Tasks.
  const [showAll, setShowAll] = useState(false);
  // A Jira issue opens in the app, read-only (owner, 2026-11-20) — never out to Jira.
  const [reading, setReading] = useState<JiraIssue | null>(null);
  const onOpenIssue = setReading;
  const started = (i: JiraIssue) => isInProgress(i);
  // The list is only what's near (owner, 2026-11-21): Google Tasks due tomorrow
  // or sooner (overdue included, undated left out), and Jira issues that are
  // In Progress or Ready to Start — In Progress first. The 7-day bars still
  // count everything open, since they're about the week ahead.
  const tomorrow = addDays(today, 1);
  const near = tasks.filter(t => !!t.due && t.due <= tomorrow);
  const jiraNear = jira.filter(i => started(i) || isReadyToStart(i));
  const toRows = (g: GoogleTask[], j: JiraIssue[]): Row[] => [
    ...g.map(t => ({ kind: 'google' as const, id: `g-${t.id}`, title: t.title, due: t.due, task: t })),
    ...j.map(i => ({ kind: 'jira' as const, id: `j-${i.site}-${i.key}`, title: i.title, due: i.due ? i.due.slice(0, 10) : null, issue: i, started: started(i) })),
  ];
  const rank = (r: Row) => r.kind === 'jira' && r.started ? 0 : 1;
  const rows = toRows(near, jiraNear).sort((x, y) => rank(x) - rank(y)
    || (x.due || '9999').localeCompare(y.due || '9999')
    || (x.kind === 'google' ? 0 : 1) - (y.kind === 'google' ? 0 : 1));
  const open = rows.filter(r => r.kind === 'jira' || !done[r.task.id]);
  const allOpen = toRows(tasks, jira).filter(r => r.kind === 'jira' || !done[r.task.id]);
  const openTotal = open.length;
  const inProgress = jiraNear.filter(started).length;
  const overdue = open.filter(r => r.due && r.due < today).length;
  const dueToday = open.filter(r => r.due === today).length;
  const later = open.filter(r => r.due && r.due > today).length;
  const undated = open.length - overdue - dueToday - later;
  const percent = open.length ? Math.round(((open.length - overdue) / open.length) * 100) : null;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i);
    return { day, count: allOpen.filter(r => r.due === day).length };
  });
  const peak = Math.max(1, ...week.map(d => d.count));
  const legend = [
    { label: 'Overdue', value: overdue, color: '#ff8267' },
    { label: 'Due today', value: dueToday, color: '#e8c35c' },
    { label: 'Later', value: later, color: '#2fd4c4' },
    { label: 'No date', value: undated, color: '#4d7a90' },
  ];
  const shown = open.slice(0, showAll ? undefined : limit);
  const hidden = Math.max(0, openTotal - shown.length);
  const nothing = !googleReady && !jira.length;

  const subtitle = nothing ? 'Google Tasks and Jira' : <>{openTotal} open{inProgress ? ` · ${inProgress} in progress` : ''} · {dueToday} due today{overdue ? <> · <b className="dt-warn">{overdue} overdue</b></> : null}</>;
  return <section className="dh-section dt-card dh-section-tasks" id="dashboard-tasks">
    <CardHeader icon="Tasks" title="Tasks" subtitle={subtitle} action="Add task" actionArrow="＋" onAction={() => setAdding(true)} />
    {open.length > 0 && <div className="dt-summary">
      <DueRing parts={legend} percent={percent} />
      <div className="dt-legend">
        <strong>{openTotal} Open Task{openTotal === 1 ? '' : 's'}</strong>
        {inProgress > 0 && <span><i style={{ background: '#39a8f8' }} />{inProgress} In Progress <em>Jira</em></span>}
        {legend.filter(l => l.value).slice(0, inProgress ? 2 : 3).map(l => <span key={l.label}><i style={{ background: l.color }} />{l.value} {l.label}</span>)}
      </div>
      <div className="dt-bars" role="img" aria-label={`Due over the next seven days: ${week.map(d => `${shortDate(d.day)} ${d.count}`).join(', ')}`}>
        {week.map((d, i) => <i key={d.day} className={i === 0 ? 'dt-bar-today' : d.count === peak && d.count > 0 ? 'dt-bar-peak' : undefined}
          style={{ height: `${d.count ? 22 + (d.count / peak) * 78 : 14}%` }} title={`${new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' })} · ${d.count} due`} />)}
        <small>Due · next 7 days</small>
      </div>
    </div>}
    <div className="dh-section-body dt-body">
      {notes}
      {!nothing && !open.length ? <p className="dashboard-empty">{allOpen.length ? 'Nothing due by tomorrow, and nothing In Progress or Ready to Start on Jira.' : 'Nothing open on Google Tasks or Jira.'}</p>
        : <ul className="dt-tasks">
          {shown.map(r => {
            const late = !!r.due && r.due < today;
            const dueWords = !r.due ? null : late ? `Overdue · ${shortDate(r.due)}` : r.due === today ? 'Due today' : `Due ${shortDate(r.due)}`;
            if (r.kind === 'jira') {
              const i = r.issue;
              return <li key={r.id} className={`dt-task-jira${r.started ? ' dt-task-started' : ''}`}>
                <button type="button" className="dt-check dt-check-jira" onClick={() => onOpenIssue(i)} aria-label={`Read ${i.key}`} title={`Read ${i.key}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">{JIRA_ICON}</svg>
                </button>
                <button type="button" className="dt-task-text" onClick={() => onOpenIssue(i)}>
                  <strong>{i.title}</strong>
                  <small className={late ? 'dt-warn' : undefined}>{i.key} · <span className={r.started ? 'dt-status-started' : undefined}>{i.status}</span>{dueWords ? ` · ${dueWords}` : ''}</small>
                </button>
                <span className="dt-chip dt-chip-blue" title={i.site}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">{JIRA_ICON}</svg>{i.project || 'Jira'}</span>
              </li>;
            }
            const t = r.task;
            const ticked = !!striking[t.id];
            const look = listLook(t.list);
            const when = dueWords || 'No due date';
            return <li key={r.id} className={ticked ? 'dt-task-done' : undefined}>
              <button type="button" className="dt-check" aria-pressed={ticked} disabled={ticked || busy === t.id}
                aria-label={ticked ? `${t.title} is done` : `Tick off ${t.title}`} onClick={() => void tick(t)}>
                {ticked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" /></svg>}
              </button>
              <div className="dt-task-text">
                <strong>{t.title}</strong>
                <small className={late && !ticked ? 'dt-warn' : undefined}><ListIcon name={look.icon} />{t.list} · {when}</small>
              </div>
              <span className={`dt-chip dt-chip-${look.tone}`}><ListIcon name={look.icon} />{t.list}</span>
            </li>;
          })}
        </ul>}
      {(hidden > 0 || showAll) && open.length > limit && <button type="button" className="dt-more-note dt-more-toggle" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>
        {showAll ? 'Show fewer' : `Show ${hidden} more`}</button>}
      {note && <p className="task-note" role="status">{note.text}{note.kind === 'done' && <button type="button" onClick={() => void undo()} disabled={!!busy}>Undo</button>}<button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>×</button></p>}
      {added && <p className="task-note" role="status">{added}<button type="button" aria-label="Dismiss" onClick={() => setAdded(null)}>×</button></p>}
    </div>
    {reading && createPortal(<JiraIssueDrawer issue={reading} onClose={() => setReading(null)} />, document.body)}
    {adding && createPortal(<AddTaskDrawer onClose={() => setAdding(false)} onAdded={setAdded} />, document.body)}
  </section>;
}
