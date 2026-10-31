import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { actionsApi, type AthenaAction } from '../api/companion';
import { dashboardApi } from '../api/dashboard';
import { ActionProposal } from './ActionProposal';
import { ICONS } from './MailBundles';

/**
 * What Athena has done with the person's email: the approved mail actions from
 * the same history every other action leaves. Undo only PROPOSES moving an
 * archive's emails back — the same approval card as any other action — so
 * nothing in Gmail changes until Approve.
 */
type Kind = 'archive' | 'receipts' | 'events' | 'unsubscribe';
const MAIL_ACTIONS: Record<string, { kind: Kind; title: (n: number) => string }> = {
  archive_emails: { kind: 'archive', title: n => `Archived ${n === 1 ? '1 email' : `${n} emails`}` },
  unarchive_emails: { kind: 'archive', title: n => `Moved ${n === 1 ? '1 email' : `${n} emails`} back to the inbox` },
  file_receipt_email: { kind: 'receipts', title: n => `Filed ${n === 1 ? '1 receipt' : `${n} receipts`}` },
  file_travel_or_school_email: { kind: 'events', title: () => 'Added an event and filed the email' },
  delete_email: { kind: 'archive', title: n => `Moved ${n === 1 ? '1 email' : `${n} emails`} to Trash` },
  add_email_events: { kind: 'events', title: n => `Added ${n === 1 ? '1 event' : `${n} events`}` },
  unsubscribe_senders: { kind: 'unsubscribe', title: n => `Unsubscribed from ${n === 1 ? '1 sender' : `${n} senders`}` },
};
const PAGE = 10;

function count(a: AthenaAction) {
  const p = (a.params || {}) as Record<string, unknown>;
  const list = p.email_triage_uuids ?? p.items ?? p.senders;
  return Array.isArray(list) ? list.length : 1;
}

function when(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export function MailActivity({ refreshKey, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [rows, setRows] = useState<AthenaAction[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [proposal, setProposal] = useState<AthenaAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let live = true;
    actionsApi.history(100)
      .then(history => { if (live) { setRows(history.filter(a => MAIL_ACTIONS[a.action_id] && a.status === 'done')); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey, tick]);

  const undo = useCallback(async (a: AthenaAction) => {
    setBusy(true); setError('');
    try { setProposal((await dashboardApi.mailUndoArchive(a.uuid)).action); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, []);
  const settle = async (decide: (uuid: string) => Promise<{ action: AthenaAction }>) => {
    if (!proposal) return;
    setBusy(true); setError('');
    try {
      setProposal((await decide(proposal.uuid)).action);
      setTick(t => t + 1);
      onChanged?.();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const shell = (body: ReactNode, pager?: ReactNode) => <section className="mail-activity-panel section-panel-wide">
    <header>
      <span className="mail-activity-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      </span>
      <div><h3>Recent activity</h3><p>A history of what Athena has done with your emails.</p></div>
    </header>
    {body}
    {pager}
  </section>;

  if (proposal) return shell(<div>
    {error && <p className="dashboard-notice" role="status">{error}</p>}
    <ActionProposal action={proposal} busy={busy}
      onConfirm={() => void settle(actionsApi.confirm)} onDecline={() => void settle(actionsApi.decline)}
      onDismiss={() => setProposal(null)} />
  </div>);
  if (failed) return shell(<p className="dashboard-notice" role="status">Couldn't load your mail activity. Try again in a moment.</p>);
  if (!rows) return shell(<p className="dashboard-empty">Loading…</p>);
  if (!rows.length) return shell(<p className="dashboard-empty">Nothing yet. What you approve here will show up in this list.</p>);

  // An archive is undone once a finished unarchive names it.
  const undone = new Set(rows.filter(a => a.action_id === 'unarchive_emails').map(a => String((a.params as { undoes?: string } | null)?.undoes ?? '')));
  const pages = Math.ceil(rows.length / PAGE);
  const current = Math.min(page, pages - 1);
  return shell(<>
    {error && <p className="dashboard-notice" role="status">{error}</p>}
    <ul className="mail-activity">{rows.slice(current * PAGE, current * PAGE + PAGE).map(a => {
      const meta = MAIL_ACTIONS[a.action_id];
      const canUndo = a.action_id === 'archive_emails' && !undone.has(a.uuid);
      return <li key={a.uuid} className={`mail-activity-row mail-card-${meta.kind}`}>
        <span className="mail-card-icon" aria-hidden="true">{ICONS[meta.kind]}</span>
        <strong>{meta.title(count(a))}</strong>
        <small>{a.summary}</small>
        <time>{when(a.executed_at)}</time>
        {canUndo
          ? <button className="mail-undo" disabled={busy} onClick={() => void undo(a)}><span aria-hidden="true">↺</span> Undo</button>
          : <span className={a.reversible || a.action_id === 'archive_emails' ? 'mail-badge' : 'mail-badge mail-badge-danger'}>
            {a.action_id === 'archive_emails' ? 'Undone' : a.action_id === 'unarchive_emails' ? 'Done' : a.reversible ? 'Reversible in Gmail' : "Can't undo"}
          </span>}
      </li>;
    })}</ul>
  </>, pages > 1 && <nav className="mail-pager" aria-label="Activity pages">
    <small>{current * PAGE + 1}–{Math.min(rows.length, current * PAGE + PAGE)} of {rows.length}</small>
    <button disabled={current === 0} onClick={() => setPage(current - 1)}>← Previous</button>
    <span>Page {current + 1} of {pages}</span>
    <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next →</button>
  </nav>);
}
