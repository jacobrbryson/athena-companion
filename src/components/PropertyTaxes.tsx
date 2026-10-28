import { useEffect, useState } from 'react';
import { DrawerButton } from './ActionControls';
import { daysUntil, inWords } from '../api/propertyVehicles';
import { dollars, taxesApi, type Tax, type TaxInstallment } from '../api/propertyTaxes';
import './propertyIssues.css';
import './propertyTaxes.css';

/**
 * Taxes on the Property page: property tax bills, and the tax a state bills
 * with a vehicle's registration. A record appears when a scanned bill is
 * approved (BillScan.tsx); here the person marks each payment paid, or removes
 * a record. Unpaid payments close to due go across the top of Home with the
 * vehicle deadlines (VehicleDeadlineBanner).
 */
const localDay = () => new Date().toLocaleDateString('en-CA');
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function useTaxes() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    taxesApi.all().then(r => { if (alive) { setTaxes(r.taxes); setError(''); } })
      .catch(e => { if (alive) setError((e as Error).message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  const apply = (r: { taxes: Tax[] }) => { setTaxes(r.taxes); setError(''); };
  return {
    taxes, loading, error, retry: () => setAttempt(a => a + 1),
    setPaid: async (tax: string, installment: string, paidOn: string | null) => apply(await taxesApi.setPaid(tax, installment, paidOn)),
    remove: async (tax: string) => apply(await taxesApi.remove(tax)),
  };
}
export type TaxesState = ReturnType<typeof useTaxes>;

function tone(i: TaxInstallment) {
  if (i.paidOn) return 'later';
  const n = daysUntil(i.dueOn);
  return n < 0 ? 'overdue' : n <= 30 ? 'soon' : 'later';
}

function TaxCard({ tax, state }: { tax: Tax; state: TaxesState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const title = tax.kind === 'vehicle' ? `${tax.vehicleName ? `${tax.vehicleName} · ` : ''}Vehicle tax` : 'Property tax';
  const ids = [tax.parcel && `Parcel ${tax.parcel}`, tax.account && `Account ${tax.account}`, tax.address].filter(Boolean).join(' · ');
  return <li className="pt-card">
    <div className="pt-head">
      <div className="pv-card-text">
        <strong>{tax.jurisdiction} · {title}{tax.taxYear ? ` · ${tax.taxYear}` : ''}</strong>
        {ids && <small>{ids}</small>}
        {tax.amount !== null && <small>{dollars(tax.amount)} total</small>}
      </div>
    </div>
    <ul className="pt-installments">
      {tax.installments.map(i => <li key={i.uuid}>
        <span>{i.label}{i.amount !== null ? ` · ${dollars(i.amount)}` : ''}</span>
        <span className={`pv-chip pv-${tone(i)}`}>{i.paidOn ? `Paid ${dayLabel(i.paidOn)}` : `${dayLabel(i.dueOn)} · ${inWords(daysUntil(i.dueOn), i.dueOn)}`}</span>
        {i.paidOn
          ? <button type="button" className="pv-link" disabled={busy} onClick={() => void run(() => state.setPaid(tax.uuid, i.uuid, null))}>Not paid</button>
          : <button type="button" className="pv-link" disabled={busy} onClick={() => void run(() => state.setPaid(tax.uuid, i.uuid, localDay()))}>Mark paid</button>}
      </li>)}
    </ul>
    <div className="pt-foot">
      {confirming ? <DrawerButton className="pi-danger" disabled={busy} onClick={() => void run(() => state.remove(tax.uuid))}>Remove for good</DrawerButton>
        : <button type="button" className="pv-link" disabled={busy} onClick={() => setConfirming(true)}>Remove record</button>}
    </div>
    {error && <p role="alert">{error}</p>}
  </li>;
}

/** Every tax record; the Taxes tab. */
export function TaxList({ state, onScan }: { state: TaxesState; onScan: () => void }) {
  return <div className="pv-list pt-list">
    {state.error && <p role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>}
    {state.loading ? <p className="pi-muted">Loading taxes…</p>
      : !state.taxes.length ? <p className="pi-muted">No tax bills yet. Scan a property tax bill, or a vehicle registration notice that includes the vehicle tax, and I’ll record what’s due, put the dates on your calendar once you approve, and show anything close across the top of Home.</p>
      : <ul>{state.taxes.map(t => <TaxCard key={t.uuid} tax={t} state={state} />)}</ul>}
    <div className="pi-list-foot"><DrawerButton primary onClick={onScan}><span aria-hidden="true">＋</span>Scan a bill</DrawerButton></div>
  </div>;
}
