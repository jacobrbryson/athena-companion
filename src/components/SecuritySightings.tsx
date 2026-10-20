import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  propertySecurityApi, type SecurityDevice, type SecurityMedia, type Sighting, type SightingsOverview, type SightingSubject, type SubjectKind, type TeachResult,
} from '../api/propertySecurity';
import { Icon, useMediaUrl, type IconName } from './securityShared';

const KIND_ICON: Record<SubjectKind, IconName> = { person: 'person', animal: 'paw', vehicle: 'car' };
const when = (v: string) => {
  const d = new Date(v);
  const sameDay = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `${t} today` : `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${t}`;
};

/** Sighting frames, fetched once per visit (each read is audited on the server). */
const frameUrls = new Map<string, Promise<string>>();
function useFrameUrl(id: string | null) {
  const [url, setUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let p = frameUrls.get(id);
    if (!p) { p = propertySecurityApi.sightingFrame(id).then(b => URL.createObjectURL(b)); p.catch(() => frameUrls.delete(id)); frameUrls.set(id, p); }
    p.then(u => { if (alive) setUrl({ id, url: u }); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return url && url.id === id ? url.url : null;
}

function FrameViewer({ sighting, onClose }: { sighting: Sighting; onClose: () => void }) {
  const src = useFrameUrl(sighting.id);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const title = `${sighting.label} · ${sighting.camera || 'Camera'} · ${when(sighting.seenAt)}`;
  return <div className="ps-viewer" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="ps-viewer-box" onClick={e => e.stopPropagation()}>
      <header><strong>{title}</strong><button className="ps-btn ps-btn-square" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
      {src ? <img src={src} alt={title} /> : <p className="ps-empty">Loading…</p>}
      {sighting.where && <small>{sighting.where}{sighting.zone ? ` · ${sighting.zone}` : ''}{sighting.confidence != null ? ` · ${Math.round(sighting.confidence * 100)}% sure` : ''}</small>}
    </div>
  </div>;
}

const KIND_WORD: Record<SubjectKind, string> = { person: 'person', animal: 'pet or animal', vehicle: 'vehicle' };
const MAX_PHOTOS = 3;
const VISIT_GAP_MS = 30 * 60_000;

/**
 * Other unnamed sightings the owner might mean too: same camera, kind and
 * label, each within half an hour of the next. Offered as ticks, never applied
 * on their own — two strangers are never assumed to be the same person.
 */
function sameVisit(all: Sighting[], s: Sighting) {
  const others = all.filter(x => x.id !== s.id && !x.subjectId && x.deviceSerial === s.deviceSerial && x.kind === s.kind && x.label === s.label);
  const at = (x: Sighting) => Date.parse(x.seenAt);
  const out: Sighting[] = [];
  for (const later of [true, false]) {
    let edge = at(s);
    const side = others.filter(x => (later ? at(x) >= edge : at(x) < edge)).sort((a, b) => (later ? at(a) - at(b) : at(b) - at(a)));
    for (const x of side) {
      if (Math.abs(at(x) - edge) > VISIT_GAP_MS) break;
      out.push(x);
      edge = at(x);
    }
  }
  return out.sort((a, b) => at(b) - at(a));
}

/** "This is…": name one unnamed sighting, and teach the gallery from its frame. */
function TeachDialog({ sighting, data, onClose, onDone }: { sighting: Sighting; data: SightingsOverview; onClose: () => void; onDone: (r: TeachResult) => void }) {
  const src = useFrameUrl(sighting.hasFrame ? sighting.id : null);
  const choices = data.subjects.filter(x => x.kind === sighting.kind);
  const [pick, setPick] = useState(choices[0]?.id || 'new');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [also, setAlso] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visit = sameVisit(data.sightings, sighting);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const chosen = choices.find(x => x.id === pick);
  const full = !!chosen && chosen.photos.length >= MAX_PHOTOS;
  const ready = pick !== 'new' || !!name.trim();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      onDone(await propertySecurityApi.teachSighting(sighting.id, {
        ...(pick === 'new' ? { newSubject: { name: name.trim(), description: description.trim() || undefined } } : { subjectId: pick }),
        ...(also.length ? { alsoIds: also } : {}),
      }));
    } catch (err) {
      setError((err as Error).message || 'That didn’t work.');
      setBusy(false);
    }
  }
  const title = `Who is this ${sighting.label}?`;
  return <div className="ps-viewer" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="ps-viewer-box ps-teach-box" onClick={e => e.stopPropagation()}>
      <header><strong>{title}</strong><button className="ps-btn ps-btn-square" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
      {sighting.hasFrame && (src ? <img src={src} alt={`${sighting.label} on ${sighting.camera || 'the camera'} at ${when(sighting.seenAt)}`} /> : <p className="ps-empty">Loading…</p>)}
      <small>{[sighting.camera, sighting.where, when(sighting.seenAt)].filter(Boolean).join(' · ')}</small>
      <form onSubmit={e => void submit(e)}>
        <fieldset className="ps-teach-choice">
          <legend>This is…</legend>
          {choices.map(x => <label key={x.id} className="ps-radio">
            <input type="radio" name="teach-who" checked={pick === x.id} onChange={() => setPick(x.id)} />
            <span>{x.name}{x.photos.length >= MAX_PHOTOS && <em className="ps-tag">{MAX_PHOTOS} photos already</em>}</span>
          </label>)}
          <label className="ps-radio"><input type="radio" name="teach-who" checked={pick === 'new'} onChange={() => setPick('new')} /><span>Someone new — a {KIND_WORD[sighting.kind]}</span></label>
          {pick === 'new' && <div className="ps-teach-new">
            <label className="ps-field"><span>Name</span><input autoFocus value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={sighting.kind === 'animal' ? 'Wynter' : sighting.kind === 'vehicle' ? 'Red van' : 'Their name'} /></label>
            <label className="ps-field"><span>What they look like (optional)</span><input value={description} maxLength={300} onChange={e => setDescription(e.target.value)} placeholder={sighting.kind === 'animal' ? 'Black lab, white chest, red collar' : ''} /></label>
          </div>}
        </fieldset>
        <p className="ps-sub">{full
          ? `${chosen!.name} already has ${MAX_PHOTOS} reference photos, so this sighting takes the name but its frame isn’t added — remove a photo in the Gallery to use it.`
          : sighting.hasFrame ? 'The frame is kept as a starred image and added as a reference photo, so the cameras can recognise them next time.' : 'This sighting has no frame, so only its name changes.'}</p>
        {visit.length > 0 && <div className="ps-teach-also">
          <p className="ps-sub">Also on {sighting.camera || 'this camera'} around then — tick any that are the same {KIND_WORD[sighting.kind]}:</p>
          {visit.map(v => <label key={v.id} className="ps-radio">
            <input type="checkbox" checked={also.includes(v.id)} onChange={e => setAlso(e.target.checked ? [...also, v.id] : also.filter(x => x !== v.id))} />
            <span>{v.label} · {when(v.seenAt)}{v.where ? ` · ${v.where}` : ''}</span>
          </label>)}
        </div>}
        {error && <p className="ps-alert" role="alert">{error}</p>}
        <div className="ps-teach-actions">
          <button className="ps-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="ps-btn" type="submit" disabled={!ready || busy}>{busy ? 'Saving…' : pick === 'new' ? `Add ${name.trim() || 'them'}` : `This is ${chosen?.name}`}</button>
        </div>
      </form>
    </div>
  </div>;
}

function Log({ data, onOpen, onTeach, notice }: { data: SightingsOverview; onOpen: (s: Sighting) => void; onTeach: (s: Sighting) => void; notice: string }) {
  const [filter, setFilter] = useState('all');
  const shown = data.sightings.filter(s => filter === 'all' || (filter === 'stranger' ? s.label === 'stranger' : s.subjectId === filter));
  return <>
    <label className="ps-field ps-field-inline"><span>Show</span>
      <select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Everyone and everything</option>
        {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value="stranger">Strangers</option>
      </select>
    </label>
    {notice && <p className="ps-sub" role="status">{notice}</p>}
    {shown.length ? <ul className="ps-sight-list">{shown.map(s => <li key={s.id}>
      <span className={`ps-event-icon is-${s.kind}`}><Icon name={KIND_ICON[s.kind]} /></span>
      <div>
        <strong>{s.label}</strong>{s.confidence != null && s.confidence < 0.6 && <em className="ps-tag">not sure</em>}
        <small>{[s.camera, s.where, s.zone].filter(Boolean).join(' · ')}</small>
      </div>
      <time dateTime={s.seenAt}>{when(s.seenAt)}</time>
      <span className="ps-sight-actions">
        {!s.subjectId && <button className="ps-btn" onClick={() => onTeach(s)} aria-label={`Name the ${s.label} seen ${when(s.seenAt)}`}>This is…</button>}
        {s.hasFrame && <button className="ps-btn ps-btn-square" onClick={() => onOpen(s)} aria-label={`See the frame for ${s.label} at ${when(s.seenAt)}`}><Icon name="eye" /></button>}
      </span>
    </li>)}</ul> : <p className="ps-empty">{data.sightings.length ? 'Nothing matches that filter.' : 'No sightings yet. They appear here as cameras see motion.'}</p>}
  </>;
}

function PhotoThumb({ mediaId, onRemove }: { mediaId: string; onRemove: () => void }) {
  const src = useMediaUrl(mediaId);
  return <span className="ps-ref">{src ? <img src={src} alt="" /> : <i />}<button onClick={onRemove} aria-label="Remove this reference photo"><Icon name="close" /></button></span>;
}

function PhotoPicker({ media, taken, onPick, onClose }: { media: SecurityMedia[]; taken: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const images = media.filter(m => m.type === 'image' && !taken.includes(m.id)).slice(0, 24);
  return <div className="ps-viewer" role="dialog" aria-modal="true" aria-label="Pick a reference photo" onClick={onClose}>
    <div className="ps-viewer-box" onClick={e => e.stopPropagation()}>
      <header><strong>Pick a kept image that shows them clearly</strong><button className="ps-btn ps-btn-square" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
      {images.length ? <ul className="ps-picker">{images.map(m => <li key={m.id}><PickTile media={m} onPick={() => onPick(m.id)} /></li>)}</ul>
        : <p className="ps-empty">No kept images yet. Use "Get fresh image" on a camera while they're in view, then pick it here.</p>}
    </div>
  </div>;
}
function PickTile({ media, onPick }: { media: SecurityMedia; onPick: () => void }) {
  const src = useMediaUrl(media.id);
  return <button className="ps-thumb" onClick={onPick} aria-label={`Use the ${media.deviceName || 'camera'} image from ${when(media.capturedAt)}`}>{src ? <img src={src} alt="" /> : <span className="ps-thumb-ph" />}</button>;
}

function Gallery({ data, media, reload }: { data: SightingsOverview; media: SecurityMedia[]; reload: () => void }) {
  const [adding, setAdding] = useState({ name: '', kind: 'animal' as SubjectKind, description: '' });
  const [picking, setPicking] = useState<SightingSubject | null>(null);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); reload(); } catch (e) { setError((e as Error).message || 'That didn’t work.'); } };
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!adding.name.trim()) return;
    await run(() => propertySecurityApi.createSubject({ name: adding.name.trim(), kind: adding.kind, description: adding.description.trim() || undefined }));
    setAdding({ name: '', kind: adding.kind, description: '' });
  }
  return <>
    <p className="ps-sub">Name the people, pets and vehicles the cameras should recognise, and add up to three clear photos of each. Anyone not here is logged as “stranger”.</p>
    {error && <p className="ps-alert" role="alert">{error}</p>}
    <ul className="ps-gallery">{data.subjects.map(s => <li key={s.id} className="ps-subject">
      <header>
        <span className={`ps-event-icon is-${s.kind}`}><Icon name={KIND_ICON[s.kind]} /></span>
        <div><strong>{s.name}</strong><small>{s.description || s.kind}</small></div>
        <button className="ps-btn ps-btn-square" aria-label={`Remove ${s.name}`} title="Remove (deletes their sightings too)"
          onClick={() => { if (window.confirm(`Remove ${s.name}? Their sightings and alerts are deleted too.`)) void run(() => propertySecurityApi.removeSubject(s.id)); }}><Icon name="trash" /></button>
      </header>
      <small className="ps-subject-seen">{s.lastSeen ? `Last seen ${when(s.lastSeen.at)}${s.lastSeen.camera ? ` on ${s.lastSeen.camera}` : ''}${s.lastSeen.where ? `, ${s.lastSeen.where}` : ''}` : 'Not seen yet'}</small>
      <div className="ps-refs">
        {s.photos.map(m => <PhotoThumb key={m} mediaId={m} onRemove={() => void run(() => propertySecurityApi.removeSubjectPhoto(s.id, m))} />)}
        {s.photos.length < 3 && <button className="ps-ref ps-ref-add" onClick={() => setPicking(s)} aria-label={`Add a reference photo of ${s.name}`}><Icon name="plus" /></button>}
      </div>
    </li>)}</ul>
    <form className="ps-form" onSubmit={e => void add(e)}>
      <label className="ps-field"><span>Name</span><input value={adding.name} maxLength={60} onChange={e => setAdding({ ...adding, name: e.target.value })} placeholder="Wynter" /></label>
      <label className="ps-field"><span>Kind</span><select value={adding.kind} onChange={e => setAdding({ ...adding, kind: e.target.value as SubjectKind })}><option value="person">Person</option><option value="animal">Pet / animal</option><option value="vehicle">Vehicle</option></select></label>
      <label className="ps-field ps-field-grow"><span>What they look like</span><input value={adding.description} maxLength={300} onChange={e => setAdding({ ...adding, description: e.target.value })} placeholder="Black lab, white chest, red collar" /></label>
      <button className="ps-btn" type="submit" disabled={!adding.name.trim()}><Icon name="plus" />Add</button>
    </form>
    {picking && <PhotoPicker media={media} taken={picking.photos} onClose={() => setPicking(null)} onPick={id => { const s = picking; setPicking(null); void run(() => propertySecurityApi.addSubjectPhoto(s.id, id)); }} />}
  </>;
}

function Alerts({ data, cameras, reload }: { data: SightingsOverview; cameras: SecurityDevice[]; reload: () => void }) {
  const [rule, setRule] = useState({ who: '', camera: '', zone: '' });
  const [zoneEdit, setZoneEdit] = useState<{ serial: string; text: string } | null>(null);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); reload(); } catch (e) { setError((e as Error).message || 'That didn’t work.'); } };
  const camName = (serial: string | null) => cameras.find(c => c.serial === serial)?.name || serial || 'any camera';
  const zonesFor = (serial: string) => data.zones.filter(z => z.deviceSerial === serial);
  const zoneChoices = rule.camera ? zonesFor(rule.camera).map(z => z.name) : [...new Set(data.zones.map(z => z.name))];
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!rule.who) return;
    await run(() => propertySecurityApi.createRule({ ...(rule.who === 'stranger' ? { label: 'stranger' as const } : { subjectId: rule.who }), deviceSerial: rule.camera || undefined, zone: rule.zone || undefined }));
    setRule({ who: '', camera: '', zone: '' });
  }
  return <>
    {error && <p className="ps-alert" role="alert">{error}</p>}
    <h4 className="ps-h4">Alerts to your phone</h4>
    <p className="ps-sub">Sent like Athena’s other alerts: only if alerts are on in your settings, and held until quiet hours end.</p>
    {data.rules.length ? <ul className="ps-rules">{data.rules.map(r => <li key={r.id}>
      <Icon name="bell" /><span>When <b>{r.subjectName || (r.label === 'stranger' ? 'a stranger' : 'someone')}</b> is seen {r.deviceSerial ? <>on <b>{camName(r.deviceSerial)}</b></> : 'on any camera'}{r.zone ? <> in <b>{r.zone}</b></> : ''}</span>
      <button className="ps-btn ps-btn-square" aria-label="Remove this alert" onClick={() => void run(() => propertySecurityApi.removeRule(r.id))}><Icon name="trash" /></button>
    </li>)}</ul> : <p className="ps-empty">No alerts yet.</p>}
    <form className="ps-form" onSubmit={e => void add(e)}>
      <label className="ps-field"><span>Tell me when</span><select value={rule.who} onChange={e => setRule({ ...rule, who: e.target.value })}>
        <option value="">Choose…</option>{data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="stranger">A stranger</option>
      </select></label>
      <label className="ps-field"><span>is seen on</span><select value={rule.camera} onChange={e => setRule({ ...rule, camera: e.target.value, zone: '' })}>
        <option value="">Any camera</option>{cameras.map(c => <option key={c.serial} value={c.serial}>{c.name}</option>)}
      </select></label>
      <label className="ps-field"><span>in</span><select value={rule.zone} onChange={e => setRule({ ...rule, zone: e.target.value })} disabled={!zoneChoices.length}>
        <option value="">Anywhere</option>{zoneChoices.map(z => <option key={z} value={z}>{z}</option>)}
      </select></label>
      <button className="ps-btn" type="submit" disabled={!rule.who}><Icon name="plus" />Add alert</button>
    </form>

    <h4 className="ps-h4">Camera zones</h4>
    <p className="ps-sub">Name the areas each camera sees — e.g. “inside the fence” and “outside the back fence” — so Athena can say which one someone was in, and alerts can use them.</p>
    <ul className="ps-zones">{cameras.map(c => {
      const zones = zonesFor(c.serial);
      const editing = zoneEdit?.serial === c.serial;
      return <li key={c.serial}>
        <strong>{c.name}</strong>
        {editing ? <form className="ps-zone-edit" onSubmit={e => { e.preventDefault(); const names = zoneEdit!.text.split(',').map(t => t.trim()).filter(Boolean); setZoneEdit(null); void run(() => propertySecurityApi.setZones(c.serial, names.map(name => ({ name })))); }}>
          <input autoFocus value={zoneEdit!.text} onChange={e => setZoneEdit({ serial: c.serial, text: e.target.value })} placeholder="inside the fence, outside the back fence" aria-label={`Zones for ${c.name}, separated by commas`} />
          <button className="ps-btn" type="submit">Save</button><button className="ps-btn" type="button" onClick={() => setZoneEdit(null)}>Cancel</button>
        </form> : <>
          <span className="ps-zone-chips">{zones.length ? zones.map(z => <em key={z.name} className="ps-tag">{z.name}</em>) : <small>No zones</small>}</span>
          <button className="ps-btn" onClick={() => setZoneEdit({ serial: c.serial, text: zones.map(z => z.name).join(', ') })}>Edit</button>
        </>}
      </li>;
    })}</ul>
  </>;
}

export function SecuritySightings({ enabled, cameras, media }: { enabled: boolean; cameras: SecurityDevice[]; media: SecurityMedia[] }) {
  const [view, setView] = useState<'log' | 'gallery' | 'alerts'>('log');
  const [data, setData] = useState<SightingsOverview | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Sighting | null>(null);
  const [teaching, setTeaching] = useState<Sighting | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => propertySecurityApi.sightings()
    .then(d => { setData(d); setError(''); })
    .catch(() => setError('Sightings are unavailable right now.')), []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);
  return <section className="ps-card ps-sight" aria-label="Sightings">
    <header>
      <span className="ps-tile-icon"><Icon name="eye" /></span>
      <div><h3>Sightings</h3><small>Who and what the cameras saw{data ? ` · kept ${data.retentionDays} days` : ''}</small></div>
      <div className="ps-chips" role="group" aria-label="Sightings view">
        {([['log', 'Log'], ['gallery', 'Gallery'], ['alerts', 'Alerts & zones']] as const).map(([v, l]) =>
          <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{l}{v === 'gallery' && data ? ` (${data.subjects.length})` : ''}</button>)}
      </div>
    </header>
    {error && !data ? <p className="ps-empty" role="alert">{error}</p> : !data ? <p className="ps-empty">Loading sightings…</p>
      : view === 'log' ? <Log data={data} onOpen={setOpen} onTeach={s => { setNotice(''); setTeaching(s); }} notice={notice} />
      : view === 'gallery' ? <Gallery data={data} media={media} reload={() => void load()} />
      : <Alerts data={data} cameras={cameras} reload={() => void load()} />}
    {open && <FrameViewer sighting={open} onClose={() => setOpen(null)} />}
    {teaching && data && <TeachDialog sighting={teaching} data={data} onClose={() => setTeaching(null)} onDone={r => {
      setTeaching(null);
      const rows = r.renamed > 1 ? `${r.renamed} sightings are` : 'That sighting is';
      setNotice(`${rows} now ${r.name}${r.created ? ', added to the Gallery' : ''}. ${r.photoAdded ? 'Its frame is now a reference photo.' : r.photoNote || ''}`.trim());
      void load();
    }} />}
  </section>;
}
