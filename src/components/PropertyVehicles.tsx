import { useEffect, useState } from 'react';
import { carOf, dueItems, vehiclesApi, type ServiceInput, type Vehicle, type VehicleInput } from '../api/propertyVehicles';
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
  return <li><button type="button" className="pv-card" onClick={onOpen}>
    <span className="pv-thumb">{photo ? <img src={photo} alt="" /> : CAR}</span>
    <span className="pv-card-text">
      <strong>{v.name}</strong>
      <small>{[car !== v.name ? car : '', v.color, v.plate].filter(Boolean).join(' · ') || 'No details yet'}</small>
      <small>{v.odometer !== null ? `${milesLabel(v.odometer)} · as of ${dayLabel(v.odometerOn!)}` : 'No mileage yet'}</small>
      {top ? <span className={`pv-chip pv-${top.tone}`}>{top.label} {top.when}</span> : due.length ? <span className="pv-chip pv-later">Nothing due soon</span> : null}
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

type Draft = Record<'name' | 'year' | 'make' | 'model' | 'color' | 'plate' | 'vin' | 'odometer' | 'registrationDue' | 'inspectionDue' | 'insuranceDue' | 'serviceDue' | 'serviceDueMiles' | 'notes', string>;
const toDraft = (v?: Vehicle | null): Draft => ({
  name: v?.name || '', year: v?.year?.toString() || '', make: v?.make || '', model: v?.model || '', color: v?.color || '',
  plate: v?.plate || '', vin: v?.vin || '', odometer: v?.odometer?.toString() || '',
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
        <legend>Coming due <small>(optional)</small></legend>
        <div className="pv-row">
          {field('registrationDue', 'Registration renews', { type: 'date' })}
          {field('inspectionDue', 'Inspection due', { type: 'date' })}
        </div>
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
        <dt>Odometer</dt><dd>{vehicle.odometer !== null ? `${milesLabel(vehicle.odometer)} · as of ${dayLabel(vehicle.odometerOn!)}` : 'Not recorded'}</dd>
        {propertyName && <><dt>Lives at</dt><dd>{propertyName}</dd></>}
        {vehicle.notes && <><dt>For Athena</dt><dd>{vehicle.notes}</dd></>}
      </dl>
      <section className="pv-due" aria-label="Coming due">
        <h3>Coming due</h3>
        {due.length ? <ul>{due.map((d, i) => <li key={i}><span>{d.label}</span><span className={`pv-chip pv-${d.tone}`}>{d.when}</span></li>)}</ul>
          : <p className="pi-muted">No dates yet. Add registration, inspection, insurance or service dates with <strong>Edit</strong>.</p>}
      </section>
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
