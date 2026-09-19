import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadCache } from '../src/api/readCache.ts';

test('shares reads and returns independent values until expiry', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const cache = new ReadCache();
  let calls = 0;
  const load = async () => { calls++; return { rows: [calls] }; };
  const [a, b] = await Promise.all([cache.get('a', 100, load), cache.get('a', 100, load)]);
  a.rows.push(99);
  assert.deepEqual(b.rows, [1]);
  assert.deepEqual(await cache.get('a', 100, load), b);
  assert.equal(calls, 1);
  now += 101;
  assert.deepEqual(await cache.get('a', 100, load), { rows: [2] });
});

test('invalidation rejects an old account/request result and preserves a newer flight', async () => {
  const cache = new ReadCache();
  let releaseOld, releaseNew;
  const old = cache.get('a', 100, () => new Promise(resolve => { releaseOld = resolve; }));
  const rejected = assert.rejects(old, /Data changed/);
  cache.clear();
  const fresh = cache.get('a', 100, () => new Promise(resolve => { releaseNew = resolve; }));
  releaseOld('old');
  await rejected;
  const follower = cache.get('a', 100, () => { throw new Error('should share newer flight'); });
  releaseNew('new');
  assert.deepEqual(await Promise.all([fresh, follower]), ['new', 'new']);
});

test('errors are retried; capacity evicts old reads', async () => {
  const cache = new ReadCache();
  await assert.rejects(cache.get('a', 1000, async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await cache.get('a', 1000, async () => 'recovered'), 'recovered');
  for (let i = 0; i < 65; i++) await cache.get(String(i), 1000, async () => i);
  assert.equal(await cache.get('a', 1000, async () => 'evicted'), 'evicted');
});
