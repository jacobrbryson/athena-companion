import { useCallback, useEffect, useState } from 'react';
import { dashboardApi, type ReceiptLedger } from '../api/dashboard';
import { formatBrokerageMoney } from '../api/finance';

/**
 * Family → Finance: the receipts filed from Mail, read-only, with each month's
 * total. They are written only when a filed receipt is approved on the Mail
 * page. Amounts are the ones read from the email, summed per currency and
 * never converted; a receipt with no amount is listed and adds nothing.
 */
const FEW = 12;

const monthName = (month: string) => {
  const d = new Date(`${month}-15T12:00:00`);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};
const dayName = (date: string | null) => {
  if (!date) return '—';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};
const total = (totals: { currency: string; amount: number }[]) =>
  totals.length ? totals.map(t => formatBrokerageMoney(t.amount, t.currency)).join(' · ') : 'No amounts';

export function FamilyReceipts() {
  const [data, setData] = useState<ReceiptLedger | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError('');
    dashboardApi.mailReceipts()
      .then(setData)
      .catch(() => setError("Couldn't load your receipts. Try again in a moment."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const shown = data ? (all ? data.receipts : data.receipts.slice(0, FEW)) : [];
  return <section className="hp-panel ff-wide ff-receipts">
    <header>
      <h2>Receipts <span>filed from your email</span></h2>
      {data && <small className="ff-meta">{data.receipts.length}{data.truncated ? '+' : ''} filed</small>}
      <button type="button" className="hp-link" onClick={load} disabled={loading}>{loading ? 'Reading…' : 'Refresh'}</button>
    </header>
    {error && <p role="alert" className="dashboard-empty">{error}</p>}
    {!data && loading && <p className="dashboard-empty">Reading your receipts…</p>}
    {data && !data.receipts.length && <p className="dashboard-empty">No receipts filed yet. File one from the Mail page and it will show up here.</p>}
    {data && data.receipts.length > 0 && <>
      <ul className="ff-months">{data.months.slice(0, 4).map(m => <li key={m.month}>
        <small>{monthName(m.month)}</small>
        <strong>{total(m.totals)}</strong>
        <small>{m.count} {m.count === 1 ? 'receipt' : 'receipts'}</small>
      </li>)}</ul>
      <div className="ff-table-wrap"><table className="ff-table">
        <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th className="ff-num">Amount</th><th>Email</th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.uuid}>
          <td className="ff-left" title={r.dated ? undefined : 'The day it was filed; the email had no purchase date'}>{dayName(r.date)}{!r.dated && <small> filed</small>}</td>
          <td><strong>{r.merchant || 'Unknown'}</strong></td>
          <td>{r.category ? <span className="ff-chip">{r.category.replace(/_/g, ' ')}</span> : '—'}</td>
          <td className="ff-num">{r.amount === null ? <small>not found</small> : formatBrokerageMoney(r.amount, r.currency)}</td>
          <td className="ff-subject"><small>{r.subject || '—'}</small></td>
        </tr>)}</tbody>
      </table></div>
      {data.receipts.length > FEW && <button type="button" className="hp-link" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${data.receipts.length}`}</button>}
    </>}
    <p className="ff-note">Read-only. Receipts come from emails you approved on the Mail page; totals are per currency and never converted.</p>
  </section>;
}
