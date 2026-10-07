import test from 'node:test';
import assert from 'node:assert/strict';
import { houseKey, withMarks, progress, afterSend } from '../src/components/doorMarks.ts';

const door = (address, status = 'todo') => ({ address, status, note: null, checkedAt: null, household: null });
const round = () => ({ uuid: 'r', street: 'Rushing Water Lane', placeUuid: null, source: 'osm', createdAt: '2026-10-06T00:00:00Z', closedAt: null, doors: [door('148 Rushing Water Lane'), door('150 Rushing Water Lane'), door('152 Rushing Water Lane')] });
const mark = (address, status, at, note = null) => ({ address, status, note, at });

test('a house is the same however it was typed', () => {
  assert.equal(houseKey('148 Rushing Water Lane, Troutman'), houseKey('148 RUSHING WATER LN'));
  assert.notEqual(houseKey('148 Rushing Water Lane'), houseKey('150 Rushing Water Lane'));
});

test('marks show on the round at once, and the latest mark for a house wins', () => {
  const out = withMarks(round(), [
    mark('148 Rushing Water Ln', 'no_answer', '2026-10-06T20:00:00Z'),
    mark('148 Rushing Water Lane', 'safe', '2026-10-06T20:30:00Z', 'dog barking, waved'),
    mark('150 Rushing Water Lane', 'needs_help', '2026-10-06T20:10:00Z', 'power out, elderly'),
  ]);
  assert.equal(out.doors[0].status, 'safe');
  assert.equal(out.doors[0].note, 'dog barking, waved');
  assert.equal(out.doors[1].status, 'needs_help');
  assert.equal(out.doors[2].status, 'todo');
});

test('an older queued mark never beats a newer one', () => {
  const out = withMarks(round(), [mark('148 Rushing Water Lane', 'safe', '2026-10-06T21:00:00Z'), mark('148 Rushing Water Lane', 'no_answer', '2026-10-06T20:00:00Z')]);
  assert.equal(out.doors[0].status, 'safe');
});

test('marking a house back to to-check clears it', () => {
  const out = withMarks(withMarks(round(), [mark('148 Rushing Water Lane', 'safe', '2026-10-06T20:00:00Z')]), [mark('148 Rushing Water Lane', 'todo', '2026-10-06T20:05:00Z')]);
  assert.equal(out.doors[0].status, 'todo');
  assert.equal(out.doors[0].checkedAt, null);
});

test('progress counts checked doors and lists who needs help', () => {
  const p = progress(withMarks(round(), [mark('148 Rushing Water Lane', 'safe', '2026-10-06T20:00:00Z'), mark('150 Rushing Water Lane', 'needs_help', '2026-10-06T20:01:00Z')]));
  assert.deepEqual({ total: p.total, checked: p.checked, left: p.left }, { total: 3, checked: 2, left: 1 });
  assert.deepEqual(p.needsHelp.map(d => d.address), ['150 Rushing Water Lane']);
});

test('after a send, only marks that were not sent stay queued', () => {
  const a = mark('148 Rushing Water Lane', 'safe', '2026-10-06T20:00:00Z');
  const b = mark('150 Rushing Water Lane', 'safe', '2026-10-06T20:01:00Z');
  const later = mark('148 Rushing Water Lane', 'needs_help', '2026-10-06T20:02:00Z');
  assert.deepEqual(afterSend([a, b, later], [a, b]), [later]);
  assert.deepEqual(afterSend([a], []), [a]);
});
