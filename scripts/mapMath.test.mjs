import test from 'node:test';
import assert from 'node:assert/strict';
import { project, unproject, pan, zoomAround, fit, clampZoom, MAX_ZOOM, MIN_ZOOM } from '../src/components/mapMath.ts';

const HOME = { lat: 35.6741, lon: -80.9073 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('project and unproject are inverses', () => {
  const p = project(HOME.lat, HOME.lon, 17);
  const back = unproject(p.x, p.y, 17);
  near(back.lat, HOME.lat); near(back.lon, HOME.lon);
});

test('dragging the map right moves the centre west, and dragging back returns it', () => {
  const moved = pan(HOME, 16, 120, 0);
  assert.ok(moved.lon < HOME.lon);
  const back = pan(moved, 16, -120, 0);
  near(back.lat, HOME.lat); near(back.lon, HOME.lon);
});

test('zooming around a point keeps that point under the cursor', () => {
  const [w, h, px, py] = [600, 300, 450, 80];
  const before = unproject(project(HOME.lat, HOME.lon, 15).x + (px - w / 2), project(HOME.lat, HOME.lon, 15).y + (py - h / 2), 15);
  const out = zoomAround(HOME, 15, 17, px, py, w, h);
  assert.equal(out.zoom, 17);
  const c = project(out.center.lat, out.center.lon, 17);
  const after = unproject(c.x + (px - w / 2), c.y + (py - h / 2), 17);
  near(after.lat, before.lat, 1e-7); near(after.lon, before.lon, 1e-7);
});

test('zoom stays within what the tiles cover', () => {
  assert.equal(clampZoom(40), MAX_ZOOM);
  assert.equal(clampZoom(1), MIN_ZOOM);
  assert.equal(zoomAround(HOME, MAX_ZOOM, MAX_ZOOM + 1, 10, 10, 300, 300).zoom, MAX_ZOOM);
});

test('fit shows every point, zooms in tighter for a close cluster, and stays out of rooftop for one point', () => {
  const street = [HOME, { lat: HOME.lat + 0.0008, lon: HOME.lon + 0.0006 }, { lat: HOME.lat - 0.0006, lon: HOME.lon - 0.0009 }];
  const tight = fit(street, 600, 300);
  const wide = fit([HOME, { lat: HOME.lat + 0.1, lon: HOME.lon + 0.1 }], 600, 300);
  assert.ok(tight.zoom > wide.zoom);
  for (const p of street) {
    const c = project(tight.center.lat, tight.center.lon, tight.zoom);
    const q = project(p.lat, p.lon, tight.zoom);
    assert.ok(Math.abs(q.x - c.x) <= 300 && Math.abs(q.y - c.y) <= 150);
  }
  assert.ok(fit([HOME], 600, 300).zoom <= 15);
  assert.equal(fit([], 600, 300), null);
});
