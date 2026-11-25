import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH, HEIGHT, CATCH_Y, newWorld, step, featuresFor, multiplier, owner, athenaTarget } from '../src/components/comet/engine.ts';
import { CONSTELLATIONS, skyFor, finishedBetween, costOf } from '../src/components/comet/constellations.ts';

const rnd = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const calm = () => { const w = newWorld(featuresFor(1)); w.spawnIn = 999; return w; };
const comet = (w, kind, x, y, vy) => { const c = { id: w.nextId++, x, y, vx: 0, vy, kind, r: 12, passed: false, trail: [] }; w.comets.push(c); return c; };
const run = (w, secs, targets = {}) => { const out = []; for (let t = 0; t < secs; t += 0.02) out.push(...step(w, 0.02, rnd(), targets)); return out; };

test('your own colour, caught, is stardust and a combo', () => {
  const w = calm();
  comet(w, 'blue', 500, CATCH_Y.bottom - 30, 300);
  const ev = run(w, 0.3, { bottom: 500 });
  const c = ev.find(e => e.type === 'catch');
  assert.ok(c);
  assert.equal(c.side, 'bottom');
  assert.equal(c.relay, false);
  assert.equal(w.stardust, 1);
  assert.equal(w.combo, 1);
  assert.equal(w.comets.length, 0);
});

test('the other player\'s colour bounces across, and catching the pass is a Relay', () => {
  const w = calm();
  comet(w, 'gold', 500, CATCH_Y.bottom - 20, 400);
  const ev = run(w, 2.5, { bottom: 500, top: 500 });
  assert.ok(ev.some(e => e.type === 'pass' && e.side === 'bottom'));
  const c = ev.find(e => e.type === 'catch');
  assert.ok(c, 'the top player caught it');
  assert.equal(c.side, 'top');
  assert.equal(c.relay, true);
  assert.equal(w.relays, 1);
  assert.equal(w.stardust, 3, 'a relay is worth 1 + 2');
});

test('white comets are anyone\'s; golden ones are worth five', () => {
  assert.equal(owner('white'), null);
  assert.equal(owner('golden'), null);
  const w = calm();
  comet(w, 'golden', 300, CATCH_Y.top + 20, -400);
  run(w, 0.3, { top: 300 });
  assert.equal(w.stardust, 5);
});

test('a miss costs a shield, resets the combo and gives a breather; no shields ends the round', () => {
  const w = calm();
  w.combo = 7;
  comet(w, 'blue', 900, CATCH_Y.bottom - 20, 400);
  const ev = run(w, 0.3, { bottom: 100 });
  assert.ok(ev.some(e => e.type === 'miss'));
  assert.equal(w.combo, 0);
  assert.equal(w.shields, 2);
  assert.ok(w.calmUntil > w.t);
  w.shields = 1;
  comet(w, 'gold', 900, CATCH_Y.top + 20, -400);
  const end = run(w, 0.3, { top: 100 });
  assert.ok(end.some(e => e.type === 'over'));
  assert.equal(w.over, true);
  assert.deepEqual(step(w, 0.02, rnd()), [], 'nothing happens after the end');
});

test('a narrow miss says so close', () => {
  const w = calm();
  comet(w, 'blue', 500 + 75 + 12 + 20, CATCH_Y.bottom - 10, 400);
  const ev = run(w, 0.2, { bottom: 500 });
  assert.ok(ev.some(e => e.type === 'close'));
});

test('the multiplier climbs every five in a row, to five', () => {
  assert.equal(multiplier(0), 1);
  assert.equal(multiplier(4), 1);
  assert.equal(multiplier(5), 2);
  assert.equal(multiplier(99), 5);
});

test('levels add golden, twins and showers in turn', () => {
  assert.deepEqual([featuresFor(1).golden, featuresFor(2).golden, featuresFor(2).twins, featuresFor(3).twins, featuresFor(3).showers, featuresFor(4).showers], [false, true, false, true, false, true]);
});

test('a long round spawns comets that stay in the sky and ends when the shields go', () => {
  const w = newWorld(featuresFor(6));
  const r = rnd(42);
  let over = false;
  for (let i = 0; i < 60 * 300 && !over; i += 1) {
    const ev = step(w, 1 / 60, r, {});
    over = ev.some(e => e.type === 'over');
    for (const c of w.comets) assert.ok(c.y > -50 && c.y < HEIGHT + 50 && c.x > -200 && c.x < WIDTH + 200);
  }
  assert.ok(over, 'nobody catching ends the round');
});

test('Athena catches most comets but not all', () => {
  let caught = 0; let missed = 0;
  for (let seed = 1; seed <= 6; seed += 1) {
    const w = newWorld(featuresFor(1));
    w.shields = 99;
    const r = rnd(seed);
    for (let i = 0; i < 60 * 60; i += 1) {
      const ev = step(w, 1 / 60, r, { top: athenaTarget(w, 'top'), bottom: athenaTarget(w, 'bottom') });
      caught += ev.filter(e => e.type === 'catch').length;
      missed += ev.filter(e => e.type === 'miss').length;
    }
  }
  const rate = caught / (caught + missed);
  assert.ok(rate > 0.6 && rate < 0.97, `catch rate ${rate.toFixed(2)}`);
});

test('the sky lights stars in order and moves on when one is finished', () => {
  assert.deepEqual(skyFor(0), { index: 0, lit: 0, into: 0, need: 12, done: [] });
  assert.equal(skyFor(13).lit, 1);
  const first = costOf(0);
  assert.equal(skyFor(first).index, 1);
  assert.deepEqual(skyFor(first).done, ['big-dipper']);
  assert.deepEqual(finishedBetween(first - 1, first).map(c => c.id), ['big-dipper']);
  assert.deepEqual(finishedBetween(0, 5), []);
  for (const c of CONSTELLATIONS) for (const [a, b] of c.lines) assert.ok(c.stars[a] && c.stars[b], `${c.id} line ${a}-${b}`);
});
