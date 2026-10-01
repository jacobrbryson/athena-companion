import { useState } from 'react';
import { ActionProposal } from './ActionProposal';
import { dashboardApi, type MailBundles as Bundles } from '../api/dashboard';
import { actionsApi, type AthenaAction } from '../api/companion';

/**
 * The Mail card's point (docs/architecture/mail-card.md, phase 2): not a
 * preview of the inbox, but what Athena proposes to do with it, in bundles
 * one approval clears.
 *
 * Pressing a bundle only PROPOSES it. The same ActionProposal card every
 * other action uses then shows exactly what will happen, and nothing touches
 * Gmail until Approve — a bundle is many emails, which is a reason for the
 * approval, not a reason to skip it. On the Mail page each bundle can be
 * opened and any email unticked before it is proposed.
 */
type Kind = 'archive' | 'receipts' | 'events' | 'unsubscribe';

/** "Sat Oct 3, 8:00 AM" / "all day Fri Oct 2" — enough to catch a wrong date before approving. */
function when(start: string, allDay: boolean) {
  const d = new Date(allDay ? `${start.slice(0, 10)}T12:00:00` : start);
  if (Number.isNaN(d.getTime())) return start;
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return allDay ? `all day ${date}` : `${date}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function MailBundles({ bundles, compact, onOpenEmail, onChanged, onReviewEvents }: {
  bundles: Bundles; compact?: boolean;
  onOpenEmail: (uuid: string) => void; onChanged: () => void; onReviewEvents?: () => void;
}) {
  const [expanded, setExpanded] = useState<Kind | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<AthenaAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Undated events can't go in a bundle — there is nothing to put on the calendar.
  const senderList = bundles.unsubscribe?.senders ?? [];
  const usable = (kind: Kind): { uuid: string }[] => kind === 'events' ? bundles.events.items.filter(i => i.start)
    : kind === 'unsubscribe' ? senderList.map(s => ({ uuid: s.email_triage_uuid }))
      : bundles[kind].items;
  const chosen = (kind: Kind) => usable(kind).filter(i => !excluded.has(i.uuid)).map(i => i.uuid);
  const toggle = (uuid: string) => setExcluded(prev => {
    const next = new Set(prev);
    if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
    return next;
  });

  const propose = async (kind: Kind) => {
    const uuids = chosen(kind);
    if (!uuids.length) return;
    setBusy(true); setError('');
    try {
      const res = kind === 'archive' ? await dashboardApi.mailArchive(uuids)
        : kind === 'events' ? await dashboardApi.mailEvents(uuids)
        : kind === 'unsubscribe' ? await dashboardApi.mailUnsubscribe(uuids)
          : await dashboardApi.mailProposeGroup(uuids);
      setAction(res.action);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const settle = async (decide: (uuid: string) => Promise<{ action: AthenaAction }>) => {
    if (!action) return;
    setBusy(true); setError('');
    try {
      const res = await decide(action.uuid);
      setAction(res.action);
      setExcluded(new Set());
      setExpanded(null);
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const { archive, receipts, events, replies } = bundles;
  const nothing = !archive.count && !receipts.count && !events.count && !replies.count && !senderList.length;
  const senders = archive.senders.map(s => `${s.name}${s.count > 1 ? ` ×${s.count}` : ''}`).join(' · ');
  const merchants = [...new Set(receipts.items.map(r => r.merchant || r.from))].slice(0, 3).join(', ');
  const more = (count: number, shown: number) => count > shown ? ` · first ${shown} of ${count}` : '';
  const dated = events.items.filter(i => i.start);
  const undated = events.count - dated.length;
  const eventNote = [dated.slice(0, 2).map(i => `${i.title} · ${when(i.start!, i.all_day)}`).join('; '),
    undated > 0 ? `${undated} need${undated === 1 ? 's' : ''} a date — open ${undated === 1 ? 'it' : 'each'}` : ''].filter(Boolean).join(' · ');

  if (action) return <div className="mail-bundles">
    {error && <p className="dashboard-notice" role="status">{error}</p>}
    <ActionProposal action={action} busy={busy}
      onConfirm={() => void settle(actionsApi.confirm)} onDecline={() => void settle(actionsApi.decline)}
      onDismiss={() => setAction(null)} />
  </div>;

  const checklist = (kind: Kind) => {
    if (kind === 'unsubscribe') return <ul className="dashboard-data-list mail-bundle-list">{senderList.map(s => <li key={s.key}>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={!excluded.has(s.email_triage_uuid)} onChange={() => toggle(s.email_triage_uuid)} />
        <span><strong>{s.name}</strong><small>{s.count} waiting · {s.key}</small></span>
      </label>
    </li>)}</ul>;
    if (kind === 'events') return <ul className="dashboard-data-list mail-bundle-list">{events.items.map(i => <li key={i.uuid}>
      {i.start ? <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={!excluded.has(i.uuid)} onChange={() => toggle(i.uuid)} />
        <span><strong>{i.title || i.subject || 'Event'} · {when(i.start, i.all_day)}</strong><small>{[i.location, i.from].filter(Boolean).join(' · ')}</small></span>
      </label>
        : <button className="dashboard-link-row" onClick={() => onOpenEmail(i.uuid)}><strong>{i.subject || '(no subject)'}</strong><small>{i.from} · no date found — open to add one</small></button>}
    </li>)}</ul>;
    const list = kind === 'archive' ? bundles.archive.items : bundles.receipts.items;
    return <ul className="dashboard-data-list mail-bundle-list">{list.map(i => <li key={i.uuid}>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={!excluded.has(i.uuid)} onChange={() => toggle(i.uuid)} />
        <span><strong>{i.subject || '(no subject)'}</strong><small>{i.from}</small></span>
      </label>
    </li>)}</ul>;
  };

  const bundle = (kind: Kind, verb: string, title: string, note: string) => {
    const n = chosen(kind).length;
    return <div className="mail-bundle" key={kind}>
      <div className="flex items-start justify-between gap-3">
        <div><strong>{title}</strong><small className="block opacity-70">{note}</small></div>
        <div className="flex shrink-0 gap-2">
          {!compact && <button className="dashboard-link-button" onClick={() => setExpanded(expanded === kind ? null : kind)}>{expanded === kind ? 'Hide' : 'Review'}</button>}
          <button className="dashboard-chat-cta" disabled={busy || !n} onClick={() => void propose(kind)}>{busy ? '…' : `${verb} ${n}`}</button>
        </div>
      </div>
      {expanded === kind && checklist(kind)}
    </div>;
  };

  return <div className="mail-bundles flex flex-col gap-3">
    {error && <p className="dashboard-notice" role="status">{error}</p>}
    {nothing && <p className="dashboard-empty">Inbox handled — nothing needs you.</p>}
    {archive.count > 0 && bundle('archive', 'Archive', `Archive ${archive.count} promos and updates`,
      `${senders}${more(archive.count, archive.items.length)} · stays in All Mail and search`)}
    {senderList.length > 0 && bundle('unsubscribe', 'Unsubscribe', `Unsubscribe from ${senderList.length} sender${senderList.length === 1 ? '' : 's'} you never clear`,
      `${senderList.slice(0, 3).map(s => `${s.name} (${s.count})`).join(' · ')} · uses their one-click link, can't be undone · archives what they sent`)}
    {receipts.count > 0 && bundle('receipts', 'File', `File ${receipts.count} receipt${receipts.count === 1 ? '' : 's'}`,
      `${merchants}${more(receipts.count, receipts.items.length)} · labelled "Receipts" and logged to spending`)}
    {dated.length > 0 && bundle('events', 'Add', `Add ${dated.length} event${dated.length === 1 ? '' : 's'} from email`, `${eventNote} · emails filed under Travel / School`)}
    {!dated.length && events.count > 0 && <div className="mail-bundle flex items-start justify-between gap-3">
      <div><strong>{events.count} travel and school email{events.count === 1 ? '' : 's'}</strong><small className="block opacity-70">no date found — open each to add one</small></div>
      {onReviewEvents && <button className="dashboard-link-button" onClick={onReviewEvents}>Review</button>}
    </div>}
    {replies.count > 0 && <div className="mail-bundle">
      <strong>Needs you · {replies.count}</strong>
      <ul className="dashboard-data-list">{replies.items.slice(0, compact ? 3 : replies.items.length).map(r => <li key={r.uuid}>
        <button className="dashboard-link-row" onClick={() => onOpenEmail(r.uuid)}><strong>{r.from}{r.ask ? `: ${r.ask}` : ''}</strong><small>{r.subject || '(no subject)'}</small></button>
      </li>)}</ul>
    </div>}
  </div>;
}
