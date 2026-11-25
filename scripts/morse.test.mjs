import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MORSE, decode, encode, classify, adapt, check, letterGapMs, settleMs, pickMessages, TIERS, FINAL_MESSAGE, START_DOT_MS,
} from '../src/components/relay/morse.ts';

test('every letter and digit is real International Morse and decodes back', () => {
  assert.equal(Object.keys(MORSE).length, 36);
  assert.equal(MORSE.S, '...');
  assert.equal(MORSE.O, '---');
  assert.equal(MORSE.Q, '--.-');
  assert.equal(MORSE[0], '-----');
  for (const [ch, p] of Object.entries(MORSE)) assert.equal(decode(p), ch);
  assert.equal(new Set(Object.values(MORSE)).size, 36, 'no two characters share a pattern');
  assert.equal(decode('......'), null);
  assert.deepEqual(encode('sos'), ['...', '---', '...']);
});

test('a press shorter than two dot-lengths is a dot', () => {
  assert.equal(classify(100, 170), '.');
  assert.equal(classify(339, 170), '.');
  assert.equal(classify(340, 170), '-');
  assert.equal(classify(600, 170), '-');
});

test('the dot length follows the kid and stays in bounds', () => {
  let dot = START_DOT_MS;
  // A slow, steady kid: 300 ms dots and 900 ms dashes.
  for (let i = 0; i < 30; i++) dot = adapt(dot, i % 2 ? 900 : 300, i % 2 ? '-' : '.');
  assert.ok(Math.abs(dot - 300) < 10, `settled near 300, got ${dot}`);
  assert.equal(classify(300, dot), '.');
  assert.equal(classify(900, dot), '-');
  for (let i = 0; i < 50; i++) dot = adapt(dot, 5, '.');
  assert.equal(dot, 70);
  for (let i = 0; i < 50; i++) dot = adapt(dot, 5000, '-');
  assert.equal(dot, 380);
});

test('a kid gets time to look at the code book between letters', () => {
  assert.ok(letterGapMs(80) >= 750);
  assert.ok(letterGapMs(300) > 300 * 4);
  assert.ok(settleMs(170) < letterGapMs(170));
});

test('a letter in progress is a match, a prefix, or wrong', () => {
  assert.equal(check('..', '...'), 'prefix');
  assert.equal(check('...', '...'), 'match');
  assert.equal(check('.-', '...'), 'wrong');
  assert.equal(check('....', '...'), 'wrong');
});

test('a run asks one word from each tier, then her name', () => {
  const run = pickMessages(() => 0.5);
  assert.equal(run.length, TIERS.length + 1);
  assert.equal(run.at(-1), FINAL_MESSAGE);
  run.slice(0, -1).forEach((w, i) => assert.ok(TIERS[i].includes(w)));
  assert.equal(new Set(run).size, run.length);
  for (const w of TIERS.flat()) assert.equal(encode(w).length, w.length, `${w} is all Morse letters`);
});
