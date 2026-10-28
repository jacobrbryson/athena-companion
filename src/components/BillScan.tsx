import { useRef, useState } from 'react';
import { Drawer } from './Drawer';
import { DrawerButton } from './ActionControls';
import { ActionProposal } from './ActionProposal';
import { downscale } from './photoStore';
import { actionsApi, type AthenaAction } from '../api/companion';
import { billsApi, dollars, type BillChoice, type BillDocument, type BillResult } from '../api/propertyTaxes';
import './propertyTaxes.css';

/**
 * "Scan a bill" (docs/capabilities/property-taxes.md). A photo of a vehicle
 * registration renewal or a property tax bill is read by Athena and comes back
 * as ONE approval card — the calendar event(s), the record update and the bill
 * itself — which does nothing until Approve. Anything she wasn't sure of, or
 * can't match to one of your vehicles or your property, is asked first on a
 * short "check this" sheet, never guessed. The photo itself is not kept.
 *
 * BillResultView is shared: the Property buttons (BillScanDrawer) and the chat
 * "Show a photo" panel both hand it a result.
 */

const KIND: Record<BillDocument['kind'], string> = { vehicle_registration: 'Vehicle registration', property_tax: 'Property tax', vehicle_notice: 'Vehicle notice' };
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** What was read, one line each — so a wrong number is caught before Approve. */
function ReadSummary({ doc }: { doc: BillDocument }) {
  const rows: [string, string][] = [
    ['Bill', `${KIND[doc.kind]}${doc.paid ? ' · receipt' : ''}`],
    ...(doc.noticeTitle ? [['Notice', doc.noticeTitle] as [string, string]] : []),
    ...(doc.coverage ? [['Coverage', doc.coverage] as [string, string]] : []),
    ...(doc.noticeSummary ? [['Says', doc.noticeSummary] as [string, string]] : []),
    ...(doc.payee ? [['Pay to', doc.payee] as [string, string]] : []),
    ...(doc.jurisdiction ? [['Jurisdiction', doc.jurisdiction] as [string, string]] : []),
    ...(doc.plate ? [['Plate', doc.plate] as [string, string]] : []),
    ...(doc.vin || doc.vinLast ? [['VIN', doc.vin || `…${doc.vinLast}`] as [string, string]] : []),
    ...(doc.parcel ? [['Parcel', doc.parcel] as [string, string]] : []),
    ...(doc.account ? [['Account', doc.account] as [string, string]] : []),
    ...(doc.address ? [['Address', doc.address] as [string, string]] : []),
    ...(doc.taxYear ? [['Tax year', String(doc.taxYear)] as [string, string]] : []),
    ...(doc.dueDate ? [[doc.paid ? 'New expiry' : 'Due', dayLabel(doc.dueDate)] as [string, string]] : []),
    ...doc.installments.map(i => [i.label, `${dayLabel(i.dueOn)}${i.amount ? ` · ${dollars(Number(i.amount))}` : ''}`] as [string, string]),
    ...(doc.amountDue ? [['Amount', dollars(Number(doc.amountDue))] as [string, string]] : []),
    ...(doc.taxAmount ? [['Tax part', dollars(Number(doc.taxAmount))] as [string, string]] : []),
  ];
  return <details className="bs-read"><summary>What I read</summary>
    <dl>{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  </details>;
}

const FIELD_LABELS: [keyof BillDocument, string, 'text' | 'date' | 'number'][] = [
  ['noticeTitle', 'What this notice is', 'text'],
  ['coverage', 'Coverage terms', 'text'],
  ['noticeSummary', 'What it says', 'text'],
  ['jurisdiction', 'Who it’s owed to (state, county or city)', 'text'],
  ['payee', 'Pay to', 'text'],
  ['plate', 'Plate', 'text'],
  ['vin', 'VIN (or its last digits)', 'text'],
  ['vehicleDescription', 'Vehicle as printed', 'text'],
  ['parcel', 'Parcel number', 'text'],
  ['account', 'Account number', 'text'],
  ['address', 'Address', 'text'],
  ['taxYear', 'Tax year', 'number'],
  ['dueDate', 'Due date', 'date'],
  ['amountDue', 'Amount due ($)', 'number'],
  ['taxAmount', 'Vehicle tax part ($)', 'number'],
];

/** The short "check this" sheet: only what she wasn't sure of, what's missing, and which record it belongs to. */
function ReviewForm({ result, onResult }: { result: Extract<BillResult, { status: 'needs_input' }>; onResult: (r: BillResult) => void }) {
  const [doc, setDoc] = useState<BillDocument>(() => ({ ...result.document, vin: result.document.vin || result.document.vinLast, installments: result.document.installments.map(i => ({ ...i })) }));
  const [picked, setPicked] = useState('');
  const [installmentPicked, setInstallmentPicked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const flagged = new Map((doc.uncertain || []).map(u => [u.field, u.reason]));
  const missing = new Set((result.missing || []).map(m => m.field));
  const isTax = doc.kind === 'property_tax';
  const shown = FIELD_LABELS.filter(([key]) => {
    if (flagged.has(key as string) || missing.has(key as string)) return true;
    if (key === 'dueDate') return !isTax && !doc.installments.length;
    return false;
  });
  const needsPick = !!result.candidates && !picked;
  const needsInstallment = !!result.installmentChoices && !installmentPicked;
  const set = (key: keyof BillDocument, value: string) => setDoc(d => ({ ...d, [key]: value }));
  const setInstallment = (n: number, patch: Partial<BillDocument['installments'][number]>) => setDoc(d => ({ ...d, installments: d.installments.map((i, k) => k === n ? { ...i, ...patch } : i) }));
  const choice = (c: BillChoice) => <label key={c.uuid} className="bs-choice"><input type="radio" name="bill-target" checked={picked === c.uuid} onChange={() => setPicked(c.uuid)} /><span>{c.label}{c.why ? <small> · matched on {c.why}</small> : null}</span></label>;

  async function submit() {
    setBusy(true); setError('');
    try {
      const { uncertain: _drop, ...clean } = doc;
      onResult(await billsApi.review({
        document: clean as BillDocument,
        ...(result.candidates?.type === 'vehicle' ? { vehicleUuid: picked } : {}),
        ...(result.candidates?.type === 'property' ? { propertyUuid: picked } : {}),
        ...(installmentPicked ? { installmentUuid: installmentPicked } : {}),
      }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <div className="bs-review">
    <p className="bs-note" role="status">{result.note || 'Check these before I go on.'}</p>
    <p className="pi-muted">Nothing has been saved or added to your calendar.</p>
    {result.candidates && <fieldset className="bs-choices"><legend>{result.candidates.type === 'vehicle' ? 'Which vehicle?' : 'Which property?'}</legend>
      {result.candidates.items.length ? result.candidates.items.map(choice) : <p className="pi-muted">None to choose from.</p>}
    </fieldset>}
    {result.installmentChoices && <fieldset className="bs-choices"><legend>Which payment is this receipt for?</legend>
      {result.installmentChoices.map(i => <label key={i.uuid} className="bs-choice"><input type="radio" name="bill-installment" checked={installmentPicked === i.uuid} onChange={() => setInstallmentPicked(i.uuid)} /><span>{i.label} · due {dayLabel(i.dueOn)}{i.amount ? ` · ${dollars(i.amount)}` : ''}</span></label>)}
    </fieldset>}
    <form className="pi-form" onSubmit={e => { e.preventDefault(); if (!needsPick && !needsInstallment) void submit(); }}>
      {shown.map(([key, label, type]) => <label key={key as string} className={`pi-label${flagged.has(key as string) || missing.has(key as string) ? ' bs-check' : ''}`}>{label}
        <input type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'decimal' : undefined} value={String(doc[key] ?? '')} onChange={e => set(key, e.target.value)} />
        {flagged.has(key as string) && <small className="bs-why">{flagged.get(key as string)}</small>}
        {missing.has(key as string) && !flagged.has(key as string) && <small className="bs-why">I couldn’t find this on the bill.</small>}
      </label>)}
      {isTax && !doc.paid && <div className="bs-installments"><h3>Payments</h3>
        {doc.installments.map((i, n) => <div key={n} className={`pv-row-3 bs-installment${(doc.uncertain || []).some(u => u.field.startsWith(`installments.${n}.`)) ? ' bs-check' : ''}`}>
          <label className="pi-label">Label<input value={i.label} onChange={e => setInstallment(n, { label: e.target.value })} /></label>
          <label className="pi-label">Due<input type="date" value={i.dueOn} onChange={e => setInstallment(n, { dueOn: e.target.value })} /></label>
          <label className="pi-label">Amount ($)<input inputMode="decimal" value={String(i.amount ?? '')} onChange={e => setInstallment(n, { amount: e.target.value })} /></label>
        </div>)}
        {(doc.uncertain || []).filter(u => u.field.startsWith('installments.')).map((u, k) => <small key={k} className="bs-why">{u.reason}</small>)}
        {doc.installments.length < 6 && <button type="button" className="pv-link" onClick={() => setDoc(d => ({ ...d, installments: [...d.installments, { label: `Payment ${d.installments.length + 1}`, dueOn: '', amount: '' }] }))}>Add a payment</button>}
      </div>}
      {!shown.length && !result.candidates && !result.installmentChoices && <p className="pi-muted">Nothing else to fix — confirm and I’ll build the approval.</p>}
      {error && <p role="alert">{error}</p>}
      <DrawerButton primary type="submit" disabled={busy || needsPick || needsInstallment}>{busy ? 'Checking…' : 'These look right'}</DrawerButton>
    </form>
  </div>;
}

/** The result of a scan: the approval card, the check sheet, or why nothing happened. */
export function BillResultView(props: { result: BillResult; onResult: (r: BillResult) => void; onClose: () => void; onChanged?: () => void }) {
  // A new result (the check sheet answered with a card) starts a fresh view, so its card state isn't the old one's.
  const { result } = props;
  return <BillResultBody key={result.status === 'proposed' ? `card:${result.proposal.uuid}` : result.status} {...props} />;
}

function BillResultBody({ result, onResult, onClose, onChanged }: { result: BillResult; onResult: (r: BillResult) => void; onClose: () => void; onChanged?: () => void }) {
  const [action, setAction] = useState<AthenaAction | null>(result.status === 'proposed' ? result.proposal : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settle = async (decide: (uuid: string) => Promise<{ action: AthenaAction }>) => {
    if (!action) return;
    setBusy(true); setError('');
    try { const res = await decide(action.uuid); setAction(res.action); onChanged?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (result.status === 'already_recorded' || result.status === 'unavailable') return <div className="bs-result">
    <p role="status">{result.note}</p><ReadSummary doc={result.document} />
    <DrawerButton onClick={onClose}>Close</DrawerButton>
  </div>;
  if (result.status === 'needs_input') return <><ReviewForm key={JSON.stringify(result.document) + (result.note || '')} result={result} onResult={onResult} /></>;
  return <div className="bs-result">
    {result.target && <p className="pi-muted">{KIND[result.document.kind]} bill for <strong>{result.target.label}</strong>. Approve once and I’ll do all of it; decline and nothing changes.{result.repeated ? ' (You already had this card open.)' : ''}</p>}
    <ReadSummary doc={result.document} />
    {action && <ActionProposal action={action} busy={busy} onConfirm={() => void settle(actionsApi.confirm)} onDecline={() => void settle(actionsApi.decline)} onDismiss={onClose} />}
    {error && <p role="alert">{error}</p>}
  </div>;
}

/** The "Scan a bill" drawer behind the buttons on Property → Vehicles and Property → Taxes. */
export function BillScanDrawer({ onClose, onChanged, hint }: { onClose: () => void; onChanged?: () => void; hint: string }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BillResult | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const { base64 } = await downscale(file, 1600, 0.85);
      setResult(await billsApi.scan({ imageBase64: base64, mimeType: 'image/jpeg' }));
    } catch (e) { setError((e as Error).message || 'I couldn’t read that photo.'); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <Drawer eyebrow="SCAN A BILL" title="Scan a bill" onClose={() => { if (!busy) onClose(); }}>
    <div className="bs-body">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
      {!result && <>
        <p className="pi-muted">{hint}</p>
        <DrawerButton primary onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Reading the bill…' : 'Take or choose a photo'}</DrawerButton>
      </>}
      {error && <p role="alert">{error}</p>}
      {result && <BillResultView result={result} onResult={setResult} onClose={onClose} onChanged={onChanged} />}
      {result?.status === 'proposed' && <DrawerButton onClick={() => { setResult(null); }}>Scan another</DrawerButton>}
      <p className="bs-privacy">The photo is read once and not kept — I keep only the details I read, so I can show them to you here.</p>
    </div>
  </Drawer>;
}
