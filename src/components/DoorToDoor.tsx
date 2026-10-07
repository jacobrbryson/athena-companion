import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardApi, type DoorMark, type DoorRound, type DoorRoundSummary, type DoorStatus, type WatchPlace } from '../api/dashboard';
import { STATUS_LABEL, afterSend, progress, withMarks } from './doorMarks';

/** Browser storage is a convenience here: the walk must still work when it throws. */
const store = {
  get<T>(key: string, fallback: T): T { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } },
  set(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or blocked */ } },
  del(key: string) { try { localStorage.removeItem(key); } catch { /* blocked */ } },
};
const ROUNDS_KEY = 'athena.doors.rounds';
const roundKey = (uuid: string) => `athena.doors.round.${uuid}`;
const queueKey = (uuid: string) => `athena.doors.queue.${uuid}`;

const errorText = (e: unknown, fallback: string) => (e as Error)?.message || fallback;
const STATUS_ORDER: DoorStatus[] = ['safe', 'no_answer', 'needs_help', 'skipped'];

/**
 * Door-to-door safety check. A street is listed ahead of time (from the map
 * and from the person's own neighbours), then in an emergency each house is
 * marked safe / no answer / needs help. Marks land on the phone first and are
 * sent when there is signal, so a dead network never costs a mark. Nothing
 * here names or looks up a resident; the notes are the person's own.
 */
export function DoorToDoor({ places }: { places: WatchPlace[] }) {
  const [rounds, setRounds] = useState<DoorRoundSummary[]>(() => store.get(ROUNDS_KEY, []));
  const [loaded, setLoaded] = useState(false);
  const [openUuid, setOpenUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    try { const { rounds: next } = await dashboardApi.doorRounds(); setRounds(next); store.set(ROUNDS_KEY, next); setError(null); }
    catch (e) { if (!rounds.length) setError(errorText(e, 'Your street checks couldn’t load.')); }
    finally { setLoaded(true); }
  }, [rounds.length]);
  useEffect(() => { void refreshList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (openUuid) return <Walk uuid={openUuid} onBack={() => { setOpenUuid(null); void refreshList(); }} onGone={next => { setRounds(next); store.set(ROUNDS_KEY, next); setOpenUuid(null); }} />;
  return <>
    <p className="community-blurb">If something happens on your street, this is how you make sure everyone is safe. List your street now, while you have signal: I find the houses from the map and add the neighbors you’ve saved. Then walk it door by door and mark each one. Marks save on your phone first, so a dead network never loses one.</p>
    {error && <small className="community-warn">{error}</small>}
    {loaded && !rounds.length && !error && <p className="dashboard-empty">No streets listed yet.</p>}
    {rounds.length > 0 && <ul className="community-list">{rounds.map(r => <li key={r.uuid}>
      <span className="community-icon" aria-hidden>🚪</span>
      <div className="community-body">
        <strong>{r.street}</strong>
        <small>{r.checked} of {r.total} checked{r.needsHelp ? ` · ${r.needsHelp} need help` : ''}{r.closedAt ? ' · finished' : ''}</small>
        <div className="community-controls"><button type="button" className="community-link" onClick={() => setOpenUuid(r.uuid)}>{r.closedAt ? 'Review' : r.checked ? 'Continue' : 'Start walking'}</button></div>
      </div>
    </li>)}</ul>}
    <ListStreet places={places} onListed={round => { store.set(roundKey(round.uuid), round); setOpenUuid(round.uuid); }} />
  </>;
}

function ListStreet({ places, onListed }: { places: WatchPlace[]; onListed: (round: DoorRound) => void }) {
  const [open, setOpen] = useState(false);
  const [placeUuid, setPlaceUuid] = useState('');
  const [street, setStreet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streetOf = (p?: WatchPlace) => (p?.address || '').split(',')[0].replace(/^\d+[a-z]?\s+/i, '').trim();
  const pick = (uuid: string) => { setPlaceUuid(uuid); setStreet(streetOf(places.find(p => p.uuid === uuid))); };
  async function go() {
    setBusy(true); setError(null);
    try { onListed((await dashboardApi.startDoorRound({ placeUuid, street: street.trim() || undefined })).round); }
    catch (e) { setError(errorText(e, 'I couldn’t list that street.')); }
    finally { setBusy(false); }
  }
  if (!open) return <button type="button" className="community-link" onClick={() => { setOpen(true); const home = places.find(p => p.address) || places[0]; if (home) pick(home.uuid); }}>List a street</button>;
  return <div className="community-add">
    <label className="community-field"><span>Near which place</span>
      <select value={placeUuid} onChange={e => pick(e.target.value)}>{places.map(p => <option key={p.uuid} value={p.uuid}>{p.name}{p.address ? ` — ${p.address.split(',')[0]}` : ''}</option>)}</select>
    </label>
    <label className="community-field"><span>Street</span><input value={street} maxLength={120} onChange={e => setStreet(e.target.value)} placeholder="Rushing Water Lane" /></label>
    <small className="community-hint">Only the street’s name and a point about a kilometre wide go to OpenStreetMap, a public map. No one is named.</small>
    {error && <small className="community-warn">{error}</small>}
    <div className="community-actions">
      <button type="button" className="community-link" disabled={busy || !placeUuid || street.trim().length < 3} onClick={() => void go()}>{busy ? 'Listing…' : 'List this street'}</button>
      <button type="button" className="community-link" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  </div>;
}

function Walk({ uuid, onBack, onGone }: { uuid: string; onBack: () => void; onGone: (rounds: DoorRoundSummary[]) => void }) {
  const [server, setServer] = useState<DoorRound | null>(() => store.get<DoorRound | null>(roundKey(uuid), null));
  const [queue, setQueue] = useState<DoorMark[]>(() => store.get<DoorMark[]>(queueKey(uuid), []));
  const [openAddr, setOpenAddr] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queueRef = useRef(queue);
  const flushing = useRef(false);
  const setQ = (next: DoorMark[]) => { queueRef.current = next; setQueue(next); store.set(queueKey(uuid), next); };

  const adopt = useCallback((round: DoorRound) => { setServer(round); store.set(roundKey(uuid), round); }, [uuid]);

  /** Send what is waiting. Nothing is dropped unless the server took it. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const sending = queueRef.current;
      if (sending.length) { const { round } = await dashboardApi.syncDoors(uuid, sending); setQ(afterSend(queueRef.current, sending)); adopt(round); }
      else { adopt((await dashboardApi.doorRound(uuid)).round); }
      setOffline(false); setError(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // A refusal (not a dead network) will never succeed on retry; say so, keep the marks.
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) setError(errorText(e, 'That didn’t save.'));
      setOffline(true);
    } finally { flushing.current = false; }
  }, [uuid, adopt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void flush();
    const again = () => void flush();
    window.addEventListener('online', again);
    const timer = window.setInterval(() => { if (!document.hidden) void flush(); }, 15_000);
    return () => { window.removeEventListener('online', again); window.clearInterval(timer); };
  }, [flush]);

  function mark(address: string, status: DoorStatus, note: string | null) {
    setQ([...queueRef.current, { address, status, note: note?.trim() || null, at: new Date().toISOString() }]);
    setOpenAddr(null); setNoteDraft('');
    void flush();
  }

  async function addHouse() {
    try { adopt((await dashboardApi.addDoor(uuid, adding.trim())).round); setAdding(''); setError(null); }
    catch (e) { setError(errorText(e, 'I couldn’t add that house.')); }
  }

  if (!server) return <><button type="button" className="community-link" onClick={onBack}>← Back</button><p className="dashboard-empty">{offline ? 'This street isn’t on your phone yet, and there’s no signal to fetch it. List streets ahead of time.' : 'Loading…'}</p></>;

  const round = withMarks(server, queue);
  const { total, checked, left, needsHelp } = progress(round);
  const done = round.closedAt !== null;
  return <div className="door-walk">
    <div className="door-head">
      <button type="button" className="community-link" onClick={onBack}>← Streets</button>
      <strong>{round.street}</strong>
      <small>{checked} of {total} checked{left ? ` · ${left} to go` : ' · everyone accounted for'}</small>
    </div>
    <div className="progress-track" role="img" aria-label={`${checked} of ${total} houses checked`}><span style={{ width: `${total ? (checked / total) * 100 : 0}%` }} /></div>
    {queue.length > 0 && <small className="community-hint door-sync">{offline ? `No signal — ${queue.length} mark${queue.length === 1 ? '' : 's'} saved on this phone and waiting to send.` : 'Sending…'}</small>}
    {needsHelp.length > 0 && <div className="door-alert" role="alert">
      <strong>Needs help: {needsHelp.map(d => d.address.split(/\s+/)[0]).join(', ')}</strong>
      <a className="door-call" href="tel:911">Call 911</a>
    </div>}
    {error && <small className="community-warn">{error}</small>}
    <ul className="door-list">{round.doors.map(d => <li key={d.address} className={`door door-${d.status}`}>
      <button type="button" className="door-row" onClick={() => { setOpenAddr(openAddr === d.address ? null : d.address); setNoteDraft(d.note || ''); }}>
        <span className="door-address">{d.address}</span>
        <span className="door-chip">{STATUS_LABEL[d.status]}</span>
      </button>
      {d.household && <small className="door-household">{[d.household.name, d.household.contact, d.household.notes].filter(Boolean).join(' · ')}</small>}
      {d.note && openAddr !== d.address && <small className="door-note">{d.note}</small>}
      {openAddr === d.address && <div className="door-actions">
        <div className="door-buttons">{STATUS_ORDER.map(s => <button key={s} type="button" className={`door-btn door-btn-${s}`} onClick={() => mark(d.address, s, noteDraft)}>{STATUS_LABEL[s]}</button>)}</div>
        <textarea value={noteDraft} maxLength={500} rows={2} onChange={e => setNoteDraft(e.target.value)} placeholder="A note — who was home, what they need" />
        {d.status !== 'todo' && <button type="button" className="community-link" onClick={() => mark(d.address, 'todo', null)}>Clear</button>}
        {d.status === 'needs_help' && <a className="door-call" href="tel:911">Call 911</a>}
      </div>}
    </li>)}</ul>
    {!round.doors.length && <p className="dashboard-empty">The map had no houses for this street. Add them below as you walk.</p>}
    <div className="community-inline">
      <input value={adding} maxLength={160} onChange={e => setAdding(e.target.value)} placeholder="Add a house the map missed — 152 Rushing Water Lane" />
      <button type="button" className="community-link" disabled={adding.trim().length < 4} onClick={() => void addHouse()}>Add</button>
    </div>
    <div className="community-controls">
      <button type="button" className="community-link" disabled={queue.length > 0} onClick={() => void dashboardApi.closeDoorRound(uuid, !done).then(r => adopt(r.round)).catch(e => setError(errorText(e, 'That didn’t save.')))}>{done ? 'Reopen' : 'Finish this street'}</button>
      {!confirmDelete
        ? <button type="button" className="community-link community-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        : <button type="button" className="community-link community-danger" onClick={() => void dashboardApi.removeDoorRound(uuid).then(r => { store.del(roundKey(uuid)); store.del(queueKey(uuid)); onGone(r.rounds); }).catch(e => setError(errorText(e, 'That didn’t delete.')))}>Yes, delete this street</button>}
    </div>
  </div>;
}
