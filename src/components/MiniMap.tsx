import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A small, static map: OpenStreetMap tiles with numbered pins and the rings
 * of the places being watched.
 *
 * Deliberately not a mapping library. This draws at most a dozen points on a
 * card, never pans or zooms, and runs inside the Android WebView — a few
 * positioned <img> tiles do that in a fraction of the weight of Leaflet. The
 * maths is plain Web Mercator: the same projection the tiles are cut in.
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
}

const TILE = 256;
const MIN_ZOOM = 8;
const MAX_ZOOM = 16;
const METERS_PER_MILE = 1609.344;

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
  className = '',
}: {
  pins?: MapPin[];
  places?: MapPlace[];
  height?: number;
  showRings?: boolean;
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
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
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
      tiles,
      pins: points.map((p) => ({ ...p, ...at(p.latitude, p.longitude) })),
      places: rings.map((r) => ({ ...r, ...at(r.latitude, r.longitude), ring: (r.radiusMiles || 3) * pxPerMile(r.latitude, zoom) })),
    };
  }, [pins, places, width, height, showRings]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-lg bg-slate-800 ${className}`}
      style={{ height }}
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
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-[12px] shadow-md">🏠</span>
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
