import { useState } from 'react';
import { actionsApi } from '../api/companion';
import type { GoogleTask } from '../api/dashboard';

/**
 * The Tasks card's list (owner, 2026-11-13): open Google Tasks, soonest due
 * first, each with a checkbox. Ticking runs the complete_google_task direct
 * action — the click is the approval, recorded and audited like the Family
 * page's chore checkbox — and an Undo reopens it for a few seconds.
 */
export function TasksCardBody({ tasks, total, limit = 5, today }: { tasks: GoogleTask[]; total: number; limit?: number; today: string }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ task: GoogleTask; kind: 'done' | 'error'; text: string } | null>(null);

  const shown = tasks.filter(t => !done[t.id] || note?.task.id === t.id).slice(0, limit);
  const hidden = Math.max(0, total - Object.values(done).filter(Boolean).length - shown.filter(t => !done[t.id]).length);

  async function tick(t: GoogleTask) {
    if (busy) return;
    setBusy(t.id);
    setDone(d => ({ ...d, [t.id]: true }));
    try {
      await actionsApi.perform('complete_google_task', { task_id: t.id, task_list: t.listId });
      setNote({ task: t, kind: 'done', text: `“${t.title}” done` });
    } catch (e) {
      setDone(d => ({ ...d, [t.id]: false }));
      setNote({ task: t, kind: 'error', text: `Couldn’t tick it off${(e as Error)?.message ? `: ${(e as Error).message}` : '.'}` });
    } finally {
      setBusy(null);
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

  const when = (due: string | null) => !due ? null : due < today ? `Overdue · ${due}` : due === today ? 'Due today' : `Due ${due}`;

  if (!tasks.length) return <p className="dashboard-empty">Nothing open on your Google Tasks.</p>;
  return <>
    <ul className="dashboard-data-list task-list">
      {shown.map(t => {
        const ticked = !!done[t.id];
        const due = when(t.due);
        return <li key={t.id} className={ticked ? 'task-done' : ''}>
          <button type="button" className="task-check" aria-pressed={ticked} disabled={ticked || !!busy}
            aria-label={ticked ? `${t.title} is done` : `Tick off ${t.title}`} onClick={() => void tick(t)}>{ticked ? '✓' : ''}</button>
          <div><strong>{t.title}</strong><small className={t.due && t.due < today && !ticked ? 'task-overdue' : undefined}>{[due, t.list].filter(Boolean).join(' · ')}</small></div>
        </li>;
      })}
    </ul>
    {hidden > 0 && <p className="source-note">+{hidden} more</p>}
    {note && <p className="task-note" role="status">{note.text}{note.kind === 'done' && <button type="button" onClick={() => void undo()} disabled={!!busy}>Undo</button>}<button type="button" aria-label="Dismiss" onClick={() => setNote(null)}>×</button></p>}
  </>;
}
