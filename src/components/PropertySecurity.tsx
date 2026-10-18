import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { propertySecurityApi, type SecurityDevice, type SecurityEvent, type SecurityMedia, type SecurityStatus } from '../api/propertySecurity';
import './propertySecurity.css';

const DAY = 24 * 60 * 60_000;
const time = (v: string) => new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const timeSec = (v: string) => new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const day = (v: string) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const stamp = (v: string | null) => v ? `${new Date(v).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}, ${time(v)}` : 'never';
const stale = (v: string | null) => !v || Date.now() - new Date(v).getTime() > DAY;
const sameDay = (v: string) => new Date(v).toDateString() === new Date().toDateString();

/** The few line icons this page draws, in the concept's thin cyan stroke. */
function Icon({ name }: { name: 'hub' | 'camera' | 'doorbell' | 'motion' | 'storage' | 'refresh' | 'bell' | 'expand' | 'clip' | 'star' | 'trash' | 'close' | 'play' }) {
  const paths: Record<string, ReactNode> = {
    hub: <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
    camera: <><rect x="3" y="7" width="18" height="12" rx="3" /><circle cx="12" cy="13" r="3.2" /><path d="M8 7l1.5-2.5h5L16 7" /></>,
    doorbell: <><rect x="7" y="3" width="10" height="18" rx="3" /><circle cx="12" cy="8" r="1.6" /><circle cx="12" cy="15" r="2.6" /></>,
    motion: <><circle cx="14" cy="4.5" r="1.8" /><path d="m9 21 3-6 3 3v3M7 11l3-3 4 1 2 3 3 1M12 15l-1-5" /></>,
    storage: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3v5h5M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 21v-5h-5" /></>,
    bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
    clip: <><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10 5-3v10l-5-3" /></>,
    star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    play: <path d="M8 5v14l11-7z" />,
  };
  return <svg className="ps-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/**
 * Object URLs for kept media, fetched once per page visit. Every fetch is an
 * audited read on the server, so the page never re-downloads what it has.
 */
const mediaUrls = new Map<string, Promise<string>>();
function mediaUrl(id: string) {
  let url = mediaUrls.get(id);
  if (!url) {
    url = propertySecurityApi.mediaBlob(id).then(blob => URL.createObjectURL(blob));
    url.catch(() => mediaUrls.delete(id));
    mediaUrls.set(id, url);
  }
  return url;
}
function useMediaUrl(id: string | null) {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    mediaUrl(id).then(u => { if (alive) setUrl({ id, url: u }); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return url && url.id === id ? url.url : null;
}

type Viewing = { kind: 'fresh'; src: string; title: string } | { kind: 'kept'; media: SecurityMedia };

function CameraCard({ device, latest, onView, onKept }: { device: SecurityDevice; latest: SecurityMedia | null; onView: (v: Viewing) => void; onKept: (m?: SecurityMedia) => void }) {
  const [fresh, setFresh] = useState<{ src: string; at: string } | null>(null);
  const [busy, setBusy] = useState<'image' | 'clip' | null>(null);
  const [error, setError] = useState('');
  const keptSrc = useMediaUrl(!fresh && latest ? latest.id : null);
  useEffect(() => () => { if (fresh) URL.revokeObjectURL(fresh.src); }, [fresh]);
  const isDoorbell = /doorbell|T82/i.test(`${device.model} ${device.capabilities.join(' ')}`);
  const camera = device.capabilities.includes('camera');
  const reporting = !stale(device.lastSeenAt);
  const name = device.name || device.model || 'Security device';

  async function capture() {
    setBusy('image'); setError('');
    try {
      const blob = await propertySecurityApi.snapshot(device.serial, 'fresh');
      if (!blob.type.startsWith('image/')) throw new Error('Image unavailable');
      setFresh({ src: URL.createObjectURL(blob), at: new Date().toISOString() });
      onKept();
    } catch { setError('Fresh capture unavailable. Try again in a moment.'); }
    finally { setBusy(null); }
  }
  async function record() {
    setBusy('clip'); setError('');
    try { onKept((await propertySecurityApi.recordClip(device.serial, 15)).media); }
    catch { setError('Clip recording unavailable. Try again in a moment.'); }
    finally { setBusy(null); }
  }
  const src = fresh?.src || keptSrc;
  const badge = fresh ? { label: 'Fresh', at: time(fresh.at), live: true } : latest && keptSrc ? { label: 'Kept', at: `${day(latest.capturedAt)} · ${time(latest.capturedAt)}`, live: false } : null;

  return <li className="ps-cam">
    <header className="ps-cam-head">
      <span className="ps-tile-icon"><Icon name={isDoorbell ? 'doorbell' : 'camera'} /></span>
      <div>
        <strong>{name}</strong>
        <span className={`ps-state ${!device.bound ? 'is-off' : reporting ? 'is-on' : 'is-warn'}`} title={reporting ? 'The device reported in the last day' : 'No device report in the last day — it may still answer an image request'}>{!device.bound ? 'Not bound' : reporting ? 'Reporting' : 'Quiet'}</span>
        <small>{device.model || 'Model unknown'} · {device.batteryPercent == null ? 'Battery unavailable' : `Battery ${device.batteryPercent}%`}{device.charging ? ' · Charging' : ''}</small>
      </div>
    </header>
    {camera && <div className={`ps-shot${src ? '' : ' is-empty'}`}>
      {src ? <img src={src} alt={`${name} ${fresh ? 'fresh capture' : 'kept image'}`} /> : <span>{busy === 'image' ? 'Waking the camera…' : 'No image yet'}</span>}
      {badge && <span className="ps-shot-badge">{badge.live && <i />}{badge.label} <b>{badge.at}</b></span>}
      {src && <button className="ps-shot-expand" aria-label={`Enlarge ${name} image`} onClick={() => fresh ? onView({ kind: 'fresh', src: fresh.src, title: `${name} · ${time(fresh.at)}` }) : latest && onView({ kind: 'kept', media: latest })}><Icon name="expand" /></button>}
    </div>}
    {camera && <div className="ps-cam-actions">
      {device.freshSnapshotAvailable && <button className="ps-btn" disabled={!!busy || !device.bound} onClick={() => void capture()}><Icon name="camera" />{busy === 'image' ? 'Capturing…' : 'Get fresh image'}</button>}
      {device.clipAvailable && <button className="ps-btn ps-btn-square" disabled={!!busy || !device.bound} onClick={() => void record()} aria-label={`Record a 15-second clip from ${name}`} title="Record a 15-second clip and keep it">{busy === 'clip' ? <span className="ps-spin" /> : <Icon name="clip" />}</button>}
    </div>}
    {busy === 'clip' && <small className="ps-note">Recording 15 seconds…</small>}
    {error && <small className="ps-note is-error" role="alert">{error}</small>}
    <small className="ps-cam-foot">Last report: {stamp(device.lastSeenAt)}{stale(device.lastSeenAt) && <em> · Stale</em>}</small>
  </li>;
}

function EventsPanel({ events, devices }: { events: SecurityEvent[]; devices: SecurityDevice[] }) {
  const [filter, setFilter] = useState<'all' | 'motion' | 'doorbell'>('all');
  const shown = events.filter(e => filter === 'all' || e.kind === filter).slice(0, 8);
  return <section className="ps-card ps-events" aria-label="Recent events">
    <header><h3>Recent events</h3><span>{events.length} since the bridge started</span></header>
    <div className="ps-chips" role="group" aria-label="Filter events">
      {(['all', 'motion', 'doorbell'] as const).map(f => <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'motion' ? 'Motion' : 'Doorbell'}</button>)}
    </div>
    {shown.length ? <ul>{shown.map(e => <li key={e.id}>
      <span className={`ps-event-icon${e.kind === 'doorbell' ? ' is-bell' : ''}`}><Icon name={e.kind === 'doorbell' ? 'bell' : 'motion'} /></span>
      <div><strong>{e.kind === 'doorbell' ? 'Doorbell' : 'Motion'}</strong> <span>{devices.find(d => d.serial === e.deviceSn)?.name || 'Security device'}</span><small>{sameDay(e.at) ? timeSec(e.at) : `${day(e.at)} · ${time(e.at)}`}</small></div>
    </li>)}</ul> : <p className="ps-empty">No {filter === 'all' ? '' : `${filter} `}events received since the bridge started.</p>}
  </section>;
}

function MediaThumb({ media, onOpen }: { media: SecurityMedia; onOpen: () => void }) {
  const src = useMediaUrl(media.type === 'image' ? media.id : null);
  return <button className="ps-thumb" onClick={onOpen} aria-label={`Open ${media.type} from ${media.deviceName || 'camera'} at ${time(media.capturedAt)}`}>
    {media.type === 'image' ? (src ? <img src={src} alt="" /> : <span className="ps-thumb-ph" />) : <span className="ps-thumb-ph is-clip"><Icon name="play" /><small>{media.durationSeconds ?? '—'}s clip</small></span>}
    {media.important && <span className="ps-thumb-star" aria-label="Important"><Icon name="star" /></span>}
  </button>;
}

function KeptMedia({ media, error, onOpen }: { media: SecurityMedia[]; error: string; onOpen: (m: SecurityMedia) => void }) {
  const [view, setView] = useState<'important' | 'all'>('important');
  const shown = media.filter(m => view === 'all' || m.important);
  return <section className="ps-card ps-kept" aria-label="Kept clips and images">
    <header>
      <span className="ps-tile-icon"><Icon name="clip" /></span><h3>Kept clips &amp; images</h3>
      <div className="ps-chips" role="group" aria-label="Which media">
        <button className={view === 'important' ? 'active' : ''} aria-pressed={view === 'important'} onClick={() => setView('important')}>Important</button>
        <button className={view === 'all' ? 'active' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>All ({media.length})</button>
      </div>
    </header>
    {error ? <p className="ps-empty" role="alert">{error}</p> : shown.length ? <ul>{shown.slice(0, 24).map(m => <li key={m.id}>
      <MediaThumb media={m} onOpen={() => onOpen(m)} />
      <div className="ps-kept-meta">
        <span className={`ps-event-icon${m.type === 'clip' ? ' is-clip' : ''}`}><Icon name={m.type === 'clip' ? 'clip' : 'camera'} /></span>
        <div><strong>{time(m.capturedAt)} · {day(m.capturedAt)}</strong><small>{m.type === 'clip' ? 'Clip' : 'Image'} · {m.deviceName || 'Camera'}</small></div>
      </div>
    </li>)}</ul> : <p className="ps-empty">{view === 'important' ? 'Nothing starred yet. Recorded clips are starred automatically; star an image to keep it here.' : 'Fresh images and recorded clips are kept here.'}</p>}
  </section>;
}

function Viewer({ viewing, onClose, onChange }: { viewing: Viewing; onClose: () => void; onChange: (m: SecurityMedia | null) => void }) {
  const media = viewing.kind === 'kept' ? viewing.media : null;
  const src = useMediaUrl(media?.id ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  async function star() {
    if (!media) return;
    setBusy(true);
    try { onChange((await propertySecurityApi.setImportant(media.id, !media.important)).media); } finally { setBusy(false); }
  }
  async function remove() {
    if (!media || !window.confirm(`Delete this ${media.type} permanently? It is removed from the bucket too.`)) return;
    setBusy(true);
    try { await propertySecurityApi.removeMedia(media.id); onChange(null); onClose(); } finally { setBusy(false); }
  }
  const shown = viewing.kind === 'fresh' ? viewing.src : src;
  const title = viewing.kind === 'fresh' ? viewing.title : `${media!.deviceName || 'Camera'} · ${day(media!.capturedAt)} · ${time(media!.capturedAt)}`;
  return <div className="ps-viewer" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="ps-viewer-box" onClick={e => e.stopPropagation()}>
      <header><strong>{title}</strong>
        {media && <button className={`ps-btn ps-btn-square${media.important ? ' is-starred' : ''}`} disabled={busy} onClick={() => void star()} aria-pressed={media.important} aria-label={media.important ? 'Unstar' : 'Star as important'} title={media.important ? 'Unstar' : 'Star as important'}><Icon name="star" /></button>}
        {media && <button className="ps-btn ps-btn-square" disabled={busy} onClick={() => void remove()} aria-label="Delete" title="Delete permanently"><Icon name="trash" /></button>}
        <button className="ps-btn ps-btn-square" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </header>
      {!shown ? <p className="ps-empty">Loading…</p> : media?.type === 'clip' ? <video src={shown} controls autoPlay playsInline /> : <img src={shown} alt={title} />}
    </div>
  </div>;
}

function StatusStrip({ data, error, media, onRefresh, refreshing }: { data: SecurityStatus | null; error: string; media: SecurityMedia[]; onRefresh: () => void; refreshing: boolean }) {
  const station = data?.devices.find(d => /homebase|station|T80[0-9]{2}/i.test(`${d.name} ${d.model}`) && !d.capabilities.includes('camera'));
  const devices = data?.devices.filter(d => d !== station) || [];
  const reporting = devices.filter(d => !stale(d.lastSeenAt)).length;
  const today = (data?.events || []).filter(e => sameDay(e.at));
  // Today's events in eight three-hour bars, midnight to midnight.
  const bars = Array.from({ length: 8 }, (_, i) => today.filter(e => Math.floor(new Date(e.at).getHours() / 3) === i).length);
  const peak = Math.max(1, ...bars);
  const statusText = !data && !error ? 'Checking…' : data?.status === 'ready' ? 'Ready' : data?.status === 'authorization_required' ? 'Sign-in required' : data?.status === 'reconnecting' ? 'Reconnecting' : data?.status === 'connecting' ? 'Connecting' : data?.status === 'not_connected' ? 'Not set up' : 'Unavailable';
  const clips = media.filter(m => m.type === 'clip').length;
  return <div className="ps-strip">
    <div className="ps-stat"><span className="ps-tile-icon"><Icon name="hub" /></span><div><strong>{station?.name || 'Eufy HomeBase'}</strong><span className={`ps-state ${data?.status === 'ready' ? 'is-on' : 'is-warn'}`}>{statusText}</span><small>Bridge refreshed {data?.updatedAt ? time(data.updatedAt) : '—'}</small></div></div>
    <div className="ps-stat"><span className="ps-tile-icon"><Icon name="camera" /></span><div><strong>{devices.length} {devices.length === 1 ? 'Device' : 'Devices'}</strong><span className="ps-accent">{reporting} reporting · {devices.length - reporting} quiet</span><span className="ps-meter" aria-hidden="true"><i style={{ width: `${devices.length ? (reporting / devices.length) * 100 : 0}%` }} /></span></div></div>
    <div className="ps-stat"><span className="ps-tile-icon"><Icon name="motion" /></span><div><strong>{today.length}</strong><small>Events today</small></div><span className="ps-bars" aria-label={`${today.length} events today`}>{bars.map((n, i) => <i key={i} style={{ height: `${n ? 18 + (n / peak) * 82 : 8}%` }} className={n ? '' : 'is-zero'} />)}</span></div>
    <div className="ps-stat"><span className="ps-tile-icon is-green"><Icon name="storage" /></span><div><strong>Cloud storage</strong><span className="ps-state is-on">{media.length} kept</span><small>{clips} {clips === 1 ? 'clip' : 'clips'} · private bucket</small></div></div>
    <div className="ps-refresh"><button className="ps-btn ps-btn-primary" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" />{refreshing ? 'Refreshing…' : 'Refresh all'}</button><small>Last refresh {data?.updatedAt ? time(data.updatedAt) : '—'}</small></div>
  </div>;
}

export function PropertySecurity({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [media, setMedia] = useState<SecurityMedia[]>([]);
  const [mediaError, setMediaError] = useState('');
  const [viewing, setViewing] = useState<Viewing | null>(null);

  const loadMedia = useCallback(() => propertySecurityApi.media()
    .then(r => { setMedia(r.media); setMediaError(''); })
    .catch(() => setMediaError('Kept images and clips are unavailable right now.')), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => propertySecurityApi.status()
      .then(next => { if (active) { setData(next); setError(''); } })
      .catch(e => { if (active) { setData(null); setError(e?.status === 403 ? 'Your account is not authorized for household security.' : 'Security connection unavailable.'); } })
      .finally(() => { if (active) setRefreshing(false); });
    void load();
    void loadMedia();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [enabled, refresh, loadMedia]);

  const latestBySerial = useMemo(() => {
    const out = new Map<string, SecurityMedia>();
    for (const m of media) if (m.type === 'image' && !out.has(m.deviceSerial)) out.set(m.deviceSerial, m);
    return out;
  }, [media]);
  const onKept = useCallback((m?: SecurityMedia) => {
    if (m) setMedia(list => [m, ...list.filter(x => x.id !== m.id)]);
    else void loadMedia();
  }, [loadMedia]);
  const onChange = useCallback((m: SecurityMedia | null) => {
    if (viewing?.kind !== 'kept') return;
    const id = viewing.media.id;
    setMedia(list => m ? list.map(x => x.id === id ? m : x) : list.filter(x => x.id !== id));
    if (m) setViewing({ kind: 'kept', media: m });
  }, [viewing]);

  const cameras = (data?.devices || []).filter(d => d.capabilities.includes('camera'));
  return <div className="ps">
    <StatusStrip data={data} error={error} media={media} refreshing={refreshing} onRefresh={() => { setRefreshing(true); setRefresh(n => n + 1); }} />
    {error && <p className="ps-alert" role="alert">{error}</p>}
    {(data?.status === 'not_connected' || data?.status === 'authorization_required') && <div className="ps-card ps-setup"><strong>Connection setup</strong><p>On the private household bridge host, the owner installs the Eufy bridge and completes Eufy sign-in there. If sign-in expired, run the bridge login command again on that host. No password or verification code belongs in Athena chat.</p></div>}
    {data?.status === 'ready' && <div className="ps-main">
      {cameras.length ? <ul className="ps-cams">{cameras.map(d => <CameraCard key={d.serial} device={d} latest={latestBySerial.get(d.serial) || null} onView={setViewing} onKept={onKept} />)}</ul> : <p className="ps-card ps-empty">No Eufy cameras were discovered for this account.</p>}
      <EventsPanel events={data.events} devices={data.devices} />
    </div>}
    {(data?.status === 'ready' || media.length > 0) && <KeptMedia media={media} error={mediaError} onOpen={m => setViewing({ kind: 'kept', media: m })} />}
    <p className="ps-fine">Images and clips are captured only when someone asks, and each request may wake a battery camera. Every fresh image and recorded clip is kept in the household's private cloud bucket until deleted. Athena does not watch the cameras or alert anyone on her own.</p>
    {viewing && <Viewer viewing={viewing} onClose={() => setViewing(null)} onChange={onChange} />}
  </div>;
}
