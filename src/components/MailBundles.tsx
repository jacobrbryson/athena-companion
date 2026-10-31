import { useState, type ReactNode } from 'react';
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

const icon = (d: string) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const EMPTY: Record<Kind, string> = {
  archive: 'No promos or updates to archive right now.',
  receipts: 'No receipts waiting to be filed.',
  events: 'No emails with a date to add.',
  unsubscribe: 'No senders are piling up.',
};

/** A sender's initial on a tile whose color comes from the name, so the same sender always looks the same. */
function Avatar({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return <span className="mail-avatar" aria-hidden="true" style={{ background: `hsl(${h} 45% 22%)`, color: `hsl(${h} 90% 80%)`, borderColor: `hsl(${h} 50% 40%)` }}>
    {(name.trim()[0] || '?').toUpperCase()}
  </span>;
}

/** "8:14 AM" today, "Yesterday", else "Oct 24" — what fits beside a sender's name. */
export function shortDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0 && /T/.test(iso)) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const moneyOf = (value: number, currency?: string | null) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value); }
  catch { return `${value.toFixed(2)}`; }
};

export const ICONS: Record<Kind, JSX.Element> = {
  archive: icon('M3 7h18v4H3zM5 11v8h14v-8M10 15h4'),
  receipts: icon('M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'),
  events: icon('M5 5h14v15H5zM5 10h14M9 3v4M15 3v4'),
  unsubscribe: icon('M12 3a9 9 0 100 18 9 9 0 000-18zM6 6l12 12'),
};

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
  const usable = (kind: Kind): { uuid: string }[] => kind === 'events' ? bundles.events.items.filter(i => i.start && !i.on_calendar && !i.past)
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
  // Dated events worth adding; ones already over or already on a calendar are left out.
  const dated = events.items.filter(i => i.start && !i.on_calendar && !i.past);
  const undated = events.count - events.items.filter(i => i.start).length;
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

  const setAll = (kind: Kind, on: boolean) => setExcluded(prev => {
    const next = new Set(prev);
    for (const i of usable(kind)) { if (on) next.delete(i.uuid); else next.add(i.uuid); }
    return next;
  });

  // The full Mail page shows each bundle as its own card with its list open,
  // the risk badge up top and the exact button label at the bottom.
  const card = (kind: Kind, title: string, blurb: string, button: (n: number) => string) => {
    const all = usable(kind);
    const n = chosen(kind).length;
    const reversible = kind !== 'unsubscribe';
    return <section className={`mail-card mail-card-${kind}`} key={kind}>
      <header>
        <span className="mail-card-icon" aria-hidden="true">{ICONS[kind]}</span>
        <h3>{title}</h3>
        <span className={reversible ? 'mail-badge' : 'mail-badge mail-badge-danger'}>{reversible ? 'Reversible' : 'Not reversible'}</span>
      </header>
      <p className="mail-card-blurb">{blurb}</p>
      <div className="mail-card-select">
        <span>{n} selected of {all.length}</span>
        <label><input type="checkbox" checked={n === all.length && n > 0} onChange={e => setAll(kind, e.target.checked)} /> Select all</label>
      </div>
      {all.length ? cardRows(kind) : <p className="mail-card-empty">{EMPTY[kind]}</p>}
      {!reversible && <p className="mail-card-warn"><strong>This can't be undone</strong>You'd have to re-subscribe on each sender's site.</p>}
      <button className="mail-card-go" disabled={busy || !n} onClick={() => void propose(kind)}>{busy ? '…' : button(n)}</button>
    </section>;
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // One row of a card: tick, sender avatar, name with a date on the right, then detail lines.
  const mailRow = (uuid: string, name: string, aside: ReactNode, lines: ReactNode) => <li key={uuid}>
    <label className="mail-row">
      <input type="checkbox" checked={!excluded.has(uuid)} onChange={() => toggle(uuid)} />
      <Avatar name={name} />
      <span className="mail-row-body">
        <span className="mail-row-top"><strong>{name}</strong><small>{aside}</small></span>
        {lines}
      </span>
    </label>
  </li>;
  const cardRows = (kind: Kind) => <ul className="mail-rows">{
    kind === 'archive' ? archive.items.map(i => mailRow(i.uuid, i.from, shortDate(i.received_at), <small>{i.subject || '(no subject)'}</small>))
      : kind === 'receipts' ? receipts.items.map(i => mailRow(i.uuid, i.merchant || i.from, shortDate(i.received_at), <>
        {i.amount != null && <b className="mail-row-amount">{moneyOf(i.amount, i.currency)}</b>}
        <small>{i.purchased_at ? `Purchased ${shortDate(i.purchased_at)}` : i.subject || '(no subject)'}</small>
      </>))
        : kind === 'events' ? dated.map(i => mailRow(i.uuid, i.title || i.subject || 'Event', '', <>
          <small>{when(i.start!, i.all_day)}</small>
          <small>From: {i.from}</small>
        </>))
          : senderList.map(s => mailRow(s.email_triage_uuid, s.name, '', <small>{s.count} {s.count === 1 ? 'email' : 'emails'} waiting</small>))
  }</ul>;

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

  // The Mail page always shows all four bundles, so the layout never jumps
  // around: one with nothing in it says so and its button stays off.
  if (!compact) return <div className="mail-bundles flex flex-col gap-3">
    {error && <p className="dashboard-notice" role="status">{error}</p>}
    <div className="mail-card-grid">
      {card('archive', 'Archive promos and updates',
        'Move these emails out of your inbox to keep it focused. Nothing is deleted.', n => `Archive ${plural(n, 'email', 'emails')}`)}
      {card('receipts', 'File receipts',
        'Save these receipts to Athena for easy reference and expense tracking.', n => `File ${plural(n, 'receipt', 'receipts')}`)}
      {card('events', 'Add events to your calendar',
        "Turn these emails into calendar events so you don't miss anything.", n => `Add ${plural(n, 'event', 'events')}`)}
      {card('unsubscribe', 'Unsubscribe from senders',
        'Stop future emails from these senders. Existing emails will be archived (not deleted).', n => `Unsubscribe from ${plural(n, 'sender', 'senders')}`)}
    </div>
  </div>;

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
