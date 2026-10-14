import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { dashboardApi, type Place } from '../api/dashboard';

/**
 * The places list behind the Right Now card: places worth going to. (Projects
 * moved to the Projects and Home pages, ./Projects.tsx, on 2026-10-13.)
 *
 * The list is the person's own. Athena reads a place's page on her own rhythm and
 * reports what it says — there is no control here for how often, for the same
 * reason the news panel has none. What she never does is add, finish or remove
 * anything on the list: that is this panel, or an action she proposes and
 * someone approves.
 */

const ago = (at: string | null) => {
  if (!at) return 'not yet';
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

const field = 'w-full rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';
// Inside a flex row, w-full would let one input claim the whole line and
// squeeze the other to nothing.
const rowField = 'min-w-0 flex-1 rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';

export function PlansPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [attempt, setAttempt] = useState(0);

  const [place, setPlace] = useState({ url: '', label: '', activity: '', distanceMi: '', coords: '' });

  useEffect(() => {
    let active = true;
    setError('');
    dashboardApi.places()
      .then(p => { if (!active) return; setPlaces(p.places); setLoaded(true); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [attempt]);

  const reload = () => setAttempt(a => a + 1);
  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key); setError(''); setNote('');
    try {
      const message = await work();
      if (message) setNote(message);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  /**
   * "35.6516, -80.9337" — what you get from right-clicking a map. Coordinates
   * are optional and only ever used to ask the forecast about that spot; a
   * place without them still works, it just never gets a weather line.
   */
  const parseCoords = (value: string) => {
    const [lat, lon] = value.split(',').map(part => Number(part.trim()));
    return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : {};
  };

  const addPlace = () => run('add-place', async () => {
    await dashboardApi.addPlace({
      url: place.url.trim(),
      label: place.label.trim() || undefined,
      activity: place.activity.trim(),
      distanceMi: place.distanceMi.trim() ? Number(place.distanceMi) : null,
      ...parseCoords(place.coords),
    });
    setPlace({ url: '', label: '', activity: '', distanceMi: '', coords: '' });
    reload();
    return 'Added. I’ve read the page once already.';
  });

  const openLine = (p: Place) => {
    if (p.now.openNow === true) return `Open${p.now.closesAt ? ` until ${p.now.closesAt}` : ''}`;
    if (p.now.openNow === false) return p.now.why;
    return 'I can’t tell from the page whether it’s open';
  };

  return <Drawer eyebrow="YOUR DAY" title="Places" onClose={onClose}>
    <p className="mb-4 text-sm text-slate-300">
      What I weigh when I tell you what to do with a free afternoon. I read a place’s page on my own
      rhythm and report what it says; I never add or finish anything here myself.
      Projects live on the Projects and Home pages.
    </p>

    {error && <p role="alert" className="mb-4 text-sm text-amber-200">{error} {!loaded && <button onClick={reload} className="underline">Retry</button>}</p>}
    {note && <p role="status" className="mb-4 text-sm text-cyan-200">{note}</p>}
    {!loaded && !error && <p className="text-sm text-slate-400">Loading your lists…</p>}

    <>
      <form onSubmit={e => { e.preventDefault(); void addPlace(); }} className="mb-6 flex flex-col gap-2">
        <label htmlFor="place-url" className="text-sm">Add a place</label>
        <input id="place-url" className={field} value={place.url} onChange={e => setPlace({ ...place, url: e.target.value })}
          placeholder="ncparks.gov/state-parks/lake-norman-state-park" maxLength={500} />
        <input className={field} value={place.label} onChange={e => setPlace({ ...place, label: e.target.value })}
          placeholder="What you call it (optional)" maxLength={120} />
        <div className="flex gap-2">
          <input className={rowField} value={place.activity} onChange={e => setPlace({ ...place, activity: e.target.value })}
            placeholder="What it’s for — mountain biking" maxLength={64} />
          <input className={`${rowField} max-w-[6rem] shrink-0`} value={place.distanceMi} onChange={e => setPlace({ ...place, distanceMi: e.target.value })}
            placeholder="miles" inputMode="decimal" />
        </div>
        <input className={field} value={place.coords} onChange={e => setPlace({ ...place, coords: e.target.value })}
          placeholder="Map coordinates (optional) — 35.6516, -80.9337" maxLength={48} />
        <p className="text-xs text-slate-400">
          The activity is how I line a place up with what you actually do — say it the way you’d say it out loud.
          Coordinates are only used to check the forecast for that spot; without them I’ll stay quiet about the weather.
        </p>
        <button className="dashboard-chat-cta self-start" disabled={!loaded || !!busy || !place.url.trim() || !place.activity.trim()}>
          {busy === 'add-place' ? 'Reading the page…' : 'Add this place'}
        </button>
      </form>

      <ul className="flex flex-col gap-3">
        {places.map(p => <li key={p.uuid} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{p.label}</p>
              <p className="truncate text-xs text-slate-500">{p.activity}{p.distanceMi != null && ` · ${p.distanceMi} mi`}</p>
            </div>
            <button onClick={() => void run(p.uuid, async () => { await dashboardApi.removePlace(p.uuid); reload(); })}
              disabled={!!busy} className="shrink-0 text-xs text-slate-400 underline hover:text-amber-200">Remove</button>
          </div>
          <p className={`mt-2 text-xs ${p.now.openNow === true ? 'text-cyan-200' : p.now.openNow === false ? 'text-slate-300' : 'text-amber-200'}`}>
            {openLine(p)}
          </p>
          {p.now.todaysHours.length > 0 && <p className="mt-1 text-xs text-slate-500">Today: {p.now.todaysHours.join(', ')}</p>}
          {p.weatherDependent && <p className="mt-1 text-xs text-slate-500">Hours here depend on the weather.</p>}
          <p className="mt-1 text-xs text-slate-500">
            Read {ago(p.lastCheckedAt)}
            {' · '}
            <button className="underline" disabled={!!busy}
              onClick={() => void run(p.uuid, async () => { await dashboardApi.checkPlace(p.uuid); reload(); return 'Read it again just now.'; })}>
              {busy === p.uuid ? 'checking…' : 'check now'}
            </button>
          </p>
          {p.lastError && <p className="mt-1 text-xs text-amber-200">Last time: {p.lastError}</p>}
        </li>)}
        {loaded && !places.length && <p className="text-sm text-slate-400">No places yet. Add the park, the pool, the trailhead — anywhere whose hours decide your afternoon.</p>}
      </ul>
    </>
  </Drawer>;
}
