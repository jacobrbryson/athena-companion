import { useCallback, useEffect, useState } from 'react';
import { degrees, setting, thermostatTitle, thermostatsApi, type Thermostat, type ThermostatList } from '../api/propertyThermostats';
import { DrawerButton } from './ActionControls';
import './propertyIssues.css';
import './propertyVehicles.css';
import './propertyThermostats.css';

/**
 * Thermostats on the Property Overview: each shared Google Nest thermostat,
 * whether it is online (and since when it isn't), the temperature inside and
 * what it is set to. No controls here: a change is asked of Athena in
 * conversation and lands as an approval card (core_api set_thermostat). The offline alert itself is an initiative
 * trigger (core_api nest_offline); this panel only shows the same state.
 */
export function useThermostats(enabled: boolean) {
  const [data, setData] = useState<ThermostatList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    thermostatsApi.all()
      .then(d => setData(d))
      .catch(e => setError((e as Error).message || 'Thermostats are unavailable right now.'))
      .finally(() => setLoading(false));
  }, []);
  // Loaded when first shown, not with the dashboard; kept while switching tabs.
  const [shown, setShown] = useState(false);
  useEffect(() => { if (enabled && !shown) { setShown(true); load(); } }, [enabled, shown, load]);
  // "Use for sleep" changes which device is marked; the list comes back whole.
  const setSleep = useCallback(async (device: string | null) => {
    const { devices } = await thermostatsApi.setSleepDevice(device);
    setData(prev => prev && { ...prev, devices });
  }, []);
  return { data, loading, error, retry: load, setSleep };
}
export type ThermostatsState = ReturnType<typeof useThermostats>;

function since(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ThermostatCard({ t, onSleep }: { t: Thermostat; onSleep: (device: string | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [sleepError, setSleepError] = useState('');
  const toggleSleep = async () => {
    setBusy(true);
    setSleepError('');
    try { await onSleep(t.sleepDevice ? null : t.name); } catch (e) { setSleepError((e as Error).message || 'Couldn’t save that.'); } finally { setBusy(false); }
  };
  const r = t.readings || {};
  const silent = !!t.notReporting;
  const temp = silent ? null : degrees(r.temperatureC, r.scale);
  const offline = t.connectivity === 'OFFLINE';
  const target = setting(r);
  const detail = [
    Number.isFinite(r.humidityPercent) ? `${r.humidityPercent}% humidity` : null,
    target,
    r.hvac && r.hvac !== 'OFF' && !offline ? (r.hvac === 'HEATING' ? 'Heating now' : r.hvac === 'COOLING' ? 'Cooling now' : null) : null,
  ].filter(Boolean).join(' · ');
  return <li className={`pt-card${offline ? ' pt-offline' : ''}`}>
    <div className="pt-temp" aria-label={temp ? `${temp} inside` : 'No temperature'}>{temp || '—'}</div>
    <div className="pv-card-text">
      <strong>{thermostatTitle(t)}</strong>
      <small>{detail || 'No readings yet'}</small>
      <span className={`pv-chip ${offline ? 'pv-overdue' : t.connectivity === 'ONLINE' ? 'pv-later' : 'pv-soon'}`}>
        {silent ? `Not reporting since ${since(t.offlineSince!)}` : offline ? `Offline since ${since(t.offlineSince!)}` : t.connectivity === 'ONLINE' ? 'Online' : 'Status unknown'}
      </span>
      {silent && <small className="pt-note">Google lists it as online, but it’s sending no readings</small>}
      {offline && !silent && temp && <small className="pt-note">Last reading before it went offline</small>}
      <button type="button" className="pt-link pt-sleep" aria-pressed={!!t.sleepDevice} onClick={toggleSleep} disabled={busy}
        title="The thermostat I compare with your WHOOP sleep">
        {t.sleepDevice ? '✓ Used for sleep' : 'Use for sleep'}
      </button>
      {sleepError && <small className="pt-note" role="alert">{sleepError}</small>}
    </div>
  </li>;
}

export function ThermostatList({ state, onConnect, connecting }: { state: ThermostatsState; onConnect: () => void; connecting?: boolean }) {
  const { data, loading, error, retry, setSleep } = state;
  const connect = (label: string) => <div className="pi-list-foot"><DrawerButton primary onClick={onConnect} disabled={connecting}>{connecting ? 'Opening Google…' : label}</DrawerButton></div>;
  if (loading && !data) return <p className="pi-muted">Loading thermostats…</p>;
  if (error) return <p role="alert">{error} <button onClick={retry}>Retry</button></p>;
  if (!data || data.status === 'not_connected') return <div className="pt-list">
    <p className="pi-muted">Link Google Nest and I’ll show each thermostat here — whether it’s online, the temperature inside and what it’s set to — and tell you when one goes offline. Google lets you pick which thermostats I see. I only change one when you approve it.</p>
    {connect('Connect Google Nest')}
  </div>;
  if (data.status === 'needs_reauth') return <div className="pt-list">
    <p className="pi-muted">Google Nest needs reconnecting before I can read your thermostats again.</p>
    {connect('Reconnect Google Nest')}
  </div>;
  if (!data.devices.length) return <div className="pt-list">
    <p className="pi-muted">Google Nest is linked, but no thermostats are shared with me. Connect again and tick them on Google’s Nest screen.</p>
    {connect('Choose thermostats')}
  </div>;
  return <div className="pt-list">
    {data.stale && <p className="pi-muted" role="status">Google couldn’t be reached just now — this is the last state I recorded.</p>}
    <ul>{data.devices.map(t => <ThermostatCard key={t.name} t={t} onSleep={setSleep} />)}</ul>
    <p className="pi-muted pt-foot">Ask me to change one and I’ll show you a card to approve. With Initiative on, I alert you when one goes offline. <button type="button" className="pt-link" onClick={retry} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></p>
  </div>;
}
