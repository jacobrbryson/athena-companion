import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { dashboardApi, type Neighbor, type WatchPlace } from '../api/dashboard';
import { MAX_ZOOM, MIN_ZOOM, TILE, fit, metersPerPixel, pan, pxPerMile, project, ringExtent, unproject, zoomAround, type LatLon } from './mapMath';

/**
 * The Community map you can move: drag to pan, wheel / pinch / +− / double-tap
 * to zoom, and every neighbor you know is a marker that becomes the footprint
 * of their house when you zoom in close. Points of interest keep their ring.
 *
 * Still not a mapping library, for the reason MiniMap isn't one: a few
 * positioned <img> tiles and some Web Mercator maths (mapMath.ts) are all it
 * takes, and it runs in the Android WebView. Tiles are OpenStreetMap's, drawn
 * under its usage policy with the attribution visible.
 *
 * Zoomed in to houses, a tap anywhere else drops a pin with "Add resident":
 * the house's address is read from OpenStreetMap (core_api doorToDoor.houseAt)
 * and handed to the caller to open the neighbor form, so the person can go
 * house by house until they know everyone around them.
 */

export interface MapNeighbor { uuid: string; label: string; number: string | null; address: string | null; notes: string | null; people: number; latitude: number; longitude: number }
/** A house picked on the map, for the neighbor form. `address` is null when the map has none for it. */
export interface ResidentDraft { address: string | null; latitude: number; longitude: number; street: string | null; failed: boolean }
export interface MapPlaceItem { uuid: string; name: string; icon: string; latitude: number; longitude: number; radiusMiles: number }

const located = (n: { latitude: number | null; longitude: number | null }): n is { latitude: number; longitude: number } =>
  Number.isFinite(n.latitude) && Number.isFinite(n.longitude) && !(n.latitude === 0 && n.longitude === 0);
const houseNumber = (address: string | null) => /^\s*(\d+[a-z]?)\b/i.exec(address || '')?.[1] ?? null;
const FOOTPRINT_ZOOM = 17;
const LABEL_ZOOM = 16;
const NEIGHBOR = '#22c55e';
const PICKED = '#f59e0b';
const MILES_PER_DEGREE = 69;

/** ", Troutman, NC 28166" from the nearest watched place's address, for an OpenStreetMap address that came without its town. */
function townNear(places: WatchPlace[], lat: number, lon: number) {
  let best: string | null = null;
  let bestMiles = 8;
  for (const p of places) {
    const comma = (p.address || '').indexOf(',');
    if (comma < 0) continue;
    const miles = Math.hypot(p.latitude - lat, (p.longitude - lon) * Math.cos((lat * Math.PI) / 180)) * MILES_PER_DEGREE;
    if (miles < bestMiles) { bestMiles = miles; best = (p.address as string).slice(comma); }
  }
  return best;
}

/** Esri's World Imagery, for the satellite view; its credit replaces OpenStreetMap's while it shows. */
const SATELLITE = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export function NeighborMap({ places, neighbors, icon, onNeighbors, onAddResident, onEditNeighbor, height = 320, satellite = false }: {
  places: WatchPlace[]; neighbors: Neighbor[]; icon: (kind: string) => string;
  onNeighbors?: (neighbors: Neighbor[]) => void; height?: number; satellite?: boolean;
  /** Offered on a tap between markers once the map is zoomed in to houses. */
  onAddResident?: (draft: ResidentDraft) => void;
  onEditNeighbor?: (uuid: string) => void;
}) {
  const shownPlaces = useMemo<MapPlaceItem[]>(() => places.filter(p => p.enabled && located(p)).map(p => ({ uuid: p.uuid, name: p.name, icon: icon(p.kind), latitude: p.latitude, longitude: p.longitude, radiusMiles: p.radiusMiles })), [places, icon]);
  const homes = useMemo<MapNeighbor[]>(() => neighbors.filter(located).map(n => ({
    uuid: n.uuid, label: n.name || (n.address || 'Neighbor').split(',')[0], number: houseNumber(n.address), address: n.address, notes: n.notes, people: n.contacts.length,
    latitude: n.latitude as number, longitude: n.longitude as number,
  })), [neighbors]);
  const unlocated = neighbors.filter(n => !located(n) && n.address);
  // The map's box only exists once there is something to draw in it.
  const present = shownPlaces.length > 0 || homes.length > 0;

  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  const [view, setView] = useState<{ center: LatLon; zoom: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [spot, setSpot] = useState<LatLon | null>(null);
  const [looking, setLooking] = useState(false);
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(160, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [present]);

  /** Everything worth seeing: neighbors if there are any, else each place with its ring. */
  const everything = useCallback((): LatLon[] => {
    const pts: LatLon[] = homes.map(h => ({ lat: h.latitude, lon: h.longitude }));
    for (const p of shownPlaces) pts.push(...(homes.length ? [{ lat: p.latitude, lon: p.longitude }] : ringExtent(p.latitude, p.longitude, p.radiusMiles)));
    return pts;
  }, [homes, shownPlaces]);
  const refit = useCallback(() => { const f = fit(everything(), width, height); if (f) setView(f); }, [everything, width, height]);
  // Frame things once there is something to frame; after that the person is in charge.
  useEffect(() => { if (!view) refit(); }, [view, refit]);

  const zoomBy = useCallback((delta: number, px = width / 2, py = height / 2) => {
    setView(v => v && zoomAround(v.center, v.zoom, v.zoom + delta, px, py, width, height));
  }, [width, height]);

  // The wheel must be a non-passive listener to stop the page scrolling under the map.
  const lastWheel = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel.current < 180) return;
      lastWheel.current = now;
      const r = el.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy, present]);

  // Drag to pan; two fingers to pinch. A press that never moves is a click on whatever is under it.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; pinch: number | null; mid: { x: number; y: number } | null }>({ moved: false, pinch: null, mid: null });
  function down(e: ReactPointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: false, pinch: null, mid: null };
  }
  function move(e: ReactPointerEvent) {
    const held = pointers.current.get(e.pointerId);
    if (!held) return;
    const next = { x: e.clientX, y: e.clientY };
    if (pointers.current.size === 2) {
      // Two fingers: move and pinch together.
      pointers.current.set(e.pointerId, next);
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      const start = g.pinch ?? dist;
      if (g.mid) { const dx = mid.x - g.mid.x; const dy = mid.y - g.mid.y; setView(v => v && { ...v, center: pan(v.center, v.zoom, dx, dy) }); }
      let pinch = start;
      const r = box.current!.getBoundingClientRect();
      if (dist > start * 1.5) { zoomBy(1, mid.x - r.left, mid.y - r.top); pinch = dist; }
      else if (dist < start / 1.5) { zoomBy(-1, mid.x - r.left, mid.y - r.top); pinch = dist; }
      gesture.current = { moved: true, pinch, mid };
      return;
    }
    // One finger belongs to the page (so it can still scroll); the mouse drags the map.
    if (e.pointerType === 'touch') return;
    const dx = next.x - held.x;
    const dy = next.y - held.y;
    if (!gesture.current.moved && Math.hypot(dx, dy) < 4) return;
    if (!gesture.current.moved) { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the drag still works without capture */ } }
    gesture.current.moved = true;
    pointers.current.set(e.pointerId, next);
    setView(v => v && { ...v, center: pan(v.center, v.zoom, dx, dy) });
  }
  function up(e: ReactPointerEvent) { pointers.current.delete(e.pointerId); }

  function key(e: KeyboardEvent) {
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); const [dx, dy] = moves[e.key]; setView(v => v && { ...v, center: pan(v.center, v.zoom, dx, dy) }); }
    else if (e.key === '+' || e.key === '=') zoomBy(1);
    else if (e.key === '-') zoomBy(-1);
  }

  const frame = useMemo(() => {
    if (!view) return null;
    const c = project(view.center.lat, view.center.lon, view.zoom);
    // Whole pixels, or the tiles show hairline seams between them.
    const left = Math.round(c.x - width / 2);
    const top = Math.round(c.y - height / 2);
    const max = 2 ** view.zoom;
    const tiles: { key: string; src: string; x: number; y: number }[] = [];
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        if (ty < 0 || ty >= max) continue;
        const wrapped = ((tx % max) + max) % max;
        tiles.push({ key: `${satellite ? 's' : 'm'}/${view.zoom}/${tx}/${ty}`, src: satellite ? SATELLITE(view.zoom, wrapped, ty) : `https://tile.openstreetmap.org/${view.zoom}/${wrapped}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
      }
    }
    const at = (lat: number, lon: number) => { const p = project(lat, lon, view.zoom); return { x: p.x - left, y: p.y - top }; };
    const margin = 60;
    const inside = (p: { x: number; y: number }) => p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin;
    return {
      left, top,
      tiles,
      places: shownPlaces.map(p => ({ ...p, ...at(p.latitude, p.longitude), ring: p.radiusMiles * pxPerMile(p.latitude, view.zoom) })).filter(inside),
      homes: homes.map(h => ({ ...h, ...at(h.latitude, h.longitude) })).filter(inside),
      mpp: (lat: number) => metersPerPixel(lat, view.zoom),
    };
  }, [view, width, height, shownPlaces, homes, satellite]);

  async function locateThem() {
    setBusy(true); setNote(null);
    let placed = 0;
    let missed = 0;
    let latest: Neighbor[] | null = null;
    for (const n of unlocated) {
      try {
        const m = (await dashboardApi.lookupAddress(n.address as string)).matches[0];
        if (!m) { missed++; continue; }
        latest = (await dashboardApi.saveNeighbor({
          name: n.name, address: n.address, latitude: m.latitude, longitude: m.longitude, placeUuid: n.placeUuid, where: n.where, contact: n.contact, notes: n.notes,
          contacts: n.contacts.map(c => ({ contactId: c.contactId, name: c.name })),
        }, n.uuid)).neighbors;
        placed++;
        onNeighbors?.(latest);
      } catch { missed++; }
    }
    setNote(`${placed ? `Placed ${placed} on the map.` : ''}${missed ? `${placed ? ' ' : ''}${missed} couldn’t be found — edit the address and press Find.` : ''}`.trim() || null);
    setBusy(false);
    if (placed) setView(null);
  }

  /** The house under the pin: its address if the map has one, else the pin itself. A neighbor already there opens instead. */
  async function addResident() {
    if (!spot || !onAddResident) return;
    setLooking(true);
    try {
      const h = await dashboardApi.houseAt(spot.lat, spot.lon);
      setSpot(null);
      if (h.household && onEditNeighbor) { onEditNeighbor(h.household.uuid); return; }
      const address = h.address && !h.address.includes(',') ? `${h.address}${townNear(places, h.latitude, h.longitude) || ''}` : h.address;
      onAddResident({ address, latitude: h.latitude, longitude: h.longitude, street: h.street, failed: false });
    } catch {
      // The form still opens: the person can type the address, and the pin places the house.
      onAddResident({ address: null, latitude: spot.lat, longitude: spot.lon, street: null, failed: true });
      setSpot(null);
    } finally { setLooking(false); }
  }

  const picking = !!onAddResident && (view?.zoom ?? 0) >= FOOTPRINT_ZOOM;
  const chosen = frame?.homes.find(h => h.uuid === picked) || null;
  const pin = frame && spot ? (() => { const p = project(spot.lat, spot.lon, view!.zoom); return { x: p.x - frame.left, y: p.y - frame.top }; })() : null;
  const zoom = view?.zoom ?? 0;
  if (!present) return unlocated.length ? <p className="community-hint">None of your neighbors are on the map yet — <button type="button" className="community-link" disabled={busy} onClick={() => void locateThem()}>{busy ? 'Placing…' : `place ${unlocated.length} from their addresses`}</button>.</p> : null;
  return <div className="community-map-wrap">
    <div
      ref={box}
      className="community-map neighbor-map"
      style={{ height, touchAction: 'pan-x pan-y' }}
      tabIndex={0}
      role="application"
      aria-label={`Community map: ${homes.length} neighbor${homes.length === 1 ? '' : 's'} and ${shownPlaces.length} watched place${shownPlaces.length === 1 ? '' : 's'}. Arrow keys move, plus and minus zoom.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={e => { if (e.key === 'Escape') { setSpot(null); setPicked(null); } else key(e); }}
      onDoubleClick={e => { setSpot(null); const r = box.current!.getBoundingClientRect(); zoomBy(1, e.clientX - r.left, e.clientY - r.top); }}
      onClick={e => {
        if (gesture.current.moved) return;
        setPicked(null);
        if (!picking || !frame || !view) { setSpot(null); return; }
        const r = box.current!.getBoundingClientRect();
        setSpot(unproject(frame.left + e.clientX - r.left, frame.top + e.clientY - r.top, view.zoom));
      }}
    >
      {frame && <>
        {frame.tiles.map(t => <img key={t.key} src={t.src} alt="" draggable={false} className="neighbor-tile" style={{ left: t.x, top: t.y, width: TILE + 1, height: TILE + 1 }} />)}
        <svg className="neighbor-shapes" width="100%" height="100%" aria-hidden>
          {frame.places.filter(p => p.ring < 6000).map(p => <circle key={`ring-${p.uuid}`} cx={p.x} cy={p.y} r={p.ring} fill="rgba(59,130,246,0.10)" stroke="rgba(37,99,235,0.8)" strokeWidth={1.5} strokeDasharray="5 4" />)}
          {zoom >= FOOTPRINT_ZOOM && frame.homes.map(h => {
            // A house is roughly 20 m across; never smaller than a tappable square.
            const side = Math.max(14, 20 / frame.mpp(h.latitude));
            const on = h.uuid === picked;
            return <rect key={`shape-${h.uuid}`} x={h.x - side / 2} y={h.y - side / 2} width={side} height={side} rx={3} fill={on ? 'rgba(245,158,11,0.35)' : 'rgba(34,197,94,0.30)'} stroke={on ? PICKED : NEIGHBOR} strokeWidth={2} />;
          })}
        </svg>
        {frame.places.map(p => <div key={`place-${p.uuid}`} className="neighbor-place" style={{ left: p.x, top: p.y }} title={p.name}>
          <span className="neighbor-place-icon">{p.icon}</span>
          <span className="neighbor-label">{p.name}</span>
        </div>)}
        {frame.homes.map(h => <button
          key={h.uuid} type="button" className="neighbor-marker" style={{ left: h.x, top: h.y, background: h.uuid === picked ? PICKED : NEIGHBOR }}
          aria-label={`${h.label}${h.address ? `, ${h.address.split(',')[0]}` : ''}`}
          onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setSpot(null); setPicked(h.uuid === picked ? null : h.uuid); }}
        >{zoom >= LABEL_ZOOM && <span className="neighbor-label neighbor-label-home">{zoom >= 18 || !h.number ? h.label : h.number}</span>}</button>)}
        {chosen && <div className="neighbor-popup" style={{ left: Math.min(Math.max(chosen.x, 110), width - 110), top: Math.max(chosen.y - 18, 70) }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <strong>{chosen.label}</strong>
          {chosen.address && <small>{chosen.address.split(',')[0]}</small>}
          {chosen.people > 0 && <small>{chosen.people} linked contact{chosen.people === 1 ? '' : 's'}</small>}
          {chosen.notes && <small className="neighbor-popup-notes">{chosen.notes}</small>}
          {onEditNeighbor && <button type="button" className="neighbor-popup-action" onClick={() => { setPicked(null); onEditNeighbor(chosen.uuid); }}>Edit household</button>}
        </div>}
        {pin && <>
          <span className="neighbor-pin" style={{ left: pin.x, top: pin.y }} aria-hidden />
          <div className="neighbor-popup neighbor-menu" role="menu" style={{ left: Math.min(Math.max(pin.x, 90), width - 90), top: Math.max(pin.y - 14, 56) }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
            <button type="button" role="menuitem" className="neighbor-popup-action" disabled={looking} onClick={() => void addResident()}>{looking ? 'Finding the address…' : 'Add resident'}</button>
            <button type="button" role="menuitem" className="neighbor-menu-cancel" disabled={looking} onClick={() => setSpot(null)}>Cancel</button>
          </div>
        </>}
      </>}
      <div className="neighbor-controls" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(1)}>+</button>
        <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-1)}>−</button>
        <button type="button" aria-label="Show everything" title="Show everything" onClick={refit}>⤢</button>
      </div>
      {satellite
        ? <a href="https://www.esri.com/en-us/legal/terms/data-attributions" target="_blank" rel="noreferrer" className="neighbor-credit">Imagery © Esri, Maxar, Earthstar Geographics</a>
        : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="neighbor-credit">© OpenStreetMap</a>}
    </div>
    <small className="community-hint neighbor-legend">
      <span className="neighbor-swatch" aria-hidden /> {homes.length} neighbor{homes.length === 1 ? '' : 's'} on the map — {onAddResident ? (picking ? 'tap a house to add who lives there' : 'zoom in to see each house and add who lives there') : 'zoom in to see each house'}{touch ? '; use two fingers to move the map' : ''}
      {unlocated.length > 0 && <> · {unlocated.length} not placed yet: <button type="button" className="community-link" disabled={busy} onClick={() => void locateThem()}>{busy ? 'Placing…' : 'place them from their addresses'}</button></>}
    </small>
    {note && <small className="community-hint">{note}</small>}
  </div>;
}
