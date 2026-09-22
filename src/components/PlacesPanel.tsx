import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Drawer, Label } from './Drawer';
import { MiniMap } from './MiniMap';
import { dashboardApi, type AddressMatch, type WatchPlace } from '../api/dashboard';

/**
 * The places Athena watches for emergencies: home, family members' houses,
 * anywhere a fire or a tree down nearby is something you would want to know.
 *
 * Adding one is an address (looked up server-side against the US Census
 * geocoder) or "use my current location" for anywhere an address will not
 * resolve. A new place is checked straight away, so if something is already
 * happening near it the alert arrives now rather than in two minutes.
 */

const RADII = [1, 2, 3, 5, 10];

const errorText = (e: unknown, fallback: string) => {
  const err = e as Error & { body?: { message?: string } };
  return err?.body?.message || err?.message || fallback;
};

export function PlacesPanel({ onClose }: { onClose: () => void }) {
  const [places, setPlaces] = useState<WatchPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The add form.
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(3);
  const [matches, setMatches] = useState<AddressMatch[] | null>(null);
  const [picked, setPicked] = useState<AddressMatch | null>(null);

  const load = useCallback(() => {
    dashboardApi
      .watchPlaces()
      .then((r) => setPlaces(r.places))
      .catch((e) => setError(errorText(e, 'Could not load your places.')));
  }, []);
  useEffect(load, [load]);

  function resetForm() {
    setName('');
    setAddress('');
    setRadius(3);
    setMatches(null);
    setPicked(null);
  }

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
    if (!('geolocation' in navigator)) {
      setError('This device cannot share its location.');
      return;
    }
    setBusy('here');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const match = {
          label: 'Current location',
          latitude: Math.round(pos.coords.latitude * 1e6) / 1e6,
          longitude: Math.round(pos.coords.longitude * 1e6) / 1e6,
        };
        setMatches([match]);
        setPicked(match);
        setBusy(null);
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? 'Location permission was refused.' : 'Could not get your location.');
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function add() {
    if (!picked) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Give the place a name, like Mom's house.");
      return;
    }
    if (places?.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      setError(`You already have a place called ${cleanName}. Pick another name, or remove that one first.`);
      return;
    }
    setError(null);
    setBusy('add');
    try {
      const r = await dashboardApi.saveWatchPlace({
        name: cleanName,
        latitude: picked.latitude,
        longitude: picked.longitude,
        radiusMiles: radius,
        address: picked.label === 'Current location' ? null : picked.label,
      });
      setPlaces(r.places);
      resetForm();
    } catch (err) {
      setError(errorText(err, 'Could not save that place.'));
    } finally {
      setBusy(null);
    }
  }

  async function update(place: WatchPlace, patch: Partial<Pick<WatchPlace, 'radiusMiles' | 'enabled'>>) {
    setError(null);
    setBusy(place.uuid);
    try {
      const r = await dashboardApi.saveWatchPlace({
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        radiusMiles: patch.radiusMiles ?? place.radiusMiles,
        enabled: patch.enabled ?? place.enabled,
      });
      setPlaces(r.places);
    } catch (err) {
      setError(errorText(err, 'Could not update that place.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(place: WatchPlace) {
    if (!window.confirm(`Stop watching ${place.name}?`)) return;
    setError(null);
    setBusy(place.uuid);
    try {
      const r = await dashboardApi.removeWatchPlace(place.uuid);
      setPlaces(r.places);
    } catch (err) {
      setError(errorText(err, 'Could not remove that place.'));
    } finally {
      setBusy(null);
    }
  }

  const shown = (places || []).filter((p) => p.enabled);

  return (
    <Drawer eyebrow="emergencies nearby" title="Watched places" onClose={onClose}>
      <p className="mb-4 text-sm opacity-70">
        I watch the county 911 dispatch board around each of these. Anything within the ring — a fire, a crash, trees or
        wires down — reaches you in the app, on your phone and by text.
      </p>

      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error}
        </p>
      )}

      {shown.length > 0 && (
        <MiniMap
          places={shown.map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude, radiusMiles: p.radiusMiles }))}
          height={200}
          className="mb-5"
        />
      )}

      <section className="mb-8">
        <Label>watching</Label>
        {places === null ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : places.length === 0 ? (
          <p className="text-sm opacity-60">Nothing yet — add your home below.</p>
        ) : (
          <ul className="space-y-2">
            {places.map((p) => (
              <li key={p.uuid} className={`rounded border border-emerald-500/15 bg-white/[0.03] p-3 ${p.enabled ? '' : 'opacity-50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="mt-0.5 truncate text-xs opacity-60">{p.address || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === p.uuid}
                    onClick={() => void remove(p)}
                    className="shrink-0 rounded border border-red-400/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    <span className="opacity-60">within</span>
                    <select
                      value={p.radiusMiles}
                      disabled={busy === p.uuid}
                      onChange={(e) => void update(p, { radiusMiles: Number(e.target.value) })}
                      className="rounded border border-emerald-500/20 bg-white/5 px-1 py-0.5"
                    >
                      {[...new Set([...RADII, p.radiusMiles])].sort((a, b) => a - b).map((r) => (
                        <option key={r} value={r}>
                          {r} mi
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      disabled={busy === p.uuid}
                      onChange={() => void update(p, { enabled: !p.enabled })}
                      className="accent-emerald-500"
                    />
                    <span className="opacity-70">{p.enabled ? 'watching' : 'paused'}</span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Label>add a place</Label>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Name — e.g. Mom's house"
            className="h-9 w-full rounded border border-emerald-500/20 bg-white/5 px-2 text-sm outline-none"
          />
          <form onSubmit={find} className="flex gap-2">
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setMatches(null);
                setPicked(null);
              }}
              placeholder="Street address, town, state"
              className="h-9 min-w-0 flex-1 rounded border border-emerald-500/20 bg-white/5 px-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={busy === 'find' || address.trim().length < 5}
              className="shrink-0 rounded border border-emerald-500/30 px-3 text-xs disabled:opacity-40"
            >
              {busy === 'find' ? 'Finding…' : 'Find'}
            </button>
          </form>
          <button type="button" onClick={here} disabled={busy === 'here'} className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-40">
            {busy === 'here' ? 'Getting your location…' : 'or use my current location'}
          </button>

          {matches && matches.length > 1 && (
            <ul className="space-y-1">
              {matches.map((m) => (
                <li key={`${m.latitude},${m.longitude}`}>
                  <button
                    type="button"
                    onClick={() => setPicked(m)}
                    className={`w-full rounded border px-2 py-1.5 text-left text-xs ${picked === m ? 'border-emerald-400 bg-emerald-500/10' : 'border-emerald-500/15'}`}
                  >
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked && (
            <div className="space-y-3 rounded border border-emerald-500/20 p-3">
              <p className="text-xs opacity-80">{picked.label}</p>
              <MiniMap places={[{ name: name.trim() || 'New place', latitude: picked.latitude, longitude: picked.longitude, radiusMiles: radius }]} height={160} />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="opacity-60">Tell me about anything within</span>
                  <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="rounded border border-emerald-500/20 bg-white/5 px-1 py-0.5">
                    {RADII.map((r) => (
                      <option key={r} value={r}>
                        {r} mi
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void add()}
                  disabled={busy === 'add'}
                  className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
                >
                  {busy === 'add' ? 'Saving…' : 'Watch this place'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </Drawer>
  );
}
