import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { MiniMap } from './MiniMap';
import {
  dashboardApi,
  type AddressMatch,
  type CommunityEvent,
  type ContactCard,
  type LinkedContact,
  type EventInput,
  type Neighbor,
  type NeighborInput,
  type PlaceKind,
  type PlaceReminder,
  type WatchPlace,
} from '../api/dashboard';
import { locationApi } from '../api/companion';

/**
 * The Community page's own panels: points of interest, neighbours and local
 * events. Each is the person's list, typed by them; Athena reads all three
 * into every adult conversation (core_api services/community.js).
 *
 * Points of interest are the watched places — every one is still watched for
 * 911 calls and weather within its ring, whatever its kind. The kind is only
 * what the place is to the person, and the icon on the map.
 *
 * These are components rather than the plain functions the section pages are
 * built from, because each carries a form whose half-typed state must survive
 * the dashboard re-rendering around it.
 */

export const PLACE_KINDS: Record<PlaceKind, { label: string; icon: string }> = {
  home: { label: 'Home', icon: '🏠' },
  family: { label: 'Family', icon: '👪' },
  neighborhood: { label: 'Neighborhood', icon: '🏘️' },
  church: { label: 'Church', icon: '⛪' },
  school: { label: 'School', icon: '🏫' },
  town: { label: 'Town', icon: '🏛️' },
  work: { label: 'Work', icon: '💼' },
  business: { label: 'Local business', icon: '🏪' },
  park: { label: 'Park', icon: '🌳' },
  other: { label: 'Other', icon: '📍' },
};
const kindOf = (kind?: string) => PLACE_KINDS[kind as PlaceKind] || PLACE_KINDS.other;

const RADII = [1, 2, 3, 5, 10];

const errorText = (e: unknown, fallback: string) => {
  const err = e as Error & { body?: { message?: string } };
  return err?.body?.message || err?.message || fallback;
};

/** A field label that stays readable above a dashboard input. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="community-field"><span>{label}</span>{children}</label>;
}

function Problem({ text }: { text: string | null }) {
  return text ? <p className="dashboard-notice" role="status">{text}</p> : null;
}

// --- Points of interest ----------------------------------------------------

/** The map on the Community page: every point of interest, each with its ring. */
export function CommunityMap({ places, height = 240 }: { places: WatchPlace[]; height?: number }) {
  const shown = places.filter(p => p.enabled);
  if (!shown.length) return null;
  return <MiniMap places={shown.map(p => ({ name: p.name, latitude: p.latitude, longitude: p.longitude, radiusMiles: p.radiusMiles, icon: kindOf(p.kind).icon }))} height={height} className="community-map" />;
}

export function PointsOfInterest({ places, onPlaces }: { places: WatchPlace[]; onPlaces: (places: WatchPlace[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function save(place: WatchPlace, patch: Partial<WatchPlace>) {
    setError(null);
    setBusy(place.uuid);
    try {
      const next = { ...place, ...patch };
      const r = await dashboardApi.saveWatchPlace({
        name: next.name, latitude: next.latitude, longitude: next.longitude, address: next.address,
        radiusMiles: next.radiusMiles, enabled: next.enabled, kind: next.kind, notes: next.notes,
      });
      onPlaces(r.places);
      return true;
    } catch (err) {
      setError(errorText(err, 'Could not update that place.'));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(place: WatchPlace) {
    if (!window.confirm(`Remove ${place.name}? I'll stop watching around it.`)) return;
    setError(null);
    setBusy(place.uuid);
    try {
      onPlaces((await dashboardApi.removeWatchPlace(place.uuid)).places);
    } catch (err) {
      setError(errorText(err, 'Could not remove that place.'));
    } finally {
      setBusy(null);
    }
  }

  return <>
    <Problem text={error} />
    {!places.length && <p className="dashboard-empty">Nothing yet — start with home, then your church, the kids’ school, the town square.</p>}
    <ul className="community-list">
      {places.map(p => <li key={p.uuid} className={p.enabled ? '' : 'community-paused'}>
        <span className="community-icon" aria-hidden>{kindOf(p.kind).icon}</span>
        <div className="community-body">
          <strong>{p.name}</strong>
          <small>{[kindOf(p.kind).label, p.address || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`].join(' · ')}</small>
          {p.notes && <p className="community-notes">{p.notes}</p>}
          <div className="community-controls">
            <label>within{' '}
              <select value={p.radiusMiles} disabled={busy === p.uuid} onChange={e => void save(p, { radiusMiles: Number(e.target.value) })} aria-label={`Watch radius for ${p.name}`}>
                {[...new Set([...RADII, p.radiusMiles])].sort((a, b) => a - b).map(r => <option key={r} value={r}>{r} mi</option>)}
              </select>
            </label>
            <label><input type="checkbox" checked={p.enabled} disabled={busy === p.uuid} onChange={() => void save(p, { enabled: !p.enabled })} /> {p.enabled ? 'watching' : 'paused'}</label>
            <button type="button" className="community-link" onClick={() => setEditing(editing === p.uuid ? null : p.uuid)}>{editing === p.uuid ? 'Close' : 'Edit'}</button>
            <button type="button" className="community-link community-danger" disabled={busy === p.uuid} onClick={() => void remove(p)}>Remove</button>
          </div>
          {editing === p.uuid && <PlaceDetailsForm place={p} busy={busy === p.uuid} onSave={async patch => { if (await save(p, patch)) setEditing(null); }} />}
        </div>
      </li>)}
    </ul>
    {adding
      ? <AddPlace places={places} onCancel={() => setAdding(false)} onSaved={next => { onPlaces(next); setAdding(false); }} />
      : <button type="button" className="dashboard-chat-cta" onClick={() => setAdding(true)}>Add a point of interest <span>＋</span></button>}
  </>;
}

/** Kind and notes for a saved place. Moving a place is remove-and-add: the ring is what it was saved for. */
function PlaceDetailsForm({ place, busy, onSave }: { place: WatchPlace; busy: boolean; onSave: (patch: Partial<WatchPlace>) => void }) {
  const [kind, setKind] = useState<PlaceKind>(place.kind || 'other');
  const [notes, setNotes] = useState(place.notes || '');
  return <form className="dashboard-form community-form" onSubmit={e => { e.preventDefault(); onSave({ kind, notes: notes.trim() || null }); }}>
    <Field label="What it is"><KindSelect value={kind} onChange={setKind} /></Field>
    <Field label="Notes for Athena"><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="Wednesday night suppers; Pastor Jim" /></Field>
    <button className="dashboard-chat-cta" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'} <span>↗</span></button>
  </form>;
}

function KindSelect({ value, onChange }: { value: PlaceKind; onChange: (kind: PlaceKind) => void }) {
  return <select value={value} onChange={e => onChange(e.target.value as PlaceKind)}>
    {(Object.keys(PLACE_KINDS) as PlaceKind[]).map(k => <option key={k} value={k}>{PLACE_KINDS[k].icon} {PLACE_KINDS[k].label}</option>)}
  </select>;
}

/**
 * A new point of interest: name and kind, then an address (looked up against
 * the US Census geocoder server-side) or "use my current location", a radius
 * shown as a ring on the map, and notes.
 */
function AddPlace({ places, onCancel, onSaved }: { places: WatchPlace[]; onCancel: () => void; onSaved: (places: WatchPlace[]) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PlaceKind>(places.some(p => p.kind === 'home') ? 'church' : 'home');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(3);
  const [notes, setNotes] = useState('');
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [picked, setPicked] = useState<AddressMatch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setPicked(null);
    setBusy('find');
    try {
      const r = await dashboardApi.lookupAddress(address);
      setMatches(r.matches);
      if (r.matches.length === 1) setPicked(r.matches[0]);
      if (!r.matches.length) setError("I couldn't find that address. Check the street and town, or use your current location.");
    } catch (err) {
      setError(errorText(err, 'Could not look that address up.'));
    } finally {
      setBusy(null);
    }
  }

  function here() {
    setError(null);
    if (!('geolocation' in navigator)) { setError('This device cannot share its location.'); return; }
    setBusy('here');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const match = { label: 'Current location', latitude: Math.round(pos.coords.latitude * 1e6) / 1e6, longitude: Math.round(pos.coords.longitude * 1e6) / 1e6 };
        setMatches([match]);
        setPicked(match);
        setBusy(null);
      },
      err => {
        setError(err.code === err.PERMISSION_DENIED ? 'Location permission was refused.' : 'Could not get your location.');
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function add() {
    if (!picked) return;
    const cleanName = name.trim();
    if (!cleanName) { setError('Give the place a name, like Grace Church or Mom’s house.'); return; }
    if (places.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      setError(`You already have a place called ${cleanName}. Pick another name, or remove that one first.`);
      return;
    }
    setError(null);
    setBusy('add');
    try {
      const r = await dashboardApi.saveWatchPlace({
        name: cleanName, kind, latitude: picked.latitude, longitude: picked.longitude, radiusMiles: radius,
        address: picked.label === 'Current location' ? null : picked.label, notes: notes.trim() || null,
      });
      onSaved(r.places);
    } catch (err) {
      setError(errorText(err, 'Could not save that place.'));
    } finally {
      setBusy(null);
    }
  }

  return <div className="community-add">
    <div className="dashboard-form community-form">
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="Grace Church, Mom’s house, Downtown" /></Field>
      <Field label="What it is"><KindSelect value={kind} onChange={setKind} /></Field>
    </div>
    <form onSubmit={find} className="dashboard-form community-form community-inline">
      <Field label="Address">
        <input value={address} onChange={e => { setAddress(e.target.value); setMatches(null); setPicked(null); }} placeholder="Street address, town, state" />
      </Field>
      <button type="submit" className="source-fix" disabled={busy === 'find' || address.trim().length < 5}>{busy === 'find' ? 'Finding…' : 'Find'}</button>
    </form>
    <button type="button" className="community-link" onClick={here} disabled={busy === 'here'}>{busy === 'here' ? 'Getting your location…' : 'or use my current location'}</button>

    {matches && matches.length > 1 && <ul className="community-matches">{matches.map(m => <li key={`${m.latitude},${m.longitude}`}>
      <button type="button" className={picked === m ? 'active' : ''} onClick={() => setPicked(m)}>{m.label}</button>
    </li>)}</ul>}

    {picked && <div className="community-picked">
      <p className="source-note">{picked.label}</p>
      <MiniMap places={[{ name: name.trim() || 'New place', latitude: picked.latitude, longitude: picked.longitude, radiusMiles: radius, icon: kindOf(kind).icon }]} height={180} />
      <div className="dashboard-form community-form">
        <Field label="Tell me about anything within">
          <select value={radius} onChange={e => setRadius(Number(e.target.value))}>{RADII.map(r => <option key={r} value={r}>{r} mi</option>)}</select>
        </Field>
        <Field label="Notes for Athena (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="Who you know there, when you go, anything worth remembering" /></Field>
      </div>
    </div>}

    <Problem text={error} />
    <div className="community-actions">
      {picked && <button type="button" className="dashboard-chat-cta" onClick={() => void add()} disabled={busy === 'add'}>{busy === 'add' ? 'Saving…' : 'Watch this place'} <span>↗</span></button>}
      <button type="button" className="community-link" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

// --- Neighbours ------------------------------------------------------------
// A neighbour is a household: kept by its address, with any number of the
// person's Google contacts linked to it. Contacts whose Google address is the
// household's street line are suggested; the person links them.

const emptyNeighbor: NeighborInput = { name: null, address: null, latitude: null, longitude: null, placeUuid: null, where: null, contact: null, notes: null, contacts: [] };

/** Why a linked contact's details aren't showing, in the words a row has room for. */
const LINK_PROBLEM: Record<string, string> = {
  missing: 'no longer in Google Contacts — deleted or merged',
  not_connected: 'Google Contacts isn’t connected',
  unreadable: 'couldn’t read Google Contacts just now',
};

const streetOf = (address: string | null) => (address || '').split(',')[0].trim();

/** What a household is called: its name, else who lives there, else its street. */
function householdLabel(n: Pick<Neighbor, 'name' | 'address' | 'contacts'>) {
  if (n.name) return n.name;
  const people = n.contacts.map(c => c.name).filter(Boolean) as string[];
  if (people.length) return people.length > 2 ? `${people.slice(0, 2).join(', ')} +${people.length - 2}` : people.join(' & ');
  return streetOf(n.address) || 'A household';
}

function ContactAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (photoUrl && !broken) return <img className="memory-avatar community-photo" src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="memory-avatar" aria-hidden>{name.replace(/^the\s+/i, '').slice(0, 1).toUpperCase()}</span>;
}

/** Phone and email of a linked contact, each one tap away. */
function ContactLines({ card }: { card: ContactCard }) {
  if (!card.phone && !card.email) return null;
  return <small className="community-contact-lines">
    {card.phone && <a href={`tel:${card.phone.replace(/[^\d+]/g, '')}`}>{card.phone}</a>}
    {card.email && <a href={`mailto:${card.email}`}>{card.email}</a>}
  </small>;
}

/** One person at a household: their photo, name, and how to reach them. */
function LinkedPerson({ person, onUnlink }: { person: LinkedContact; onUnlink?: () => void }) {
  const name = person.card?.name || person.name || 'Linked contact';
  return <li className="community-person">
    <ContactAvatar name={name} photoUrl={person.card?.photoUrl} />
    <div className="community-body">
      <strong>{name}</strong>
      {person.card ? <ContactLines card={person.card} /> : person.status && LINK_PROBLEM[person.status] && <small className="community-warn">{LINK_PROBLEM[person.status]}</small>}
    </div>
    {onUnlink && <button type="button" className="community-link" onClick={onUnlink}>Unlink</button>}
  </li>;
}

export function Neighbors({ neighbors, places, onNeighbors, onConnectContacts }: { neighbors: Neighbor[]; places: WatchPlace[]; onNeighbors: (neighbors: Neighbor[]) => void; onConnectContacts?: () => void }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const placeName = new Map(places.map(p => [p.uuid, p.name]));

  async function save(input: NeighborInput, uuid?: string) {
    setError(null);
    setBusy(uuid || 'new');
    try {
      onNeighbors((await dashboardApi.saveNeighbor(input, uuid)).neighbors);
      setEditing(null);
    } catch (err) {
      setError(errorText(err, 'Could not save that household.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(n: Neighbor) {
    if (!window.confirm(`Take ${householdLabel(n)} off your list? Their Google contacts are not touched.`)) return;
    setError(null);
    setBusy(n.uuid);
    try {
      onNeighbors((await dashboardApi.removeNeighbor(n.uuid)).neighbors);
    } catch (err) {
      setError(errorText(err, 'Could not remove that household.'));
    } finally {
      setBusy(null);
    }
  }

  const toInput = (n: Neighbor): NeighborInput => ({
    name: n.name, address: n.address, latitude: n.latitude, longitude: n.longitude, placeUuid: n.placeUuid,
    where: n.where, contact: n.contact, notes: n.notes, contacts: n.contacts.map(c => ({ contactId: c.contactId, name: c.name })),
  });

  return <>
    <Problem text={error} />
    {!neighbors.length && editing !== 'new' && <p className="dashboard-empty">Who lives around you? Add a house by its address and link the people there from your Google contacts — I’ll know who you mean next time.</p>}
    <ul className="community-list">
      {neighbors.map(n => <li key={n.uuid}>
        <span className="community-icon" aria-hidden>🏡</span>
        <div className="community-body">
          <strong>{householdLabel(n)}</strong>
          <small>{[n.address ? streetOf(n.address) : null, n.where, n.placeUuid && placeName.get(n.placeUuid) ? `near ${placeName.get(n.placeUuid)}` : null].filter(Boolean).join(' · ')}</small>
          {!n.address && <small className="community-warn">No address yet — edit to add one.</small>}
          {n.contacts.length > 0 && <ul className="community-people">{n.contacts.map(c => <LinkedPerson key={c.contactId} person={c} />)}</ul>}
          {n.contact && <small>{n.contact}</small>}
          {n.notes && <p className="community-notes">{n.notes}</p>}
          <div className="community-controls">
            <button type="button" className="community-link" onClick={() => setEditing(editing === n.uuid ? null : n.uuid)}>{editing === n.uuid ? 'Close' : 'Edit'}</button>
            <button type="button" className="community-link community-danger" disabled={busy === n.uuid} onClick={() => void remove(n)}>Remove</button>
          </div>
          {editing === n.uuid && <NeighborForm initial={toInput(n)} people={n.contacts} uuid={n.uuid} places={places} busy={busy === n.uuid} onSave={input => void save(input, n.uuid)} onConnectContacts={onConnectContacts} />}
        </div>
      </li>)}
    </ul>
    {editing === 'new'
      ? <NeighborForm initial={emptyNeighbor} people={[]} places={places} busy={busy === 'new'} onSave={input => void save(input)} onCancel={() => setEditing(null)} onConnectContacts={onConnectContacts} />
      : <button type="button" className="dashboard-chat-cta" onClick={() => setEditing('new')}>Add a household <span>＋</span></button>}
  </>;
}

/**
 * A household: its address first (the key — Find standardizes it), then the
 * people there. Contacts whose Google address is this street are offered as
 * suggestions; any other contact can be found by name.
 */
function NeighborForm({ initial, people, uuid, places, busy, onSave, onCancel, onConnectContacts }: {
  initial: NeighborInput; people: LinkedContact[]; uuid?: string; places: WatchPlace[]; busy: boolean;
  onSave: (input: NeighborInput) => void; onCancel?: () => void; onConnectContacts?: () => void;
}) {
  const [form, setForm] = useState<NeighborInput>(initial);
  const [linked, setLinked] = useState<LinkedContact[]>(people);
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const set = (key: keyof NeighborInput) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value || null }));
  const linkedIds = new Set(linked.map(c => c.contactId));

  function link(card: ContactCard) {
    if (linkedIds.has(card.contactId)) return;
    setLinked(l => [...l, { contactId: card.contactId, name: card.name, card, status: 'ok' }]);
  }
  function unlink(contactId: string) {
    setLinked(l => l.filter(c => c.contactId !== contactId));
  }
  async function find() {
    const q = (form.address || '').trim();
    if (q.length < 5) return;
    setFinding(true);
    setFindError(null);
    try {
      const r = await dashboardApi.lookupAddress(q);
      setMatches(r.matches);
      if (r.matches.length === 1) pickAddress(r.matches[0]);
      if (!r.matches.length) setFindError('No match — I’ll keep it as you typed it.');
    } catch (err) {
      setFindError(errorText(err, 'Couldn’t look that address up — I’ll keep it as you typed it.'));
    } finally {
      setFinding(false);
    }
  }
  function pickAddress(m: AddressMatch) {
    setForm(f => ({ ...f, address: m.label, latitude: m.latitude, longitude: m.longitude }));
    setMatches(null);
  }

  return <form className="dashboard-form community-form" onSubmit={e => {
    e.preventDefault();
    onSave({ ...form, name: (form.name || '').trim() || null, address: (form.address || '').trim() || null, contacts: linked.map(c => ({ contactId: c.contactId, name: c.name })) });
  }}>
    <div className="community-inline">
      <Field label="Address">
        <input value={form.address || ''} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, address: v || null, latitude: null, longitude: null })); setMatches(null); }} placeholder="152 Rushing Water Ln, Troutman, NC" required />
      </Field>
      <button type="button" className="source-fix" disabled={finding || (form.address || '').trim().length < 5} onClick={() => void find()}>{finding ? 'Finding…' : 'Find'}</button>
    </div>
    {findError && <small className="community-hint">{findError}</small>}
    {matches && matches.length > 1 && <ul className="community-matches">{matches.map(m => <li key={`${m.latitude},${m.longitude}`}>
      <button type="button" onClick={() => pickAddress(m)}>{m.label}</button>
    </li>)}</ul>}

    <Field label="Who lives here">
      {linked.length > 0 && <ul className="community-people community-people-edit">{linked.map(c => <LinkedPerson key={c.contactId} person={c} onUnlink={() => unlink(c.contactId)} />)}</ul>}
      <ContactsAtAddress address={form.address} exclude={linkedIds} household={uuid} onPick={link} />
      <ContactSearch exclude={linkedIds} household={uuid} onPick={link} onConnect={onConnectContacts} />
    </Field>

    <Field label="Household name (optional)"><input value={form.name || ''} onChange={set('name')} maxLength={120} placeholder="The Hendersons" /></Field>
    <Field label="Near">
      <select value={form.placeUuid || ''} onChange={set('placeUuid')}>
        <option value="">—</option>
        {places.map(p => <option key={p.uuid} value={p.uuid}>{kindOf(p.kind).icon} {p.name}</option>)}
      </select>
    </Field>
    <Field label="Which house"><input value={form.where || ''} onChange={set('where')} maxLength={160} placeholder="Two doors down, the blue house" /></Field>
    {!linked.length && <Field label="Phone or email (optional)"><input value={form.contact || ''} onChange={set('contact')} maxLength={120} /></Field>}
    <Field label="Notes for Athena"><textarea value={form.notes || ''} onChange={set('notes')} maxLength={500} rows={2} placeholder="Kids’ names, the dog, has a generator, retired nurse" /></Field>
    <div className="community-actions">
      <button className="dashboard-chat-cta" type="submit" disabled={busy || !(form.address || '').trim()}>{busy ? 'Saving…' : 'Save'} <span>↗</span></button>
      {onCancel && <button type="button" className="community-link" onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}

/** A contact row in a suggestion or search list; one already at another household says so and can't be picked. */
function ContactOption({ card, household, onPick }: { card: ContactCard; household?: string; onPick: (card: ContactCard) => void }) {
  const elsewhere = card.linkedTo && card.linkedTo.uuid !== household ? card.linkedTo : null;
  return <li>
    <button type="button" disabled={!!elsewhere} onClick={() => onPick(card)}>
      <ContactAvatar name={card.name} photoUrl={card.photoUrl} />
      <span><strong>{card.name}</strong><small>{elsewhere ? `already at ${elsewhere.label || 'another household'}` : [card.phone, card.email, card.address].filter(Boolean).join(' · ') || 'No details'}</small></span>
      {!elsewhere && <span className="community-add-mark" aria-hidden>＋</span>}
    </button>
  </li>;
}

/** "At this address in your contacts": Google contacts whose address is this street line. */
function ContactsAtAddress({ address, exclude, household, onPick }: { address: string | null; exclude: Set<string>; household?: string; onPick: (card: ContactCard) => void }) {
  const [found, setFound] = useState<ContactCard[]>([]);
  useEffect(() => {
    const term = (address || '').trim();
    if (!/^\d/.test(term) || term.length < 6) { setFound([]); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      dashboardApi.contactsAt(term).then(r => { if (alive) setFound(r.matches); }).catch(() => { if (alive) setFound([]); });
    }, 400);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [address]);
  const shown = found.filter(c => !exclude.has(c.contactId));
  if (!shown.length) return null;
  return <div className="community-suggest">
    <small className="community-hint">At this address in your Google contacts</small>
    <ul className="community-matches">{shown.map(c => <ContactOption key={c.contactId} card={c} household={household} onPick={onPick} />)}</ul>
  </div>;
}

/**
 * "Add someone from Google Contacts": searches the person's own address book
 * as they type (after a pause, two letters minimum). Only the contact's id and
 * name are saved — the details shown are read from Google each time.
 */
function ContactSearch({ exclude, household, onPick, onConnect }: { exclude: Set<string>; household?: string; onPick: (card: ContactCard) => void; onConnect?: () => void }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<{ linked: boolean; matches: ContactCard[]; searching: boolean; error: string | null }>({ linked: true, matches: [], searching: false, error: null });
  // Ask once on open whether Contacts is connected at all, so the Connect
  // button shows before anyone types into a box that can't find anything.
  useEffect(() => {
    let alive = true;
    dashboardApi.searchContacts('').then(r => { if (alive && !r.linked) setState(s => ({ ...s, linked: false })); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setState(s => ({ ...s, matches: [], searching: false, error: null })); return; }
    let alive = true;
    setState(s => ({ ...s, searching: true, error: null }));
    const timer = window.setTimeout(() => {
      dashboardApi.searchContacts(term)
        .then(r => { if (alive) setState({ linked: r.linked, matches: r.matches, searching: false, error: null }); })
        .catch(err => { if (alive) setState(s => ({ ...s, searching: false, error: errorText(err, 'I couldn’t search your contacts just now.') })); });
    }, 300);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [q]);

  if (!state.linked) return <div className="community-linked-empty">
    <p className="dashboard-empty">Connect Google Contacts to link the people who live here.</p>
    {onConnect && <button type="button" className="source-fix" onClick={onConnect}>Connect Google Contacts <span>↗</span></button>}
  </div>;
  const shown = state.matches.filter(c => !exclude.has(c.contactId));
  return <div className="community-contact-search">
    <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Add someone from your Google contacts" aria-label="Search your Google contacts" />
    {state.searching && <small className="community-hint">Searching…</small>}
    {state.error && <small className="community-warn">{state.error}</small>}
    {!state.searching && !state.error && q.trim().length >= 2 && !shown.length && <small className="community-hint">No contact matches “{q.trim()}”.</small>}
    {shown.length > 0 && <ul className="community-matches">{shown.map(c => <ContactOption key={c.contactId} card={c} household={household} onPick={card => { onPick(card); setQ(''); }} />)}</ul>}
  </div>;
}

// --- Local events ----------------------------------------------------------

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "Sat, Sep 26 · in 3 days" for an event's next occurrence. */
export function eventWhen(e: CommunityEvent) {
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const delta = Math.round((Date.parse(`${e.nextOn}T12:00:00`) - Date.parse(`${todayIso()}T12:00:00`)) / 86400000);
  const rel = delta === 0 ? 'today' : delta === 1 ? 'tomorrow' : delta === -1 ? 'yesterday' : delta < 0 ? `${-delta} days ago` : delta <= 30 ? `in ${delta} days` : null;
  return [`${day(e.nextOn)}${e.nextEndsOn ? ` – ${day(e.nextEndsOn)}` : ''}`, e.time, rel].filter(Boolean).join(' · ');
}

export const isPastEvent = (e: CommunityEvent) => (e.nextEndsOn || e.nextOn) < todayIso();

const emptyEvent: EventInput = { title: '', startsOn: '', endsOn: null, time: null, placeUuid: null, location: null, repeats: 'none', url: null, notes: null };

export function LocalEvents({ events, places, onEvents }: { events: CommunityEvent[]; places: WatchPlace[]; onEvents: (events: CommunityEvent[]) => void }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const placeName = new Map(places.map(p => [p.uuid, p.name]));
  const upcoming = events.filter(e => !isPastEvent(e));
  const past = events.filter(isPastEvent);

  async function save(input: EventInput, uuid?: string) {
    setError(null);
    setBusy(uuid || 'new');
    try {
      onEvents((await dashboardApi.saveEvent(input, uuid)).events);
      setEditing(null);
    } catch (err) {
      setError(errorText(err, 'Could not save that event.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(e: CommunityEvent) {
    if (!window.confirm(`Remove ${e.title}?`)) return;
    setError(null);
    setBusy(e.uuid);
    try {
      onEvents((await dashboardApi.removeEvent(e.uuid)).events);
    } catch (err) {
      setError(errorText(err, 'Could not remove that event.'));
    } finally {
      setBusy(null);
    }
  }

  function line(e: CommunityEvent) {
    const where = e.location || (e.placeUuid && placeName.get(e.placeUuid)) || null;
    return <li key={e.uuid}>
      <span className="event-dot" />
      <div className="community-body">
        <small>{eventWhen(e)}{e.repeats === 'yearly' ? ' · every year' : ''}</small>
        <strong>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</strong>
        {where && <small>{where}</small>}
        {e.notes && <p className="community-notes">{e.notes}</p>}
        <div className="community-controls">
          <button type="button" className="community-link" onClick={() => setEditing(editing === e.uuid ? null : e.uuid)}>{editing === e.uuid ? 'Close' : 'Edit'}</button>
          <button type="button" className="community-link community-danger" disabled={busy === e.uuid} onClick={() => void remove(e)}>Remove</button>
        </div>
        {editing === e.uuid && <EventForm initial={e} places={places} busy={busy === e.uuid} onSave={input => void save(input, e.uuid)} />}
      </div>
    </li>;
  }

  return <>
    <Problem text={error} />
    {!events.length && editing !== 'new' && <p className="dashboard-empty">Church suppers, school fairs, Ham Day — add what’s going on around you and I’ll keep it in mind when you’re making plans.</p>}
    {upcoming.length > 0 && <div className="day-group"><h3>Coming up <span className="card-count">{upcoming.length}</span></h3><ul className="dashboard-data-list calendar-events">{upcoming.map(line)}</ul></div>}
    {past.length > 0 && <div className="day-group"><h3>Recently</h3><ul className="dashboard-data-list calendar-events community-past">{past.map(line)}</ul></div>}
    {editing === 'new'
      ? <EventForm initial={emptyEvent} places={places} busy={busy === 'new'} onSave={input => void save(input)} onCancel={() => setEditing(null)} />
      : <button type="button" className="dashboard-chat-cta" onClick={() => setEditing('new')}>Add a local event <span>＋</span></button>}
  </>;
}

function EventForm({ initial, places, busy, onSave, onCancel }: { initial: EventInput; places: WatchPlace[]; busy: boolean; onSave: (input: EventInput) => void; onCancel?: () => void }) {
  const [form, setForm] = useState<EventInput>({
    title: initial.title, startsOn: initial.startsOn, endsOn: initial.endsOn, time: initial.time, placeUuid: initial.placeUuid,
    location: initial.location, repeats: initial.repeats, url: initial.url, notes: initial.notes,
  });
  const set = (key: keyof EventInput) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value || null }));
  return <form className="dashboard-form community-form" onSubmit={e => { e.preventDefault(); onSave({ ...form, title: form.title.trim() }); }}>
    <Field label="What"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={160} placeholder="Ham Day, Fall Festival, church supper" required /></Field>
    <div className="community-pair">
      <Field label="Day"><input type="date" value={form.startsOn} onChange={e => setForm(f => ({ ...f, startsOn: e.target.value }))} required /></Field>
      <Field label="Last day (optional)"><input type="date" value={form.endsOn || ''} min={form.startsOn || undefined} onChange={set('endsOn')} /></Field>
    </div>
    <Field label="Time"><input value={form.time || ''} onChange={set('time')} maxLength={60} placeholder="9am–3pm" /></Field>
    <Field label="Where">
      <select value={form.placeUuid || ''} onChange={set('placeUuid')}>
        <option value="">Somewhere else…</option>
        {places.map(p => <option key={p.uuid} value={p.uuid}>{kindOf(p.kind).icon} {p.name}</option>)}
      </select>
    </Field>
    {!form.placeUuid && <Field label="Place"><input value={form.location || ''} onChange={set('location')} maxLength={160} placeholder="Downtown Troutman" /></Field>}
    <label className="community-check"><input type="checkbox" checked={form.repeats === 'yearly'} onChange={e => setForm(f => ({ ...f, repeats: e.target.checked ? 'yearly' : 'none' }))} /> Happens every year</label>
    <Field label="Link (optional)"><input type="url" value={form.url || ''} onChange={set('url')} maxLength={500} placeholder="https://" /></Field>
    <Field label="Notes for Athena"><textarea value={form.notes || ''} onChange={set('notes')} maxLength={500} rows={2} placeholder="Parade at 10, park behind the depot" /></Field>
    <div className="community-actions">
      <button className="dashboard-chat-cta" type="submit" disabled={busy || !form.title.trim() || !form.startsOn}>{busy ? 'Saving…' : 'Save'} <span>↗</span></button>
      {onCancel && <button type="button" className="community-link" onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}

// --- Place reminders --------------------------------------------------------

/**
 * "Next time I'm at Missy's, remind me to ..." — reminders that wait for a
 * place. Set only by approving Athena's card in conversation (the
 * remind_at_place action); this list is where they are seen and removed.
 * Loads its own list, so the rest of the page doesn't wait on it.
 */
export function PlaceReminders({ onAsk }: { onAsk?: (text: string) => void }) {
  const [reminders, setReminders] = useState<PlaceReminder[] | null>(null);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    dashboardApi.placeReminders().then(r => live && setReminders(r.reminders)).catch(err => live && setError(errorText(err, 'Your place reminders couldn’t load.')));
    // Unknown is not "off": only a definite "off" earns the warning.
    locationApi.status().then(r => live && setSharing(r.pref.enabled)).catch(() => undefined);
    return () => { live = false; };
  }, []);

  async function remove(r: PlaceReminder) {
    if (!window.confirm(`Stop waiting to remind you at ${r.placeName}?`)) return;
    setError(null);
    setBusy(r.uuid);
    try {
      setReminders((await dashboardApi.removePlaceReminder(r.uuid)).reminders);
    } catch (err) {
      setError(errorText(err, 'Could not remove that reminder.'));
    } finally {
      setBusy(null);
    }
  }

  if (!reminders) return error ? <Problem text={error} /> : <p className="dashboard-empty">Loading…</p>;
  const armed = reminders.filter(r => r.status === 'armed');
  const done = reminders.filter(r => r.status === 'done');
  return <>
    <Problem text={error} />
    {sharing === false && armed.length > 0 && <p className="dashboard-notice" role="status">Location sharing is off, so these can’t go off yet. Turn it on in the ⋯ menu → Initiative → location context, and allow Athena location “all the time” on your phone.</p>}
    {!armed.length && <p className="dashboard-empty">Tell me “next time I’m at Missy’s, remind me to…” and I’ll send it to your phone a couple of minutes after you get there.</p>}
    {armed.length > 0 && <ul className="community-list">
      {armed.map(r => <li key={r.uuid}>
        <span className="community-icon" aria-hidden>📍</span>
        <div className="community-body">
          <strong>{r.reminder}</strong>
          <small>{[`at ${r.placeName}`, r.address, r.repeats ? 'every visit' : 'next visit'].filter(Boolean).join(' · ')}</small>
          <div className="community-controls">
            <button type="button" className="community-link community-danger" disabled={busy === r.uuid} onClick={() => void remove(r)}>Remove</button>
          </div>
        </div>
      </li>)}
    </ul>}
    {done.length > 0 && <div className="day-group"><h3>Recently reminded</h3><ul className="dashboard-data-list community-past">
      {done.map(r => <li key={r.uuid}><div className="community-body"><strong>{r.reminder}</strong><small>at {r.placeName}{r.doneAt ? ` · ${new Date(r.doneAt).toLocaleDateString()}` : ''}</small></div></li>)}
    </ul></div>}
    {onAsk && <button type="button" className="dashboard-chat-cta" onClick={() => onAsk('I’d like to set a reminder for when I get somewhere.')}>Ask for one <span>↗</span></button>}
  </>;
}
