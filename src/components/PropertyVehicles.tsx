import { useEffect, useState } from 'react';
import { carOf, deadlines, dueItems, URGENT_DAYS, vehiclesApi, yearAfter, type DueItem, type RecallStatus, type ServiceInput, type SmartcarCar, type SmartcarList, type Vehicle, type VehicleInput } from '../api/propertyVehicles';
import { Drawer } from './Drawer';
import { DrawerButton } from './ActionControls';
import { readImage } from './Property';
import './propertyIssues.css';
import './propertyVehicles.css';

/**
 * Vehicles on the Property page: the cars that live at this property, what
 * comes due on each (registration, inspection, insurance, service) and a
 * service history. Athena reads them in her prompt (core_api
 * services/projects/prompt.js); Ask Athena opens a conversation about one.
 */
const localDay = () => new Date().toLocaleDateString('en-CA');
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const milesLabel = (n: number) => `${n.toLocaleString()} mi`;

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    vehiclesApi.all().then(r => { if (alive) { setVehicles(r.vehicles); setError(''); } })
      .catch(e => { if (alive) setError((e as Error).message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  const apply = (r: { vehicles: Vehicle[] }) => { setVehicles(r.vehicles); setError(''); };
  return {
    vehicles, loading, error, retry: () => setAttempt(a => a + 1),
    create: async (input: VehicleInput) => apply(await vehiclesApi.create(input)),
    update: async (uuid: string, patch: VehicleInput) => apply(await vehiclesApi.update(uuid, patch)),
    remove: async (uuid: string) => apply(await vehiclesApi.remove(uuid)),
    addService: async (uuid: string, entry: ServiceInput) => apply(await vehiclesApi.addService(uuid, entry)),
    removeService: async (uuid: string, entry: string) => apply(await vehiclesApi.removeService(uuid, entry)),
    setRecall: async (uuid: string, campaign: string, status: RecallStatus) => apply(await vehiclesApi.setRecall(uuid, campaign, status)),
  };
}
export type VehiclesState = ReturnType<typeof useVehicles>;

/** A vehicle's stored photo, fetched only when it is on screen; refetched when the vehicle changes. */
function useVehiclePhoto(v: Vehicle | null) {
  const key = v?.hasPhoto ? `${v.uuid}:${v.updatedAt}` : '';
  const [photo, setPhoto] = useState<{ key: string; image: string | null } | null>(null);
  useEffect(() => {
    if (!key || !v) return;
    let alive = true;
    vehiclesApi.photo(v.uuid).then(r => { if (alive) setPhoto({ key, image: r.image }); }).catch(() => { if (alive) setPhoto({ key, image: null }); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key && photo?.key === key ? photo.image : null;
}

const CAR = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16H3.5v-3.5L6 8h12l2.5 4.5V16H19M5 12.5h14" /><circle cx="7.5" cy="16" r="1.8" /><circle cx="16.5" cy="16" r="1.8" /><path d="M9.3 16h5.4" /></svg>;

/** What Athena is asked when a person taps Ask Athena on a vehicle. */
export function vehiclePrompt(v: Vehicle) {
  const car = carOf(v);
  return `Help me look after ${v.name}${car && car !== v.name ? ` (${car})` : ''}. Look at its mileage, what's coming due and its service history, and tell me what I should take care of next.`;
}

function VehicleCard({ v, onOpen }: { v: Vehicle; onOpen: () => void }) {
  const photo = useVehiclePhoto(v);
  const due = dueItems(v);
  const car = carOf(v);
  const top = due.find(d => d.tone !== 'later');
  const open = (v.recalls || []).filter(r => r.status === 'open');
  const urgent = open.find(r => r.parkIt || r.parkOutside);
  const undated = !v.registrationDue && !v.inspectionDue;
  return <li><button type="button" className="pv-card" onClick={onOpen}>
    <span className="pv-thumb">{photo ? <img src={photo} alt="" /> : CAR}</span>
    <span className="pv-card-text">
      <strong>{v.name}</strong>
      <small>{[car !== v.name ? car : '', v.color, v.plate].filter(Boolean).join(' · ') || 'No details yet'}</small>
      <small>{v.odometer !== null ? `${milesLabel(v.odometer)} · as of ${dayLabel(v.odometerOn!)}` : 'No mileage yet'}</small>
      {urgent ? <span className="pv-chip pv-overdue">Recall: {urgent.parkIt ? 'don’t drive it' : 'park outside'}</span>
        : top ? <span className={`pv-chip pv-${top.tone}`}>{top.label} {top.when}</span> : due.length ? <span className="pv-chip pv-later">Nothing due soon</span> : null}
      {undated && <span className="pv-chip pv-soon">Add registration &amp; inspection dates</span>}
      {!urgent && open.length > 0 && <span className="pv-chip pv-soon">{open.length === 1 ? '1 open recall' : `${open.length} open recalls`}</span>}
    </span>
  </button></li>;
}

/** Every vehicle at the property; the Vehicles tab. */
export function VehicleList({ state, propertyName, hasProperty, onOpen, onAdd }: { state: VehiclesState; propertyName: string; hasProperty: boolean; onOpen: (uuid: string) => void; onAdd: () => void }) {
  return <div className="pv-list">
    {state.error && <p role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>}
    {state.loading ? <p className="pi-muted">Loading vehicles…</p>
      : !hasProperty ? <p className="pi-muted">Add your property first — vehicles live at a property. Use <strong>Add property</strong> on the Overview tab.</p>
      : !state.vehicles.length ? <p className="pi-muted">No vehicles yet. Add the cars kept at {propertyName || 'this property'} and I’ll keep track of registration, inspection, insurance and service.</p>
      : <ul>{state.vehicles.map(v => <VehicleCard key={v.uuid} v={v} onOpen={() => onOpen(v.uuid)} />)}</ul>}
    {hasProperty && <div className="pi-list-foot"><DrawerButton primary onClick={onAdd}><span aria-hidden="true">＋</span>Add vehicle</DrawerButton></div>}
  </div>;
}

type Draft = Record<'name' | 'year' | 'make' | 'model' | 'color' | 'plate' | 'vin' | 'registrationState' | 'registrationNumber' | 'inspectionStation' | 'odometer' | 'registrationDue' | 'inspectionDue' | 'insuranceDue' | 'serviceDue' | 'serviceDueMiles' | 'notes', string>;
const toDraft = (v?: Vehicle | null): Draft => ({
  name: v?.name || '', year: v?.year?.toString() || '', make: v?.make || '', model: v?.model || '', color: v?.color || '',
  plate: v?.plate || '', vin: v?.vin || '', odometer: v?.odometer?.toString() || '',
  registrationState: v?.registrationState || '', registrationNumber: v?.registrationNumber || '', inspectionStation: v?.inspectionStation || '',
  registrationDue: v?.registrationDue || '', inspectionDue: v?.inspectionDue || '', insuranceDue: v?.insuranceDue || '',
  serviceDue: v?.serviceDue || '', serviceDueMiles: v?.serviceDueMiles?.toString() || '', notes: v?.notes || '',
});
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));

export function VehicleDrawer({ state, vehicle, propertyUuid, onClose }: { state: VehiclesState; vehicle?: Vehicle | null; propertyUuid: string | null; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(vehicle));
  const stored = useVehiclePhoto(vehicle || null);
  // undefined: keep what is stored; null: remove it; a string: the new photo.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shown = photo === undefined ? stored : photo;
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft(d => ({ ...d, [key]: e.target.value }));
  const field = (key: keyof Draft, label: string, props: Record<string, unknown> = {}) =>
    <label className="pi-label">{label}<input value={draft[key]} onChange={set(key)} {...props} /></label>;

  async function save() {
    if (!draft.name.trim() && !draft.make.trim() && !draft.model.trim()) return setError('Give the vehicle a name, or its make and model.');
    setBusy(true); setError('');
    try {
      const body: VehicleInput = {
        name: draft.name.trim(), year: num(draft.year), make: draft.make, model: draft.model, color: draft.color, plate: draft.plate, vin: draft.vin,
        registrationState: draft.registrationState, registrationNumber: draft.registrationNumber, inspectionStation: draft.inspectionStation,
        odometer: num(draft.odometer), registrationDue: draft.registrationDue || null, inspectionDue: draft.inspectionDue || null,
        insuranceDue: draft.insuranceDue || null, serviceDue: draft.serviceDue || null, serviceDueMiles: num(draft.serviceDueMiles), notes: draft.notes,
        ...(photo !== undefined ? { photo } : {}),
      };
      // An unchanged reading keeps its own date; a changed one is read today.
      if (vehicle && body.odometer === vehicle.odometer) delete body.odometer;
      if (vehicle) await state.update(vehicle.uuid, body);
      else await state.create({ ...body, propertyUuid });
      onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <Drawer eyebrow="YOUR PROPERTY" title={vehicle ? `Edit ${vehicle.name}` : 'Add a vehicle'} onClose={() => { if (!busy) onClose(); }}
    footer={<div className="pi-footer">{error && <p role="alert">{error}</p>}<DrawerButton onClick={onClose} disabled={busy}>Cancel</DrawerButton><DrawerButton primary onClick={save} disabled={busy}>{busy ? 'Saving…' : vehicle ? 'Save changes' : 'Save vehicle'}</DrawerButton></div>}>
    <form className="pi-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy}>
        <legend>The vehicle</legend>
        {field('name', 'What you call it', { maxLength: 100, placeholder: 'e.g. The BMW, Mom’s van' })}
        <div className="pv-row pv-row-3">
          {field('year', 'Year', { inputMode: 'numeric', maxLength: 4, placeholder: '2021' })}
          {field('make', 'Make', { maxLength: 60, placeholder: 'BMW' })}
          {field('model', 'Model', { maxLength: 60, placeholder: 'X5' })}
        </div>
        <div className="pv-row">
          {field('color', 'Color', { maxLength: 40 })}
          {field('plate', 'Plate', { maxLength: 20 })}
        </div>
        {field('vin', 'VIN (optional)', { maxLength: 24, autoCapitalize: 'characters', spellCheck: false })}
        {field('odometer', 'Odometer (miles)', { inputMode: 'numeric', maxLength: 9 })}
        {vehicle?.odometerOn && <p className="pi-muted">Last reading {dayLabel(vehicle.odometerOn)}. A new number is dated today; logging service with its mileage updates it too.</p>}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Registration &amp; inspection <small>(the dates put it on Home when they’re close)</small></legend>
        <div className="pv-row">
          {field('registrationState', 'State', { maxLength: 2, autoCapitalize: 'characters', placeholder: 'VA' })}
          {field('registrationNumber', 'Registration number', { maxLength: 40, spellCheck: false })}
        </div>
        <div className="pv-row">
          {field('registrationDue', 'Registration expires', { type: 'date' })}
          {field('inspectionDue', 'Inspection due', { type: 'date' })}
        </div>
        {field('inspectionStation', 'Inspected at (optional)', { maxLength: 100, placeholder: 'e.g. the shop on Main St' })}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Insurance &amp; service <small>(optional)</small></legend>
        <div className="pv-row">
          {field('insuranceDue', 'Insurance renews', { type: 'date' })}
          {field('serviceDue', 'Next service by date', { type: 'date' })}
        </div>
        {field('serviceDueMiles', 'Next service at (miles)', { inputMode: 'numeric', maxLength: 9 })}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Photo <small>(optional)</small></legend>
        <div className="pi-photos">
          {shown && <figure><img src={shown} alt="Vehicle photo" /><button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)}>✕</button></figure>}
          {!shown && <label className="pi-add-photo"><input type="file" accept="image/*" onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            setBusy(true); setError('');
            try { setPhoto(await readImage(file)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
          }} /><span aria-hidden="true">＋</span>Add photo</label>}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <label className="pi-legend" htmlFor="pv-notes">Anything else Athena should know? <small>(optional)</small></label>
        <textarea id="pv-notes" value={draft.notes} maxLength={4000} rows={3} onChange={set('notes')} placeholder="e.g. Takes premium fuel. Front tires are getting low." />
      </fieldset>
    </form>
  </Drawer>;
}

function ServiceLog({ state, vehicle }: { state: VehiclesState; vehicle: Vehicle }) {
  const [entry, setEntry] = useState({ what: '', doneOn: localDay(), odometer: '', shop: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const add = () => run(async () => {
    await state.addService(vehicle.uuid, { what: entry.what.trim(), doneOn: entry.doneOn, odometer: num(entry.odometer), shop: entry.shop.trim() || null });
    setEntry({ what: '', doneOn: localDay(), odometer: '', shop: '' });
  });
  return <section className="pi-notes pv-service" aria-label="Service history">
    <h3>Service history</h3>
    {vehicle.service.length ? <ol>{vehicle.service.map(s => <li key={s.uuid}>
      <time dateTime={s.doneOn}>{[dayLabel(s.doneOn), s.odometer !== null ? milesLabel(s.odometer) : '', s.shop].filter(Boolean).join(' · ')}</time>
      <p>{s.what}</p>
      <button type="button" aria-label="Delete entry" title="Delete entry" onClick={() => run(() => state.removeService(vehicle.uuid, s.uuid))} disabled={busy}>✕</button>
    </li>)}</ol> : <p className="pi-muted">Log oil changes, tires, repairs — what was done, when, and at what mileage.</p>}
    <form className="pv-service-form" onSubmit={e => { e.preventDefault(); if (entry.what.trim()) void add(); }}>
      <textarea value={entry.what} maxLength={500} rows={2} disabled={busy} placeholder="e.g. Oil change and tire rotation" onChange={e => setEntry(x => ({ ...x, what: e.target.value }))} />
      <div className="pv-row pv-row-3">
        <label className="pi-label">Date<input type="date" max={localDay()} value={entry.doneOn} disabled={busy} onChange={e => setEntry(x => ({ ...x, doneOn: e.target.value }))} /></label>
        <label className="pi-label">Mileage<input inputMode="numeric" maxLength={9} value={entry.odometer} disabled={busy} onChange={e => setEntry(x => ({ ...x, odometer: e.target.value }))} /></label>
        <label className="pi-label">Shop<input maxLength={100} value={entry.shop} disabled={busy} onChange={e => setEntry(x => ({ ...x, shop: e.target.value }))} /></label>
      </div>
      <DrawerButton type="submit" disabled={busy || !entry.what.trim() || !entry.doneOn}>{busy ? 'Saving…' : 'Add to history'}</DrawerButton>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}

const RECALL_WORD: Record<RecallStatus, string> = { open: 'Open', acknowledged: 'Acknowledged', done: 'Repaired', not_applicable: 'Doesn’t apply' };
const unrepaired = (status: RecallStatus) => status === 'open' || status === 'acknowledged';

/**
 * NHTSA recalls for the model year. Folded to one line unless an open one says
 * don't drive it or park it outside; each recall is acknowledged (seen, not
 * fixed yet), confirmed repaired, or marked doesn't apply.
 */
function RecallList({ state, vehicle }: { state: VehiclesState; vehicle: Vehicle }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [openOne, setOpenOne] = useState<string | null>(null);
  const recalls = vehicle.recalls || [];
  const open = recalls.filter(r => r.status === 'open');
  const seen = recalls.filter(r => r.status === 'acknowledged');
  const closed = recalls.length - open.length - seen.length;
  const [expanded, setExpanded] = useState(() => open.some(r => r.parkIt || r.parkOutside));
  const mark = async (campaign: string, status: RecallStatus) => {
    setBusy(campaign); setError('');
    try { await state.setRecall(vehicle.uuid, campaign, status); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const tally = [open.length ? `${open.length} open` : '', seen.length ? `${seen.length} acknowledged` : '', closed ? `${closed} closed` : ''].filter(Boolean).join(' · ');
  return <section className="pv-due pv-recalls" aria-label="Safety recalls">
    <button type="button" className="pv-recall-toggle" aria-expanded={expanded} onClick={() => setExpanded(x => !x)}>
      <h3>Safety recalls</h3>
      <span className={`pv-chip ${open.some(r => r.parkIt || r.parkOutside) ? 'pv-overdue' : open.length ? 'pv-soon' : 'pv-later'}`}>{tally || 'None listed'}</span>
      <span aria-hidden="true" className="pv-recall-caret">{expanded ? '▴' : '▾'}</span>
    </button>
    {expanded && <>
      {!recalls.length ? <p className="pi-muted">{vehicle.vin || (vehicle.year && vehicle.make && vehicle.model)
        ? 'NHTSA lists no recalls for this model year, as of the last check.'
        : 'Add the VIN, or the year, make and model, and I’ll check NHTSA for safety recalls.'}</p>
        : <ul>{recalls.map(r => <li key={r.campaign} className={unrepaired(r.status) ? undefined : 'pv-recall-closed'}>
          <button type="button" className="pv-recall-head" aria-expanded={openOne === r.campaign} onClick={() => setOpenOne(o => (o === r.campaign ? null : r.campaign))}>
            <span>{r.component || 'Recall'} <small className="pv-mono">{r.campaign}</small></span>
            <span className={`pv-chip ${!unrepaired(r.status) ? 'pv-later' : r.status === 'open' && (r.parkIt || r.parkOutside) ? 'pv-overdue' : 'pv-soon'}`}>
              {r.status === 'open' && r.parkIt ? 'Don’t drive it' : r.status === 'open' && r.parkOutside ? 'Park outside' : RECALL_WORD[r.status]}
            </span>
          </button>
          {openOne === r.campaign && <div className="pv-recall-body">
            {r.summary && <p>{r.summary}</p>}
            {r.consequence && <p><strong>Risk:</strong> {r.consequence}</p>}
            {r.remedy && <p><strong>Fix:</strong> {r.remedy}</p>}
            {r.status === 'acknowledged' && (r.parkIt || r.parkOutside) && <p><strong>NHTSA still says {r.parkIt ? 'don’t drive it' : 'park it outside'} until it’s repaired.</strong></p>}
            <div className="pv-recall-actions">
              {r.status === 'open' && <DrawerButton onClick={() => void mark(r.campaign, 'acknowledged')} disabled={busy === r.campaign}>Acknowledge</DrawerButton>}
              {r.status !== 'done' && <DrawerButton primary onClick={() => void mark(r.campaign, 'done')} disabled={busy === r.campaign}>Confirm repaired</DrawerButton>}
              {r.status !== 'not_applicable' && <DrawerButton onClick={() => void mark(r.campaign, 'not_applicable')} disabled={busy === r.campaign}>Doesn’t apply</DrawerButton>}
              {r.status !== 'open' && <DrawerButton onClick={() => void mark(r.campaign, 'open')} disabled={busy === r.campaign}>Reopen</DrawerButton>}
            </div>
          </div>}
        </li>)}</ul>}
      <p className="pi-muted pv-recall-note">From NHTSA, for this model year — a dealer can tell you from the VIN whether yours was already fixed. Acknowledge one you’ve seen but haven’t had fixed yet.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

/** One line of Coming due; a registration, inspection or insurance date can be marked renewed with its next date. */
function DueRow({ state, vehicle, item }: { state: VehiclesState; vehicle: Vehicle; item: DueItem }) {
  const kind = item.kind === 'registrationDue' || item.kind === 'inspectionDue' || item.kind === 'insuranceDue' ? item.kind : null;
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!kind || !next) return;
    setBusy(true); setError('');
    try { await state.update(vehicle.uuid, { [kind]: next }); setNext(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <li className="pv-due-row">
    <span>{item.label}</span>
    <span className="pv-due-right">
      <span className={`pv-chip pv-${item.tone}`}>{item.when}</span>
      {kind && item.tone !== 'later' && next === null && <button type="button" className="pv-link" onClick={() => setNext(yearAfter(vehicle[kind]!))}>Renewed?</button>}
    </span>
    {next !== null && <form className="pv-renew" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="pi-label">Next {item.label.toLowerCase()} due<input type="date" value={next} min={localDay()} disabled={busy} onChange={e => setNext(e.target.value)} /></label>
      <DrawerButton type="submit" primary disabled={busy || !next}>{busy ? 'Saving…' : 'Save'}</DrawerButton>
      <DrawerButton onClick={() => setNext(null)} disabled={busy}>Cancel</DrawerButton>
      {error && <p role="alert">{error}</p>}
    </form>}
  </li>;
}

const names = (list: string[]) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

/**
 * Across the top of Home while a registration, inspection or insurance date
 * is overdue or close (deadlines(): within two weeks, red inside a week). It
 * has no "Got it": it goes when the date does — renewed or edited — because
 * the owner wants Home impossible to miss on this (2026-10-25).
 */
export function VehicleDeadlineBanner({ vehicles, onOpen, onAsk }: { vehicles: Vehicle[]; onOpen: (uuid: string) => void; onAsk: (prompt: string) => void }) {
  const list = deadlines(vehicles);
  if (!list.length) return null;
  const first = list[0];
  const urgent = first.days <= URGENT_DAYS;
  // Everything on the same car that is as pressing goes in one headline.
  const together = list.filter(d => d.vehicle.uuid === first.vehicle.uuid && (d === first || d.days <= Math.max(first.days, URGENT_DAYS)));
  const what = names(together.map(d => d.label.toLowerCase()));
  const headline = first.days < 0
    ? `${first.vehicle.name} ${what} ${together.length > 1 ? 'are' : 'is'} overdue`
    : `${first.vehicle.name} ${what} due ${first.days === 0 ? 'today' : first.days === 1 ? 'tomorrow' : `in ${first.days} days`}`;
  const ask = `My ${first.vehicle.name}'s ${what} ${first.days < 0 ? (together.length > 1 ? 'are overdue' : 'is overdue') : `${together.length > 1 ? 'are' : 'is'} due ${first.when}`}${first.vehicle.registrationState ? ` (registered in ${first.vehicle.registrationState})` : ''}. Walk me through getting it done this week: what to bring, where to go, and what it costs.`;
  return <section role="alert" aria-live="polite"
    className={`overflow-hidden rounded-xl border-2 shadow-2xl ${urgent ? 'border-red-400 bg-red-700 text-white shadow-red-900/60' : 'border-amber-300 bg-amber-400 text-black'}`}>
    <div className="flex items-start gap-3 px-4 pt-4">
      <span className="relative mt-1 flex h-4 w-4 shrink-0" aria-hidden>
        {urgent && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
        <span className={`relative inline-flex h-4 w-4 rounded-full ${urgent ? 'bg-white' : 'bg-black/70'}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">{urgent ? 'Vehicle deadline' : 'Vehicle deadline coming up'}</p>
        <h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{headline}</h2>
      </div>
    </div>
    <ul className={`mx-4 mt-3 divide-y rounded-lg ${urgent ? 'divide-white/15 bg-black/20' : 'divide-black/10 bg-white/40'}`}>
      {list.map(d => <li key={`${d.vehicle.uuid}:${d.kind}`} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-sm">
        <strong className="min-w-0 flex-1 font-semibold">{d.vehicle.name} · {d.label}</strong>
        <span className="shrink-0">{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <span className="shrink-0 font-semibold">{d.when}</span>
      </li>)}
    </ul>
    <div className="flex flex-wrap gap-2 px-4 pb-4 pt-3">
      <button type="button" onClick={() => onOpen(first.vehicle.uuid)} className={`rounded-lg px-4 py-2 text-sm font-bold ${urgent ? 'bg-white text-red-700' : 'bg-black text-amber-300'}`}>
        Open {first.vehicle.name}
      </button>
      <button type="button" onClick={() => onAsk(ask)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${urgent ? 'border-white/60' : 'border-black/40'}`}>
        Help me get it done
      </button>
    </div>
  </section>;
}

/** Cars linked through Smartcar: their live readings, which vehicle each is, and location on or off per car. */
export function SmartcarPanel({ vehicles, onConnect, connecting }: { vehicles: Vehicle[]; onConnect: () => void; connecting?: boolean }) {
  const [data, setData] = useState<SmartcarList | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    vehiclesApi.smartcar().then(setData).catch(e => setError((e as Error).message || 'Cars are unavailable right now.'));
  }, []);
  const change = async (car: SmartcarCar, patch: { vehicleUuid?: string | null; locationEnabled?: boolean }) => {
    setBusy(car.id); setError('');
    try { setData(await vehiclesApi.setSmartcar(car.id, patch)); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const connect = (label: string) => <div className="pi-list-foot"><DrawerButton primary onClick={onConnect} disabled={connecting}>{connecting ? 'Opening Smartcar…' : label}</DrawerButton></div>;
  if (error && !data) return <p role="alert">{error}</p>;
  if (!data) return <p className="pi-muted">Loading cars…</p>;
  if (data.status === 'not_connected') return <div className="pv-list">
    <p className="pi-muted">Link your car through Smartcar and I’ll read its odometer, fuel or charge and whether it’s locked — straight from the car — and keep its mileage here current. Read-only: I can’t lock, unlock or start it.</p>
    {connect('Connect Smartcar')}
  </div>;
  if (data.status === 'needs_reauth') return <div className="pv-list"><p className="pi-muted">Smartcar needs reconnecting before I can read your cars again.</p>{connect('Reconnect Smartcar')}</div>;
  if (!data.cars.length) return <div className="pv-list"><p className="pi-muted">Smartcar is linked, but no cars are shared. Connect again and tick your car.</p>{connect('Choose cars')}</div>;
  return <div className="pv-list pv-smartcar">
    {data.stale && <p className="pi-muted" role="status">Your car maker’s service couldn’t be reached — these are the last readings.</p>}
    <ul>{data.cars.map(c => {
      const level = c.battery?.percent ?? c.fuel?.percent;
      const range = c.battery?.rangeMi ?? c.fuel?.rangeMi;
      return <li key={c.id} className="pv-car-row">
        <div className="pv-card-text">
          <strong>{c.vehicleName || [c.year, c.make, c.model].filter(Boolean).join(' ') || 'Car'}</strong>
          <small>{[c.odometerMi !== null ? milesLabel(c.odometerMi) : null, level != null ? `${c.battery ? 'Battery' : 'Fuel'} ${level}%${range ? ` · ${range} mi range` : ''}` : null,
            c.locked === null ? null : c.locked ? 'Locked' : 'Unlocked'].filter(Boolean).join(' · ') || 'No readings yet'}</small>
          {c.location && <small><a href={`https://www.google.com/maps?q=${c.location.latitude},${c.location.longitude}`} target="_blank" rel="noreferrer">Where it’s parked</a></small>}
        </div>
        <label className="pi-label">Is
          <select value={c.vehicleUuid || ''} disabled={busy === c.id} onChange={e => void change(c, { vehicleUuid: e.target.value || null })}>
            <option value="">Not one of my vehicles</option>
            {vehicles.map(v => <option key={v.uuid} value={v.uuid}>{v.name}</option>)}
          </select>
        </label>
        <label className="pv-toggle"><input type="checkbox" checked={c.locationEnabled} disabled={busy === c.id} onChange={e => void change(c, { locationEnabled: e.target.checked })} />Share location</label>
      </li>;
    })}</ul>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function VehicleDetailsDrawer({ state, vehicle, propertyName, onClose, onEdit, onAsk }: { state: VehiclesState; vehicle: Vehicle; propertyName: string; onClose: () => void; onEdit: () => void; onAsk: (v: Vehicle) => void }) {
  const photo = useVehiclePhoto(vehicle);
  const due = dueItems(vehicle);
  const car = carOf(vehicle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const removeIt = async () => {
    setBusy(true); setError('');
    try { await state.remove(vehicle.uuid); onClose(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <Drawer eyebrow="VEHICLE" title={vehicle.name} onClose={() => { if (!busy) onClose(); }}>
    <div className="pi-details">
      {vehicle.hasPhoto && (photo ? <img className="pv-hero" src={photo} alt={`Photo of ${vehicle.name}`} /> : <p className="pi-muted">Loading photo…</p>)}
      <dl>
        {car && car !== vehicle.name && <><dt>Vehicle</dt><dd>{car}</dd></>}
        {vehicle.color && <><dt>Color</dt><dd>{vehicle.color}</dd></>}
        {vehicle.plate && <><dt>Plate</dt><dd>{vehicle.plate}</dd></>}
        {vehicle.vin && <><dt>VIN</dt><dd className="pv-mono">{vehicle.vin}</dd></>}
        {(vehicle.registrationState || vehicle.registrationNumber) && <><dt>Registration</dt><dd>{vehicle.registrationState}{vehicle.registrationState && vehicle.registrationNumber ? ' · ' : ''}{vehicle.registrationNumber && <span className="pv-mono">{vehicle.registrationNumber}</span>}</dd></>}
        {vehicle.inspectionStation && <><dt>Inspected at</dt><dd>{vehicle.inspectionStation}</dd></>}
        <dt>Odometer</dt><dd>{vehicle.odometer !== null ? `${milesLabel(vehicle.odometer)} · as of ${dayLabel(vehicle.odometerOn!)}` : 'Not recorded'}</dd>
        {propertyName && <><dt>Lives at</dt><dd>{propertyName}</dd></>}
        {vehicle.notes && <><dt>For Athena</dt><dd>{vehicle.notes}</dd></>}
      </dl>
      <section className="pv-due" aria-label="Coming due">
        <h3>Coming due</h3>
        {due.length ? <ul>{due.map((d, i) => <DueRow key={i} state={state} vehicle={vehicle} item={d} />)}</ul>
          : <p className="pi-muted">No dates yet. Add registration, inspection, insurance or service dates with <strong>Edit</strong>.</p>}
        {due.length > 0 && !vehicle.registrationDue && !vehicle.inspectionDue && <p className="pi-muted">No registration or inspection date yet — add them with <strong>Edit</strong> and I’ll put them on Home when they’re close.</p>}
      </section>
      <RecallList state={state} vehicle={vehicle} />
      <div className="pi-actions"><DrawerButton onClick={() => onAsk(vehicle)}>Ask Athena about it</DrawerButton></div>
      <ServiceLog state={state} vehicle={vehicle} />
      <div className="pi-details-manage">
        <DrawerButton onClick={onEdit} disabled={busy}>Edit</DrawerButton>
        {confirming ? <DrawerButton className="pi-danger" onClick={removeIt} disabled={busy}>Remove for good</DrawerButton>
          : <DrawerButton onClick={() => setConfirming(true)} disabled={busy}>Remove vehicle</DrawerButton>}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </Drawer>;
}
