import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * A small, static map: OpenStreetMap tiles with numbered pins and the rings
 * of the places being watched.
 *
 * Deliberately not a mapping library. This draws at most a dozen points on a
 * card and runs inside the Android WebView — a few positioned <img> tiles do
 * that in a fraction of the weight of Leaflet. The maths is plain Web
 * Mercator: the same projection the tiles are cut in.
 *
 * `zoomable` lets the person look closer (owner, 2026-10-15: during an
 * emergency near home they wanted to zoom in on the calls): +/− buttons,
 * pinch, wheel, double-tap and drag to pan, in whole tile zoom steps. It opens
 * at the fitted view and "Fit all" returns there; a different set of points
 * resets it, so a new call is never off-screen behind an old zoom.
 *
 * Tiles come from tile.openstreetmap.org under its usage policy (light use,
 * visible attribution), which a personal app opening a map during an
 * emergency comfortably is.
 */

export interface MapPin {
  latitude: number;
  longitude: number;
  label?: string;
  /** The number drawn in the pin; matches the list beside the map. */
  n?: number;
  serious?: boolean;
}
export interface MapPlace {
  latitude: number;
  longitude: number;
  name: string;
  radiusMiles?: number;
  /** Drawn in the place's marker; a house when not given. */
  icon?: string;
}

const TILE = 256;
const MIN_ZOOM = 8;
const MAX_ZOOM = 16;
const METERS_PER_MILE = 1609.344;
/** How far a person may zoom by hand: out to the region, in to the street. */
const USER_MIN_ZOOM = 5;
const USER_MAX_ZOOM = 18;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where the person has moved the map: a tile zoom and a centre as a 0–1 world fraction. */
interface Camera {
  zoom: number;
  nx: number;
  ny: number;
}

function project(lat: number, lon: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size,
  };
}

/** Pixels per mile at this latitude and zoom. */
function pxPerMile(lat: number, zoom: number) {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return METERS_PER_MILE / metersPerPixel;
}

const valid = (p: { latitude: number; longitude: number }) =>
  Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0);

export function MiniMap({
  pins = [],
  places = [],
  height = 180,
  showRings = true,
  zoomable = false,
  className = '',
}: {
  pins?: MapPin[];
  places?: MapPlace[];
  height?: number;
  showRings?: boolean;
  zoomable?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(120, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // null = the fitted view. Reset whenever the points themselves change (the
  // banner re-polls every minute with equal arrays, so compare by value).
  const [camera, setCamera] = useState<Camera | null>(null);
  const signature = useMemo(
    () => JSON.stringify([pins.map((p) => [p.latitude, p.longitude]), places.map((p) => [p.latitude, p.longitude, p.radiusMiles])]),
    [pins, places]
  );
  useEffect(() => setCamera(null), [signature]);
  const fitRef = useRef<Camera | null>(null);

  const view = useMemo(() => {
    const points = pins.filter(valid);
    const rings = places.filter(valid);
    if (!points.length && !rings.length) return null;

    // Everything that must be visible: every pin, and each ring's full extent
    // (or just its centre when rings are hidden or there are pins to show).
    const extent: { lat: number; lon: number }[] = points.map((p) => ({ lat: p.latitude, lon: p.longitude }));
    for (const r of rings) {
      const miles = showRings && !points.length ? r.radiusMiles || 3 : 0;
      const dLat = miles / 69;
      const dLon = miles / (69 * Math.cos((r.latitude * Math.PI) / 180));
      extent.push({ lat: r.latitude + dLat, lon: r.longitude + dLon }, { lat: r.latitude - dLat, lon: r.longitude - dLon });
    }
    // Pins need room for their height; a ring only needs to clear the edge.
    const pad = points.length ? 28 : 12;
    let zoom = MAX_ZOOM;
    for (; zoom > MIN_ZOOM; zoom--) {
      const xs = extent.map((e) => project(e.lat, e.lon, zoom).x);
      const ys = extent.map((e) => project(e.lat, e.lon, zoom).y);
      if (Math.max(...xs) - Math.min(...xs) <= width - pad * 2 && Math.max(...ys) - Math.min(...ys) <= height - pad * 2) break;
    }
    // A single point would otherwise land at street level with no context.
    if (extent.length === 1) zoom = Math.min(zoom, 14);
    const xs = extent.map((e) => project(e.lat, e.lon, zoom).x);
    const ys = extent.map((e) => project(e.lat, e.lon, zoom).y);
    const fitSize = TILE * 2 ** zoom;
    fitRef.current = {
      zoom,
      nx: (Math.max(...xs) + Math.min(...xs)) / 2 / fitSize,
      ny: (Math.max(...ys) + Math.min(...ys)) / 2 / fitSize,
    };
    const fitted = !camera;
    if (camera) zoom = camera.zoom;
    const { nx, ny } = camera || fitRef.current;
    const cx = nx * TILE * 2 ** zoom;
    const cy = ny * TILE * 2 ** zoom;
    const left = cx - width / 2;
    const top = cy - height / 2;

    const tiles: { key: string; src: string; x: number; y: number }[] = [];
    const max = 2 ** zoom;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        if (ty < 0 || ty >= max) continue;
        const wrapped = ((tx % max) + max) % max;
        tiles.push({ key: `${zoom}/${tx}/${ty}`, src: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
      }
    }
    const at = (lat: number, lon: number) => {
      const p = project(lat, lon, zoom);
      return { x: p.x - left, y: p.y - top };
    };
    return {
      zoom,
      fitted,
      tiles,
      pins: points.map((p) => ({ ...p, ...at(p.latitude, p.longitude) })),
      places: rings.map((r) => ({ ...r, ...at(r.latitude, r.longitude), ring: (r.radiusMiles || 3) * pxPerMile(r.latitude, zoom) })),
    };
  }, [pins, places, width, height, showRings, camera]);

  // Both work from the latest camera through the state updater, so a burst of
  // pointer or wheel events never builds on a stale render.
  const zoomAt = (delta: number, sx = width / 2, sy = height / 2) =>
    setCamera((prev) => {
      const base = prev || fitRef.current;
      if (!base) return prev;
      const z2 = clamp(base.zoom + delta, USER_MIN_ZOOM, USER_MAX_ZOOM);
      if (z2 === base.zoom) return prev;
      const size = TILE * 2 ** base.zoom;
      const size2 = TILE * 2 ** z2;
      // Keep the world point under (sx, sy) where it is.
      const px = base.nx * size - width / 2 + sx;
      const py = base.ny * size - height / 2 + sy;
      return {
        zoom: z2,
        nx: ((px / size) * size2 - sx + width / 2) / size2,
        ny: clamp(((py / size) * size2 - sy + height / 2) / size2, 0, 1),
      };
    });
  const panBy = (dx: number, dy: number) =>
    setCamera((prev) => {
      const base = prev || fitRef.current;
      if (!base) return prev;
      const size = TILE * 2 ** base.zoom;
      return { zoom: base.zoom, nx: base.nx - dx / size, ny: clamp(base.ny - dy / size, 0, 1) };
    });
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;

  // Wheel needs a non-passive listener to keep the page from scrolling under it.
  useEffect(() => {
    const el = ref.current;
    if (!el || !zoomable) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 80) return;
      const box = el.getBoundingClientRect();
      zoomRef.current(acc < 0 ? 1 : -1, e.clientX - box.left, e.clientY - box.top);
      acc = 0;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomable]);

  // One finger drags; two fingers pinch, stepping a zoom level each time the
  // spread grows or shrinks by half again.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const local = (e: ReactPointerEvent | ReactMouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const release = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };
  const onControl = (e: { target: EventTarget }) => !!(e.target as HTMLElement).closest('a,button');
  const gestures = zoomable
    ? {
        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (onControl(e)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, local(e));
          pinch.current = null;
        },
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
          const last = pointers.current.get(e.pointerId);
          if (!last) return;
          const now = local(e);
          pointers.current.set(e.pointerId, now);
          const all = [...pointers.current.values()];
          if (all.length === 1) {
            panBy(now.x - last.x, now.y - last.y);
            return;
          }
          const [a, b] = all;
          const spread = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch.current === null) pinch.current = spread;
          const ratio = spread / pinch.current;
          if (ratio > 1.5 || ratio < 0.67) {
            zoomAt(ratio > 1 ? 1 : -1, (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch.current = spread;
          }
        },
        onPointerUp: release,
        onPointerCancel: release,
        onDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => {
          if (onControl(e)) return;
          const at = local(e);
          zoomAt(1, at.x, at.y);
        },
      }
    : {};
  const control =
    'flex h-8 w-8 items-center justify-center bg-white/90 text-lg font-bold leading-none text-slate-800 shadow hover:bg-white disabled:opacity-40';

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-lg bg-slate-800 ${zoomable ? 'cursor-grab touch-none select-none active:cursor-grabbing' : ''} ${className}`}
      style={{ height }}
      {...gestures}
      role="img"
      aria-label={view ? `Map with ${view.pins.length} call${view.pins.length === 1 ? '' : 's'} and ${view.places.length} watched place${view.places.length === 1 ? '' : 's'}` : 'Map unavailable'}
    >
      {view && (
        <>
          {view.tiles.map((t) => (
            <img key={t.key} src={t.src} alt="" draggable={false} className="absolute max-w-none select-none" style={{ left: t.x, top: t.y, width: TILE, height: TILE }} />
          ))}
          <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
            {showRings &&
              view.places.map((p, i) => (
                <circle key={`ring-${i}`} cx={p.x} cy={p.y} r={p.ring} fill="rgba(59,130,246,0.10)" stroke="rgba(37,99,235,0.8)" strokeWidth={1.5} strokeDasharray="5 4" />
              ))}
          </svg>
          {view.places.map((p, i) => (
            <div key={`place-${i}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} title={p.name}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-[12px] shadow-md">{p.icon || '🏠'}</span>
              <span className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1 text-[10px] font-semibold text-slate-800 shadow">{p.name}</span>
            </div>
          ))}
          {view.pins.map((p, i) => (
            <div key={`pin-${i}`} className="absolute -translate-x-1/2 -translate-y-full" style={{ left: p.x, top: p.y }} title={p.label}>
              <svg width="26" height="34" viewBox="0 0 26 34" aria-hidden>
                <path d="M13 33s12-11.2 12-20A12 12 0 1 0 1 13c0 8.8 12 20 12 20Z" fill={p.serious ? '#b91c1c' : '#ef4444'} stroke="white" strokeWidth="2" />
                <text x="13" y="17.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">{p.n ?? '!'}</text>
              </svg>
            </div>
          ))}
        </>
      )}
      {view && zoomable && (
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md">
          <button type="button" aria-label="Zoom in" className={control} disabled={view.zoom >= USER_MAX_ZOOM} onClick={() => zoomAt(1)}>
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className={`${control} border-t border-slate-300`}
            disabled={view.zoom <= USER_MIN_ZOOM}
            onClick={() => zoomAt(-1)}
          >
            −
          </button>
        </div>
      )}
      {view && zoomable && !view.fitted && (
        <button
          type="button"
          onClick={() => setCamera(null)}
          className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow hover:bg-white"
        >
          Fit all
        </button>
      )}
      {!view && <p className="absolute inset-0 flex items-center justify-center text-xs opacity-60">No location to show</p>}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-0 right-0 rounded-tl bg-white/80 px-1 text-[9px] text-slate-700"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
