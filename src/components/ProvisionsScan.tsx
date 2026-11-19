import { useEffect, useRef, useState } from 'react';
import { provisionsApi, type KitchenPlace, type SeenItem, type SeenPlace } from '../api/provisions';
import { Drawer, ago } from './Drawer';
import { DrawerButton } from './ActionControls';
import { Icon } from './HealthPage';
import { downscale } from './photoStore';

/**
 * Photo inventory (2026-11-18): photograph the pantry, fridge, freezer or
 * counter and Athena lists what's there. Up to six photos of one place at a
 * time; each is downscaled on the phone, read by the vision model and never
 * kept. A new scan of a place replaces what was seen there before, and any
 * wrong item can be removed. What's seen counts as "have" across Provisions.
 */

export const PLACES: { place: KitchenPlace; label: string; icon: string }[] = [
  { place: 'fridge', label: 'Fridge', icon: 'milk' },
  { place: 'pantry', label: 'Pantry', icon: 'box' },
  { place: 'freezer', label: 'Freezer', icon: 'snow' },
  { place: 'counter', label: 'Counter', icon: 'bowl' },
];
const MAX_PHOTOS = 6;
const labelOf = (place: KitchenPlace) => PLACES.find(p => p.place === place)?.label || place;

/** What each scanned place holds, under the pantry tiles. */
export function SeenPlaces({ places, onScan, onChanged }: { places: SeenPlace[]; onScan: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState<KitchenPlace | null>(null);
  const shown = places.find(p => p.place === open);
  return <div className="prv-seen">
    <div className="prv-seen-row">
      {places.map(p => <button key={p.place} type="button" className={`prv-seen-chip${open === p.place ? ' prv-on' : ''}${p.fresh ? '' : ' prv-stale'}`} aria-expanded={open === p.place}
        onClick={() => setOpen(o => (o === p.place ? null : p.place))} title={p.fresh ? undefined : 'Old photo — take a new one to count it again'}>
        <Icon name={PLACES.find(x => x.place === p.place)?.icon || 'box'} />{labelOf(p.place)} · {p.items.length}<small>{ago(p.scannedAt)}</small>
      </button>)}
      <button type="button" className="prv-seen-chip prv-seen-add" onClick={onScan}><Icon name="camera" />{places.length ? 'Scan' : 'Scan your kitchen'}</button>
    </div>
    {shown && <SeenList items={shown.items} note={shown.fresh ? null : `Seen ${ago(shown.scannedAt)} — too old to count. Take a new photo.`} onChanged={onChanged} />}
  </div>;
}

function SeenList({ items, note, onChanged }: { items: SeenItem[]; note?: string | null; onChanged?: () => void }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  async function remove(uuid: string) {
    setGone(g => new Set(g).add(uuid));
    try { await provisionsApi.removeSeen(uuid); onChanged?.(); } catch { setGone(g => { const n = new Set(g); n.delete(uuid); return n; }); }
  }
  const left = items.filter(i => !gone.has(i.uuid));
  return <>
    {note && <p className="prv-fine">{note}</p>}
    {!left.length ? <p className="hp-empty">Nothing recognised.</p>
      : <ul className="fp-groceries-items prv-seen-items">{left.map(i => <li key={i.uuid}>
        {i.name}{i.amount && <small> · {i.amount}</small>}
        <button type="button" aria-label={`Remove ${i.name}`} title="Not there? Remove it" onClick={() => remove(i.uuid)}>×</button>
      </li>)}</ul>}
  </>;
}

/** Choose the place, add photos, and read them. */
export function ScanDrawer({ initial, onClose, onDone }: { initial?: KitchenPlace; onClose: () => void; onDone: () => void }) {
  const [place, setPlace] = useState<KitchenPlace>(initial || 'fridge');
  const [photos, setPhotos] = useState<{ url: string; imageBase64: string }[]>([]);
  const [busy, setBusy] = useState<'reading' | 'sending' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeenItem[] | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  useEffect(() => () => photos.forEach(p => URL.revokeObjectURL(p.url)), [photos]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy('reading'); setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const next = await Promise.all([...files].slice(0, room).map(async f => {
        const { blob, base64 } = await downscale(f, 1280, 0.82);
        return { url: URL.createObjectURL(blob), imageBase64: base64 };
      }));
      setPhotos(p => [...p, ...next]);
      if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos at a time.`);
    } catch { setError('That photo couldn’t be opened.'); } finally { setBusy(null); }
  }
  async function send() {
    setBusy('sending'); setError(null);
    try {
      const out = await provisionsApi.scan(place, photos.map(p => ({ imageBase64: p.imageBase64, mimeType: 'image/jpeg' })));
      setResult(out.items);
      onDone();
    } catch (e) { setError((e as Error).message || 'Athena couldn’t read those photos. Try again.'); } finally { setBusy(null); }
  }

  return <Drawer eyebrow="PROVISIONS" title={result ? `${labelOf(place)}: what I saw` : 'Scan your kitchen'} onClose={onClose}
    footer={result ? <DrawerButton primary onClick={onClose}>Done</DrawerButton>
      : <div className="prv-scan-actions">
        <DrawerButton onClick={() => camera.current?.click()} disabled={!!busy || photos.length >= MAX_PHOTOS}>{photos.length ? 'Add another photo' : 'Take a photo'}</DrawerButton>
        <DrawerButton primary onClick={send} disabled={!photos.length || !!busy}>{busy === 'sending' ? 'Looking…' : `Inventory ${photos.length || ''} photo${photos.length === 1 ? '' : 's'}`}</DrawerButton>
      </div>}>
    <div className="prv-scan">
      {result ? <>
        <p className="prv-fine">I replaced what I’d seen in your {labelOf(place).toLowerCase()} with these. Tap × on anything that isn’t there. The photos weren’t kept.</p>
        <SeenList items={result} onChanged={onDone} />
      </> : <>
        <p className="prv-scan-label">Where is this?</p>
        <div className="prv-scan-places" role="radiogroup" aria-label="Where the photos were taken">
          {PLACES.map(p => <button key={p.place} type="button" role="radio" aria-checked={place === p.place} className={place === p.place ? 'prv-on' : undefined} onClick={() => setPlace(p.place)}>
            <Icon name={p.icon} />{p.label}
          </button>)}
        </div>
        <p className="prv-scan-label">Photos ({photos.length}/{MAX_PHOTOS})</p>
        <div className="prv-scan-photos">
          {photos.map((p, i) => <figure key={p.url}><img src={p.url} alt={`Photo ${i + 1}`} />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos(ps => ps.filter(x => x !== p))}>×</button></figure>)}
          {photos.length < MAX_PHOTOS && <button type="button" className="prv-scan-add" onClick={() => camera.current?.click()} disabled={!!busy}>
            <Icon name="camera" /><span>{busy === 'reading' ? 'Opening…' : 'Take a photo'}</span></button>}
        </div>
        <button type="button" className="hp-link prv-scan-gallery" onClick={() => gallery.current?.click()} disabled={!!busy}>Or choose photos you already took</button>
        <p className="prv-fine">One shelf or area per photo works best. A new scan of the {labelOf(place).toLowerCase()} replaces what I saw there before. Photos are read, never kept.</p>
        {busy === 'sending' && <p className="prv-fine">Athena is looking through {photos.length === 1 ? 'the photo' : `${photos.length} photos`}…</p>}
      </>}
      {error && <p className="prv-fine prv-error" role="alert">{error}</p>}
    </div>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { void add(e.target.files); e.target.value = ''; }} />
    <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={e => { void add(e.target.files); e.target.value = ''; }} />
  </Drawer>;
}
