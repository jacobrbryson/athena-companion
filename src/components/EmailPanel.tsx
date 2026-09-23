import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { ActionProposal } from './ActionProposal';
import { dashboardApi, type TriageEmailDetail, type EmailCategory } from '../api/dashboard';
import { actionsApi, type AthenaAction } from '../api/companion';

/**
 * The modal behind "click an email" on the Mail card/page.
 *
 * Shows what Athena read, lets the person edit what she extracted before
 * anything is proposed, and — once proposed — hands off to the same
 * ActionProposal card every other Athena action uses. Nothing here ever
 * calls Gmail or writes a receipt directly; propose() only creates a pending
 * athena_action row, and only Approve on the card that follows executes it.
 */

const field = 'w-full rounded-lg border border-emerald-800/50 bg-black/40 p-2 text-sm text-emerald-50';
const labelCls = 'flex flex-col gap-1 text-[11px] uppercase tracking-widest opacity-60';

export const CATEGORY_LABEL: Record<EmailCategory, string> = {
  receipt: 'Receipt', travel: 'Travel', school: 'School', other: 'Other',
};

export function EmailPanel({ uuid, onClose, onChanged }: { uuid: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<TriageEmailDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<AthenaAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [includeGroup, setIncludeGroup] = useState(true);

  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [label, setLabel] = useState('');

  useEffect(() => {
    let active = true;
    setError('');
    setDetail(null);
    setAction(null);
    dashboardApi.mailDetail(uuid).then(d => {
      if (!active) return;
      setDetail(d);
      const ex = (d.extracted || {}) as Record<string, unknown>;
      if (d.category === 'receipt') {
        setMerchant(typeof ex.merchant === 'string' ? ex.merchant : d.from_name || '');
        setCategory(typeof ex.category === 'string' ? ex.category : '');
        setAmount(typeof ex.amount === 'number' ? String(ex.amount) : '');
        setPurchasedAt(typeof ex.purchased_at === 'string' ? ex.purchased_at : '');
        setLabel('Receipts');
      } else if (d.category === 'travel' || d.category === 'school') {
        setTitle(typeof ex.title === 'string' ? ex.title : d.subject || '');
        setStart(typeof ex.start === 'string' ? ex.start : '');
        setEnd(typeof ex.end === 'string' ? ex.end : '');
        setAllDay(!!ex.all_day);
        setLocation(typeof ex.location === 'string' ? ex.location : '');
        setLabel(d.category === 'travel' ? 'Travel' : 'School');
      }
    }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [uuid]);

  const asGroup = !!(detail?.category === 'receipt' && includeGroup && detail.siblings.length > 0);

  const propose = async () => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      if (detail.category === 'receipt') {
        const overrides = { label, merchant, category, amount: amount.trim() ? Number(amount) : null, purchased_at: purchasedAt || null };
        const res = asGroup
          ? await dashboardApi.mailProposeGroup([uuid, ...detail.siblings.map(s => s.uuid)], overrides)
          : await dashboardApi.mailPropose(uuid, overrides);
        setAction(res.action);
      } else {
        const res = await dashboardApi.mailPropose(uuid, { label, title, start, end, all_day: allDay, location: location || null });
        setAction(res.action);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const dismiss = async () => {
    setBusy(true); setError('');
    try {
      await dashboardApi.mailDismiss(uuid);
      onChanged();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  /** Proposes moving this email (or the whole group) to Gmail's Trash — still needs Approve, like propose(). */
  const deleteEmail = async () => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      const uuids = asGroup ? [uuid, ...detail.siblings.map(s => s.uuid)] : [uuid];
      const res = await dashboardApi.mailDelete(uuids);
      setAction(res.action);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!action) return;
    setConfirmBusy(true); setError('');
    try {
      const res = await actionsApi.confirm(action.uuid);
      setAction(res.action);
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { setConfirmBusy(false); }
  };
  const decline = async () => {
    if (!action) return;
    setConfirmBusy(true); setError('');
    try {
      const res = await actionsApi.decline(action.uuid);
      setAction(res.action);
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { setConfirmBusy(false); }
  };

  return <Drawer eyebrow="TRIAGED EMAIL" title={detail ? CATEGORY_LABEL[detail.category] : 'Email'} onClose={onClose}>
    {error && <p role="alert" className="mb-4 text-sm text-amber-200">{error}</p>}
    {!detail && !error && <p className="text-sm text-slate-400">Loading…</p>}
    {detail && <>
      <p className="text-xs uppercase tracking-widest opacity-50">{detail.from_name || detail.from_address || 'Unknown sender'}</p>
      <h3 className="mt-1 text-base font-semibold leading-snug">{detail.subject || '(no subject)'}</h3>
      <p className="mt-1 text-xs opacity-50">{detail.received_at ? new Date(detail.received_at).toLocaleString() : 'Date unknown'}</p>

      {detail.bodyError && <p className="mt-3 text-xs text-amber-200">Couldn't load the full message: {detail.bodyError}</p>}
      {detail.body && <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-emerald-800/50 bg-black/40 p-3 font-sans text-xs leading-relaxed text-emerald-50/90">{detail.body}</pre>}
      {!detail.body && !detail.bodyError && <p className="mt-3 text-xs opacity-40">This email has no readable text body.</p>}

      {!action && detail.category !== 'other' && <div className="mt-4 flex flex-col gap-3">
        {detail.category === 'receipt' ? <>
          <label className={labelCls}>Merchant<input className={field} value={merchant} onChange={e => setMerchant(e.target.value)} /></label>
          <label className={labelCls}>Spend category<input className={field} value={category} onChange={e => setCategory(e.target.value)} placeholder="groceries, dining_out, energy…" /></label>
          <label className={labelCls}>Amount<input className={field} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" /></label>
          <label className={labelCls}>Purchased<input className={field} type="date" value={purchasedAt} onChange={e => setPurchasedAt(e.target.value)} /></label>
        </> : <>
          <label className={labelCls}>Event title<input className={field} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className={labelCls}>Starts<input className={field} value={start} onChange={e => setStart(e.target.value)} placeholder="2026-10-01T14:00:00-04:00 or YYYY-MM-DD" /></label>
          <label className={labelCls}>Ends<input className={field} value={end} onChange={e => setEnd(e.target.value)} placeholder="same format as Starts" /></label>
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-widest opacity-60">
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> All day
          </label>
          <label className={labelCls}>Location<input className={field} value={location} onChange={e => setLocation(e.target.value)} /></label>
        </>}
        <label className={labelCls}>Gmail label<input className={field} value={label} onChange={e => setLabel(e.target.value)} /></label>

        {detail.category === 'receipt' && detail.siblings.length > 0 && <label className="flex items-start gap-2 rounded border border-emerald-500/20 p-2 text-xs">
          <input type="checkbox" checked={includeGroup} onChange={e => setIncludeGroup(e.target.checked)} className="mt-0.5" />
          Also file {detail.siblings.length} similar email{detail.siblings.length === 1 ? '' : 's'} from {merchant || 'this sender'} the same way — each keeps its own amount and date.
        </label>}

        <div className="mt-1 flex flex-wrap gap-2">
          <button onClick={propose} disabled={busy} className="h-10 flex-1 rounded-full bg-emerald-500/80 text-sm font-semibold text-black disabled:opacity-40">
            {busy ? 'Working…' : asGroup ? `Propose for ${1 + detail.siblings.length} emails` : 'Propose'}
          </button>
          <button onClick={dismiss} disabled={busy} className="h-10 rounded-full border border-emerald-500/20 px-4 text-sm disabled:opacity-40">Dismiss</button>
          <button onClick={deleteEmail} disabled={busy} className="h-10 rounded-full border border-red-500/30 px-4 text-sm text-red-200 disabled:opacity-40">
            {asGroup ? `Delete ${1 + detail.siblings.length}` : 'Delete'}
          </button>
        </div>
        <p className="text-[11px] opacity-40">Delete moves it to Gmail's Trash — recoverable there for about 30 days.</p>
      </div>}

      {!action && detail.category === 'other' && <div className="mt-4">
        <p className="text-sm opacity-60">Athena didn't find a receipt, travel booking or school announcement here — nothing to propose.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={dismiss} disabled={busy} className="h-10 rounded-full border border-emerald-500/20 px-4 text-sm disabled:opacity-40">
            {busy ? 'Working…' : 'Dismiss from list'}
          </button>
          <button onClick={deleteEmail} disabled={busy} className="h-10 rounded-full border border-red-500/30 px-4 text-sm text-red-200 disabled:opacity-40">
            Delete
          </button>
        </div>
        <p className="mt-2 text-[11px] opacity-40">Delete moves it to Gmail's Trash — recoverable there for about 30 days.</p>
      </div>}

      {action && <div className="mt-4">
        <ActionProposal action={action} busy={confirmBusy} onConfirm={confirm} onDecline={decline} onDismiss={onClose} />
      </div>}
    </>}
  </Drawer>;
}
