import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_XP, levels, standing, levelsGained, comboBonus } from '../src/components/games/progress.ts';

const table = levels(['A', 'B', 'C'], { 2: 'unlock two' });

test('the XP table only climbs, and titles repeat the last one past the list', () => {
  for (let i = 1; i < LEVEL_XP.length; i += 1) assert.ok(LEVEL_XP[i] > LEVEL_XP[i - 1]);
  assert.equal(table[0].at, 0);
  assert.equal(table[1].unlock, 'unlock two');
  assert.equal(table.at(-1).title, 'C');
});

test('standing places XP inside a level', () => {
  assert.equal(standing(0, table).level.level, 1);
  assert.equal(standing(59, table).level.level, 1);
  const s = standing(60, table);
  assert.equal(s.level.level, 2);
  assert.equal(s.into, 0);
  assert.equal(s.need, 90);
  assert.equal(standing(-5, table).level.level, 1);
  const top = standing(1e9, table);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
});

test('levelsGained lists every level crossed', () => {
  assert.deepEqual(levelsGained(0, 10, table), []);
  assert.deepEqual(levelsGained(50, 160, table).map(l => l.level), [2, 3]);
  assert.deepEqual(levelsGained(60, 61, table), []);
});

test('combo bonus lands every fifth in a row, capped', () => {
  assert.equal(comboBonus(4), 0);
  assert.equal(comboBonus(5), 5);
  assert.equal(comboBonus(10), 10);
  assert.equal(comboBonus(50), 25);
  assert.equal(comboBonus(0), 0);
});
