import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadCache, ReadInvalidatedError } from '../src/api/readCache.ts';
import { retryRead } from '../src/api/retryRead.ts';

test('a response invalidated during loading is discarded and fetched again', async () => {
  const cache = new ReadCache();
  let release, calls = 0;
  const result = retryRead(() => cache.get('dashboard', 1000, () => {
    calls++;
    return calls === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve('fresh');
  }), () => true, async () => {});
  cache.clear();
  release('stale');
  assert.equal(await result, 'fresh');
  assert.equal(calls, 2);
});

test('repeated failures stop after three reads', async () => {
  let calls = 0;
  await assert.rejects(retryRead(async () => { calls++; throw new TypeError('offline'); }, () => true, async () => {}), /offline/);
  assert.equal(calls, 3);
});

test('timeouts and temporary API outages recover on a fresh read', async () => {
  for (const error of [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), Object.assign(new Error('unavailable'), { status: 503 })]) {
    let calls = 0;
    const value = await retryRead(async () => { if (++calls === 1) throw error; return 'ready'; }, () => true, async () => {});
    assert.equal(value, 'ready');
    assert.equal(calls, 2);
  }
});

test('authorization failures and inactive screens never retry', async () => {
  for (const status of [401, 403, 400]) {
    let calls = 0;
    await assert.rejects(retryRead(async () => { calls++; throw Object.assign(new Error('denied'), { status }); }, () => true));
    assert.equal(calls, 1);
  }
  let active = true, calls = 0;
  await assert.rejects(retryRead(async () => { calls++; throw new ReadInvalidatedError(); }, () => active,
    async () => { active = false; }), ReadInvalidatedError);
  assert.equal(calls, 1);
});
