/**
 * Web Mercator maths for the interactive Community map: the same projection
 * the OpenStreetMap tiles are cut in. Pure, so the pan/zoom behaviour can be
 * tested without a browser.
 */
export const TILE = 256;
export const MIN_ZOOM = 8;
export const MAX_ZOOM = 19;
const METERS_PER_MILE = 1609.344;

export interface LatLon { lat: number; lon: number }

export function project(lat: number, lon: number, zoom: number) {
  const size = TILE * 2 ** zoom;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * size, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size };
}

export function unproject(x: number, y: number, zoom: number): LatLon {
  const size = TILE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lon: (x / size) * 360 - 180 };
}

export const metersPerPixel = (lat: number, zoom: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
export const pxPerMile = (lat: number, zoom: number) => METERS_PER_MILE / metersPerPixel(lat, zoom);
export const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));

/** The centre after dragging the map by (dx, dy) screen pixels. */
export function pan(center: LatLon, zoom: number, dx: number, dy: number): LatLon {
  const c = project(center.lat, center.lon, zoom);
  return unproject(c.x - dx, c.y - dy, zoom);
}

/**
 * Zoom to `next`, keeping the spot under (px, py) — measured from the map's
 * top-left — where it is, the way every map does it.
 */
export function zoomAround(center: LatLon, zoom: number, next: number, px: number, py: number, width: number, height: number): { center: LatLon; zoom: number } {
  const target = clampZoom(next);
  if (target === zoom) return { center, zoom };
  const c = project(center.lat, center.lon, zoom);
  const spot = unproject(c.x + (px - width / 2), c.y + (py - height / 2), zoom);
  const s = project(spot.lat, spot.lon, target);
  return { center: unproject(s.x - (px - width / 2), s.y - (py - height / 2), target), zoom: target };
}

/** A zoom and centre that show every point (and ring extents, when given) inside the box. */
export function fit(points: LatLon[], width: number, height: number, pad = 28): { center: LatLon; zoom: number } | null {
  if (!points.length) return null;
  let zoom = MAX_ZOOM;
  for (; zoom > MIN_ZOOM; zoom--) {
    const xs = points.map(p => project(p.lat, p.lon, zoom).x);
    const ys = points.map(p => project(p.lat, p.lon, zoom).y);
    if (Math.max(...xs) - Math.min(...xs) <= width - pad * 2 && Math.max(...ys) - Math.min(...ys) <= height - pad * 2) break;
  }
  // One spot would otherwise land at rooftop level with no context around it.
  if (points.length === 1 || new Set(points.map(p => `${p.lat},${p.lon}`)).size === 1) zoom = Math.min(zoom, 15);
  const xs = points.map(p => project(p.lat, p.lon, zoom).x);
  const ys = points.map(p => project(p.lat, p.lon, zoom).y);
  return { zoom, center: unproject((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, zoom) };
}

/** The extent of a ring of `miles` around a point, as two corners. */
export function ringExtent(lat: number, lon: number, miles: number): LatLon[] {
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.cos((lat * Math.PI) / 180));
  return [{ lat: lat + dLat, lon: lon + dLon }, { lat: lat - dLat, lon: lon - dLon }];
}
