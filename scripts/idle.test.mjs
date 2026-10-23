import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// idle.ts listens on window and document; give it both, with timers that
// follow node's (mockable) globals.
mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const win = new EventTarget();
win.setTimeout = (fn, ms) => globalThis.setTimeout(fn, ms);
win.clearTimeout = (id) => globalThis.clearTimeout(id);
globalThis.window = win;
const doc = new EventTarget();
doc.visibilityState = 'visible';
globalThis.document = doc;

const { isIdle, isAway, IDLE_AFTER_MS } = await import('../src/athena/idle.ts');

test('idle only after the full quiet period, awake again on input', () => {
  assert.equal(isIdle(), false);
  mock.timers.tick(IDLE_AFTER_MS - 1000);
  assert.equal(isIdle(), false);

  // Input part-way through restarts the countdown.
  win.dispatchEvent(new Event('pointermove'));
  mock.timers.tick(IDLE_AFTER_MS - 1000);
  assert.equal(isIdle(), false);
  mock.timers.tick(1000);
  assert.equal(isIdle(), true);

  win.dispatchEvent(new Event('keydown'));
  assert.equal(isIdle(), false);
  mock.timers.tick(IDLE_AFTER_MS);
  assert.equal(isIdle(), true);
});

test('coming back to the tab counts as being here', () => {
  assert.equal(isIdle(), true);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(isIdle(), false);
});

test('a hidden tab is away at once, an idle one too', () => {
  assert.equal(isAway(), false);
  doc.visibilityState = 'hidden';
  assert.equal(isAway(), true);
  doc.visibilityState = 'visible';
  assert.equal(isAway(), false);
  mock.timers.tick(IDLE_AFTER_MS);
  assert.equal(isAway(), true);
  win.dispatchEvent(new Event('pointerdown'));
  assert.equal(isAway(), false);
});
