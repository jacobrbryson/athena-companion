import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  propertyGuardianApi, type GuardianConfig, type GuardianIncident, type GuardianOverview, type GuardianProtocol, type GuardianRun, type GuardianScenario, type GuardianSubject,
} from '../api/propertyGuardian';
import type { SecurityDevice } from '../api/propertySecurity';
import { Icon, useMediaUrl } from './securityShared';

/**
 * Property → Security → Guardian: the nightly sweep, the storm umbrella watch,
 * open incidents and their follow-through, and the settings for both.
 * Reading this page never takes a picture; only "Run sweep now" and
 * "Recheck" wake a camera, and "Test" never sends an alert.
 */
const clock = (v: string | null) => v ? new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—';
const stamp = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toDateString() === new Date().toDateString() ? `${clock(v)} today` : `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${clock(v)}`;
};
const STATUS = {
  secure: { label: 'Secure', note: 'Everything checked was verified safe.', cls: 'is-on' },
  attention: { label: 'Needs attention', note: 'Something is open that should be closed.', cls: 'is-alert' },
  unverified: { label: "Couldn't verify", note: "Something couldn't be checked — unknown is not safe.", cls: 'is-warn' },
  waiting: { label: 'Waiting for the first sweep', note: 'Nothing has been checked yet.', cls: 'is-off' },
  off: { label: 'Off', note: 'No protocol is switched on.', cls: 'is-off' },
} as const;
const CONDITION: Record<string, string> = { open: 'appears to be open', up: 'appears to be up', unknown: "couldn't be verified", offline: 'camera not responding' };
const REASON: Record<string, string> = {
  offline: "camera isn't responding", device_unavailable: "camera isn't responding", bridge_unreachable: "bridge isn't reachable", station_busy: 'base station was busy',
  stale: 'picture too old', not_visible: 'not in view', low_confidence: 'picture not clear enough', conflict: 'camera and sensor disagree', vision_unavailable: "couldn't analyse the picture",
  dispatch_unavailable: "sweep didn't run", no_camera: 'no camera assigned', capture_failed: 'no picture returned', not_configured: 'bridge not set up',
};
const RESULT_WORD: Record<string, string> = { closed: 'Closed', open: 'Open', down: 'Down', up: 'Up', unknown: 'Unknown', offline: 'Offline', not_applicable: 'Not needed' };
const TRIGGER: Record<string, string> = { schedule: 'Nightly sweep', weather: 'Weather', recheck: 'Recheck', manual: 'Run by hand' };
const NOTE_STATUS: Record<string, string> = { sent: 'sent', held: 'held for quiet hours', failed: 'failed', simulated: 'test only', in_app: 'in the app only', pending: 'sending', superseded: 'not needed' };

function Evidence({ id, label }: { id: string; label: string }) {
  const src = useMediaUrl(id);
  return <span className="ps-guard-evidence">{src ? <img src={src} alt={label} /> : <span className="ps-thumb-ph" />}</span>;
}

function IncidentRow({ incident, names, busy, onAct }: { incident: GuardianIncident; names: Map<number, string>; busy: boolean; onAct: (action: 'recheck' | 'acknowledge' | 'dismiss' | 'assign', value?: string | number | null) => void }) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const active = ['open', 'notified', 'acknowledged'].includes(incident.state);
  const reached = incident.notifications.filter(n => n.kind !== 'resolved');
  const who = (id: number) => names.get(id) || `Adult ${id}`;
  return <li className={`ps-guard-incident${incident.severity === 'urgent' && active ? ' is-urgent' : ''}`}>
    <span className={`ps-event-icon ${incident.condition === 'unknown' || incident.condition === 'offline' ? 'is-warn' : 'is-alert'}`}><Icon name={incident.check === 'garage_door' ? 'garage' : 'umbrella'} /></span>
    <div className="ps-guard-incident-body">
      <strong>{incident.subjectName} {CONDITION[incident.condition] || incident.condition}</strong>
      <small>
        {incident.reason && REASON[incident.reason] ? `${REASON[incident.reason]} · ` : ''}
        {incident.confidence != null && incident.condition !== 'unknown' ? `${Math.round(incident.confidence * 100)}% sure · ` : ''}
        first seen {stamp(incident.firstDetectedAt)} · last checked {stamp(incident.lastVerifiedAt)}{incident.camera ? ` on ${incident.camera}` : ''}
      </small>
      {incident.weather?.reasons?.length ? <small>Weather: {incident.weather.reasons.map(r => r.text).join(', ')}</small> : null}
      <small>
        {active ? <>
          <em className={`ps-tag ${incident.state === 'acknowledged' ? 'is-ok' : ''}`}>{incident.state === 'acknowledged' ? `Acknowledged by ${who(incident.acknowledgedBy || 0)}` : incident.severity === 'urgent' ? 'Urgent' : 'Advisory'}</em>
          {incident.nextRecheckAt ? ` Rechecking ${stamp(incident.nextRecheckAt)}` : incident.rechecks ? ' Automatic rechecks finished — use Recheck' : ''}
        </> : <em className="ps-tag is-ok">{incident.state === 'resolved' ? `Verified fixed ${stamp(incident.resolvedAt)}` : incident.state === 'dismissed' ? `Dismissed: ${incident.dismissReason}` : 'Lapsed — the weather passed'}</em>}
      </small>
      {reached.length > 0 && <small className="ps-guard-reach">Told: {reached.map(n => `${who(n.profileId)} (${n.kind === 'escalation' ? 'reminder, ' : ''}${NOTE_STATUS[n.status] || n.status}${n.status === 'failed' ? ` ×${n.attempts}` : ''})`).join(' · ')}</small>}
      {active && <div className="ps-guard-actions">
        <button className="ps-btn" disabled={busy} onClick={() => onAct('recheck')}><Icon name="refresh" />Recheck</button>
        {incident.state !== 'acknowledged' && <button className="ps-btn" disabled={busy} onClick={() => onAct('acknowledge')}><Icon name="eye" />Acknowledge</button>}
        <label className="ps-field ps-field-inline"><span>Who's on it</span>
          <select value={incident.assignedTo ?? ''} disabled={busy} onChange={e => onAct('assign', e.target.value ? Number(e.target.value) : null)}>
            <option value="">No one yet</option>
            {[...names].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        {!dismissing ? <button className="ps-btn" disabled={busy} onClick={() => setDismissing(true)}><Icon name="close" />Dismiss</button>
          : <form className="ps-guard-dismiss" onSubmit={(e: FormEvent) => { e.preventDefault(); if (reason.trim().length >= 3) onAct('dismiss', reason.trim()); }}>
            <input aria-label="Why dismiss it" placeholder="Why? e.g. open on purpose for the painters" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} autoFocus />
            <button className="ps-btn" disabled={busy || reason.trim().length < 3} type="submit">Dismiss</button>
            <button className="ps-btn" type="button" onClick={() => setDismissing(false)}>Cancel</button>
          </form>}
      </div>}
    </div>
    {incident.evidenceMediaId && <Evidence id={incident.evidenceMediaId} label={`${incident.subjectName} at ${stamp(incident.observedAt)}`} />}
  </li>;
}

function RunRow({ run, subjectNames }: { run: GuardianRun; subjectNames: Map<string, string> }) {
  const looked = run.results.filter(r => r.status !== 'not_applicable');
  const named = (r: GuardianRun['results'][number]) => subjectNames.get(`${r.check}:${r.subject}`) || r.subject;
  return <li>
    <span className={`ps-state ${run.state === 'safe' ? 'is-on' : run.state === 'scheduled' ? 'is-off' : 'is-warn'}`} />
    <div><strong>{TRIGGER[run.trigger] || run.trigger}{run.simulated ? ' · test' : ''}</strong>
      <small>{run.state === 'scheduled' ? `Booked for ${stamp(run.scheduledFor)}` : run.missed ? `Missed — ${REASON[run.reason || ''] || 'it never ran'}` : looked.length ? looked.map(r => `${named(r)}: ${RESULT_WORD[r.status] || r.status}${r.reason && REASON[r.reason] ? ` (${REASON[r.reason]})` : ''}`).join(' · ') : 'Nothing needed checking'}</small></div>
    <time>{stamp(run.finishedAt || run.scheduledFor)}</time>
  </li>;
}

/** Garage doors / the umbrella: name, which camera, and where in its view. */
function SubjectEditor({ subject, cameras, onChange, onRemove }: { subject: GuardianSubject; cameras: SecurityDevice[]; onChange: (s: GuardianSubject) => void; onRemove?: () => void }) {
  return <div className="ps-form ps-guard-subject">
    <label className="ps-field"><span>Name</span><input value={subject.name} maxLength={60} onChange={e => onChange({ ...subject, name: e.target.value })} /></label>
    <label className="ps-field"><span>Camera</span><select value={subject.serial || ''} onChange={e => onChange({ ...subject, serial: e.target.value || null })}>
      <option value="">Choose a camera…</option>{cameras.map(c => <option key={c.serial} value={c.serial}>{c.name || c.serial}</option>)}
    </select></label>
    <label className="ps-field ps-field-grow"><span>Where it is in the picture</span><input value={subject.region || ''} maxLength={200} placeholder="e.g. the double door on the left" onChange={e => onChange({ ...subject, region: e.target.value || null })} /></label>
    {onRemove && <button className="ps-btn ps-btn-square" type="button" aria-label={`Remove ${subject.name}`} onClick={onRemove}><Icon name="trash" /></button>}
  </div>;
}

function Recipients({ config, recipients, onChange }: { config: GuardianConfig; recipients: { id: number; name: string }[]; onChange: (ids: string[]) => void }) {
  const all = config.recipients.length === 0;
  const chosen = new Set(all ? recipients.map(r => String(r.id)) : config.recipients);
  return <fieldset className="ps-teach-choice"><legend>Who is told</legend>
    {recipients.map(r => <label key={r.id} className="ps-radio"><input type="checkbox" checked={chosen.has(String(r.id))} onChange={e => {
      const next = new Set(chosen);
      if (e.target.checked) next.add(String(r.id)); else next.delete(String(r.id));
      onChange(next.size === recipients.length ? [] : [...next]);
    }} />{r.name}</label>)}
    <small>Only adults authorized for household security can be chosen. Everyone, when all are ticked.</small>
  </fieldset>;
}

function ProtocolSettings({ protocol, cameras, recipients, onSave }: { protocol: GuardianProtocol; cameras: SecurityDevice[]; recipients: { id: number; name: string }[]; onSave: (enabled: boolean, config: GuardianConfig) => Promise<void> }) {
  const [enabled, setEnabled] = useState(protocol.enabled);
  const [config, setConfig] = useState<GuardianConfig>(protocol.config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setEnabled(protocol.enabled); setConfig(protocol.config); }, [protocol]);
  const set = (patch: Partial<GuardianConfig>) => { setSaved(false); setConfig(c => ({ ...c, ...patch })); };
  const observeOnly = config.autonomy['notify.household'] === 0;
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await onSave(enabled, config); setSaved(true); } catch (err) { setError((err as Error).message || 'Saving didn’t work.'); } finally { setBusy(false); }
  }
  const doors = config.garageDoors || [];
  return <form className="ps-guard-settings" onSubmit={e => void save(e)}>
    <header><label className="ps-radio"><input type="checkbox" checked={enabled} onChange={e => { setSaved(false); setEnabled(e.target.checked); }} /><strong>{protocol.label}</strong></label><small>{protocol.describe}</small></header>
    {protocol.id === 'nightly_sweep' && <>
      <div className="ps-form">
        <label className="ps-field"><span>Lights-out time</span><input type="time" value={config.schedule?.time || '22:00'} onChange={e => set({ schedule: { time: e.target.value, timeZone: config.schedule?.timeZone || 'America/New_York' } })} /></label>
        <label className="ps-field"><span>Time zone</span><input value={config.schedule?.timeZone || 'America/New_York'} onChange={e => set({ schedule: { time: config.schedule?.time || '22:00', timeZone: e.target.value } })} /></label>
        <label className="ps-radio"><input type="checkbox" checked={config.includeUmbrella !== false} onChange={e => set({ includeUmbrella: e.target.checked })} />Check the umbrella too when the weather calls for it</label>
      </div>
      <h4 className="ps-h4">Garage doors</h4>
      {doors.map((d, i) => <SubjectEditor key={i} subject={d} cameras={cameras} onChange={s => set({ garageDoors: doors.map((x, j) => j === i ? s : x) })} onRemove={() => set({ garageDoors: doors.filter((_, j) => j !== i) })} />)}
      {doors.length < 6 && <button type="button" className="ps-btn" onClick={() => set({ garageDoors: [...doors, { key: `door-${Date.now().toString(36).slice(-4)}`, name: doors.length ? `Garage door ${doors.length + 1}` : 'Garage door', serial: null, region: null }] })}><Icon name="plus" />Add a garage door</button>}
    </>}
    {protocol.id === 'storm_umbrella' && <>
      <h4 className="ps-h4">The umbrella</h4>
      {config.umbrella ? <SubjectEditor subject={config.umbrella} cameras={cameras} onChange={s => set({ umbrella: s })} onRemove={() => set({ umbrella: null })} />
        : <button type="button" className="ps-btn" onClick={() => set({ umbrella: { key: 'patio', name: 'Patio umbrella', serial: null, region: null } })}><Icon name="plus" />Add the umbrella</button>}
      <h4 className="ps-h4">When the weather counts</h4>
      <div className="ps-form">
        <label className="ps-field"><span>Gusts at or over (mph)</span><input type="number" min={5} max={100} value={config.weather?.gustMph ?? 20} onChange={e => set({ weather: { ...config.weather!, gustMph: Number(e.target.value) } })} /></label>
        <label className="ps-field"><span>Thunder at chance (%)</span><input type="number" min={0} max={100} value={config.weather?.stormChance ?? 30} onChange={e => set({ weather: { ...config.weather!, stormChance: Number(e.target.value) } })} /></label>
        <label className="ps-field"><span>Look ahead (hours)</span><input type="number" min={1} max={24} value={config.weather?.lookaheadHours ?? 6} onChange={e => set({ weather: { ...config.weather!, lookaheadHours: Number(e.target.value) } })} /></label>
        <label className="ps-field"><span>Quiet from</span><input type="number" min={0} max={23} value={config.quiet.from} onChange={e => set({ quiet: { ...config.quiet, from: Number(e.target.value) } })} /></label>
        <label className="ps-field"><span>until</span><input type="number" min={0} max={23} value={config.quiet.to} onChange={e => set({ quiet: { ...config.quiet, to: Number(e.target.value) } })} /></label>
      </div>
      <small>Weather alerts also count: any thunderstorm, wind, tornado or tropical warning near home. In quiet hours an umbrella alert waits for morning unless the weather is under six hours away.</small>
    </>}
    <Recipients config={config} recipients={recipients} onChange={ids => set({ recipients: ids })} />
    <div className="ps-form">
      <label className="ps-field"><span>Remind if no one acknowledges (min, 0 = never)</span><input type="number" min={0} max={720} value={config.escalateAfterMinutes} onChange={e => set({ escalateAfterMinutes: Number(e.target.value) })} /></label>
      <label className="ps-field"><span>Fresh retries when unclear</span><input type="number" min={0} max={3} value={config.retries} onChange={e => set({ retries: Number(e.target.value) })} /></label>
      <label className="ps-radio"><input type="checkbox" checked={observeOnly} onChange={e => { const next = { ...config.autonomy }; if (e.target.checked) next['notify.household'] = 0; else delete next['notify.household']; set({ autonomy: next }); }} />Observe only — record incidents, send no alerts</label>
      <label className="ps-radio"><input type="checkbox" checked={config.simulation} onChange={e => set({ simulation: e.target.checked })} />Simulation mode — run for real, alert no one</label>
    </div>
    <details className="ps-guard-policy"><summary>What Athena may do on her own</summary>
      <ul>{protocol.policy.map(p => <li key={p.id}><span className={`ps-state ${p.allowed ? 'is-on' : 'is-off'}`} /> {p.label} — <small>{p.allowed ? (p.level === 2 ? 'does it and tells you' : 'does it quietly') : `never alone${p.reasons[0] ? `: ${p.reasons[0]}` : ''}`}</small></li>)}</ul>
    </details>
    <div className="ps-teach-actions">
      {error && <small className="ps-note is-error" role="alert">{error}</small>}
      {saved && <small className="ps-note">Saved.</small>}
      <button className="ps-btn ps-btn-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save'}</button>
    </div>
  </form>;
}

/** Test the protocol with a chosen outcome: nothing is captured and no one is alerted. */
function TestDialog({ data, onClose, onRun }: { data: GuardianOverview; onClose: () => void; onRun: (scenario: GuardianScenario) => void }) {
  const sweep = data.protocols.find(p => p.id === 'nightly_sweep');
  const storm = data.protocols.find(p => p.id === 'storm_umbrella');
  const doors = sweep?.config.garageDoors || [];
  const umbrella = storm?.config.umbrella;
  const [garage, setGarage] = useState<Record<string, string>>(Object.fromEntries(doors.map(d => [d.key, 'open'])));
  const [umb, setUmb] = useState('up');
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return <div className="ps-viewer" role="dialog" aria-modal="true" aria-label="Test the sweep" onClick={onClose}>
    <div className="ps-viewer-box ps-teach-box" onClick={e => e.stopPropagation()}>
      <header><strong>Test the sweep — no alerts are sent</strong><button className="ps-btn ps-btn-square" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
      <p className="ps-sub">Pick what the cameras "see". The whole protocol runs — the verdict, the incident, who would be told — every alert is recorded as a test, and the test's incidents close when it ends.</p>
      {doors.map(d => <label key={d.key} className="ps-field"><span>{d.name}</span><select value={garage[d.key]} onChange={e => setGarage(g => ({ ...g, [d.key]: e.target.value }))}>
        {['closed', 'open', 'partially_open', 'unknown', 'not_visible'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
      </select></label>)}
      {umbrella && <label className="ps-field"><span>{umbrella.name} (checked only if the weather calls for it)</span><select value={umb} onChange={e => setUmb(e.target.value)}>
        {['down', 'up', 'unknown', 'not_visible'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
      </select></label>}
      {!doors.length && !umbrella && <p className="ps-empty">Add a garage door or the umbrella in the settings first.</p>}
      <div className="ps-teach-actions"><button className="ps-btn ps-btn-primary" disabled={!doors.length && !umbrella} onClick={() => onRun({ garage_door: garage, ...(umbrella ? { patio_umbrella: { [umbrella.key]: umb } } : {}) })}>Run the test</button></div>
    </div>
  </div>;
}

export function SecurityGuardian({ enabled, cameras }: { enabled: boolean; cameras: SecurityDevice[] }) {
  const [data, setData] = useState<GuardianOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'status' | 'settings'>('status');
  const [testing, setTesting] = useState(false);

  const load = useCallback(() => propertyGuardianApi.overview()
    .then(next => { setData(next); setError(''); })
    .catch(e => setError(e?.status === 403 ? '' : e?.status === 503 ? 'Guardian is unavailable right now.' : 'Guardian couldn’t load.')), []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  const names = useMemo(() => new Map((data?.recipients || []).map(r => [r.id, r.name])), [data]);
  const subjectNames = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of data?.protocols || []) {
      for (const d of p.config.garageDoors || []) out.set(`garage_door:${d.key}`, d.name);
      if (p.config.umbrella) out.set(`patio_umbrella:${p.config.umbrella.key}`, p.config.umbrella.name);
    }
    return out;
  }, [data]);
  const active = (data?.incidents || []).filter(i => ['open', 'notified', 'acknowledged'].includes(i.state));
  const closed = (data?.incidents || []).filter(i => !['open', 'notified', 'acknowledged'].includes(i.state));

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key); setNotice('');
    try { await fn(); if (done) setNotice(done); await load(); }
    catch (err) { setNotice((err as Error).message || 'That didn’t work.'); }
    finally { setBusy(null); }
  }
  const onIncident = (incident: GuardianIncident) => (action: 'recheck' | 'acknowledge' | 'dismiss' | 'assign', value?: string | number | null) => act(incident.id, () => {
    if (action === 'recheck') return propertyGuardianApi.recheck(incident.id);
    if (action === 'acknowledge') return propertyGuardianApi.acknowledge(incident.id);
    if (action === 'dismiss') return propertyGuardianApi.dismiss(incident.id, String(value));
    return propertyGuardianApi.assign(incident.id, value == null ? null : Number(value));
  }, action === 'recheck' ? 'Rechecked with a fresh picture.' : undefined);

  if (!enabled || (!data && !error)) return null;
  if (!data) return <p className="ps-alert" role="alert">{error}</p>;
  const status = STATUS[data.status];
  const sweep = data.protocols.find(p => p.id === 'nightly_sweep')!;
  const lastGarage = (data.lastSweep?.results || []).filter(r => r.check === 'garage_door');
  const lastUmbrella = data.runs.flatMap(r => r.results).find(r => r.check === 'patio_umbrella');
  const watched = data.cameras.filter(c => c.watched);

  return <section className="ps-card ps-guard" aria-label="Guardian">
    <header className="ps-guard-head">
      <span className={`ps-tile-icon ${data.status === 'secure' ? 'is-green' : ''}`}><Icon name="shield" /></span>
      <div>
        <h3>Guardian</h3>
        <span className={`ps-state ${status.cls}`}>{status.label}</span>
        <small>{status.note} {data.lastSweep ? `Last sweep ${stamp(data.lastSweep.finishedAt || data.lastSweep.scheduledFor)}.` : ''} {sweep.enabled && data.nextSweepAt ? `Next ${stamp(data.nextSweepAt)}.` : ''}</small>
      </div>
      <div className="ps-chips" role="group" aria-label="Guardian view">
        <button className={view === 'status' ? 'active' : ''} aria-pressed={view === 'status'} onClick={() => setView('status')}>Status</button>
        <button className={view === 'settings' ? 'active' : ''} aria-pressed={view === 'settings'} onClick={() => setView('settings')}>Settings</button>
      </div>
      <div className="ps-guard-run">
        <button className="ps-btn ps-btn-primary" disabled={!!busy} onClick={() => void act('run', () => propertyGuardianApi.run('nightly_sweep'), 'Sweep finished.')}><Icon name="shield" />{busy === 'run' ? 'Checking the cameras…' : 'Run sweep now'}</button>
        <button className="ps-btn" disabled={!!busy} onClick={() => setTesting(true)}>Test</button>
      </div>
    </header>
    {notice && <p className="ps-sub" role="status">{notice}</p>}
    {error && <p className="ps-alert" role="alert">{error}</p>}

    {view === 'status' && <>
      <div className="ps-guard-tiles">
        <div className="ps-stat"><span className="ps-tile-icon"><Icon name="garage" /></span><div><strong>Garage</strong>
          {lastGarage.length ? lastGarage.map(r => <span key={r.subject} className={`ps-state ${r.status === 'closed' ? 'is-on' : 'is-warn'}`}>{(sweep.config.garageDoors || []).find(d => d.key === r.subject)?.name || r.subject}: {RESULT_WORD[r.status] || r.status}</span>)
            : <small>{(sweep.config.garageDoors || []).length ? 'Not checked yet' : 'No garage door set up'}</small>}</div></div>
        <div className="ps-stat"><span className="ps-tile-icon"><Icon name="umbrella" /></span><div><strong>Umbrella</strong>
          {lastUmbrella ? <span className={`ps-state ${lastUmbrella.status === 'down' || lastUmbrella.status === 'not_applicable' ? 'is-on' : 'is-warn'}`}>{RESULT_WORD[lastUmbrella.status] || lastUmbrella.status}</span> : <small>Checked only when the weather calls for it</small>}</div></div>
        <div className="ps-stat"><span className="ps-tile-icon"><Icon name="wind" /></span><div><strong>Weather</strong>
          {!data.weather ? <small>Not watched</small> : !data.weather.known ? <span className="ps-state is-warn">Forecast unavailable</span>
            : data.weather.atRisk ? <><span className={`ps-state ${data.weather.urgent ? 'is-alert' : 'is-warn'}`}>Risk for the umbrella</span><small>{data.weather.reasons.map(r => r.text).join(', ')}</small></>
            : <span className="ps-state is-on">Calm for the next few hours</span>}</div></div>
        <div className="ps-stat"><span className="ps-tile-icon"><Icon name="camera" /></span><div><strong>Cameras</strong>
          {data.bridge !== 'ready' ? <span className="ps-state is-warn">Bridge {data.bridge === 'not_connected' ? 'not set up' : 'unavailable'}</span>
            : watched.length ? watched.map(c => <small key={c.serial}>{c.name}{c.batteryPercent != null ? ` · ${c.batteryPercent}%` : ''}{c.freshSnapshotAvailable ? '' : ' · no fresh pictures'}</small>) : <small>No camera assigned yet</small>}</div></div>
      </div>

      <h4 className="ps-h4">Needs attention</h4>
      {active.length ? <ul className="ps-guard-list">{active.map(i => <IncidentRow key={i.id} incident={i} names={names} busy={busy === i.id} onAct={onIncident(i)} />)}</ul>
        : <p className="ps-empty">Nothing open. {data.status === 'secure' ? 'Everything checked was verified safe.' : ''}</p>}

      <h4 className="ps-h4">Recent activity</h4>
      {data.runs.length ? <ul className="ps-sight-list ps-guard-runs">{data.runs.slice(0, 8).map(r => <RunRow key={r.id} run={r} subjectNames={subjectNames} />)}</ul> : <p className="ps-empty">No sweeps yet.</p>}
      {closed.length > 0 && <details className="ps-guard-policy"><summary>Closed incidents ({closed.length})</summary><ul className="ps-guard-list">{closed.map(i => <IncidentRow key={i.id} incident={i} names={names} busy={false} onAct={() => undefined} />)}</ul></details>}
      <small className="ps-guard-health">Last 7 days: {data.health.runs} checks · {data.health.safe} safe · {data.health.attention} needed attention · {data.health.unknown} couldn't verify{data.health.missed ? ` · ${data.health.missed} missed` : ''}{data.health.notificationsFailed ? ` · ${data.health.notificationsFailed} alerts failed to send` : ''}</small>
    </>}

    {view === 'settings' && <div className="ps-guard-settings-list">
      {data.protocols.map(p => <ProtocolSettings key={p.id} protocol={p} cameras={cameras} recipients={data.recipients}
        onSave={async (on, config) => setData(await propertyGuardianApi.save(p.id, { enabled: on, config }))} />)}
    </div>}

    {testing && <TestDialog data={data} onClose={() => setTesting(false)} onRun={scenario => { setTesting(false); void act('run', () => propertyGuardianApi.run('nightly_sweep', { scenario }), 'Test finished — see Recent activity. No one was alerted.'); }} />}
  </section>;
}
