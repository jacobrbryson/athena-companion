import test from 'node:test';
import assert from 'node:assert/strict';
import {
  step, fromStep, staffPos, ledgers, freq, levelNotes, pickRound, keyboardRange, SONGS, songsFor, noteKey, mnemonic,
} from '../src/components/piano/notes.ts';

test('notes sit where real sheet music puts them', () => {
  assert.equal(fromStep(step('C4')), 'C4');
  assert.equal(staffPos({ clef: 'treble', note: 'E4' }), 0, 'treble bottom line is E');
  assert.equal(staffPos({ clef: 'treble', note: 'F5' }), 8, 'treble top line is F');
  assert.equal(staffPos({ clef: 'treble', note: 'C4' }), -2, 'middle C is one ledger below treble');
  assert.deepEqual(ledgers({ clef: 'treble', note: 'C4' }), [-2]);
  assert.deepEqual(ledgers({ clef: 'treble', note: 'D4' }), []);
  assert.equal(staffPos({ clef: 'bass', note: 'G2' }), 0, 'bass bottom line is G');
  assert.equal(staffPos({ clef: 'bass', note: 'A3' }), 8, 'bass top line is A');
  assert.deepEqual(ledgers({ clef: 'bass', note: 'C4' }), [10], 'middle C is one ledger above bass');
  assert.ok(mnemonic({ clef: 'treble', note: 'G4' }).includes('Every Good Boy'));
  assert.ok(mnemonic({ clef: 'bass', note: 'C3' }).includes('All Cows'));
});

test('pitches are equal-tempered from A4 = 440', () => {
  assert.equal(freq('A4'), 440);
  assert.ok(Math.abs(freq('C4') - 261.63) < 0.01);
  assert.ok(Math.abs(freq('G2') - 98.0) < 0.01);
});

test('levels add notes, then the bass clef, then both', () => {
  assert.deepEqual(levelNotes(1).map(n => n.note), ['C4', 'D4', 'E4']);
  assert.equal(levelNotes(2).length, 5);
  assert.ok(levelNotes(5).some(n => n.note === 'G5'));
  assert.ok(levelNotes(6).every(n => n.clef === 'bass'));
  const mixed = levelNotes(10);
  assert.ok(mixed.some(n => n.clef === 'bass') && mixed.some(n => n.clef === 'treble'));
});

test('a round never repeats a note back to back and stays in the level', () => {
  const pool = levelNotes(3);
  const keys = new Set(pool.map(noteKey));
  for (const r of [0, 0.4, 0.99]) {
    const round = pickRound(pool, 10, new Set(), () => r);
    assert.equal(round.length, 10);
    round.forEach((n, i) => { assert.ok(keys.has(noteKey(n))); if (i) assert.notEqual(noteKey(n), noteKey(round[i - 1])); });
  }
});

test('the keyboard covers whole octaves around the notes', () => {
  const k = keyboardRange(levelNotes(1));
  assert.equal(k[0], 'C4');
  assert.equal(k.at(-1), 'B4');
  const k5 = keyboardRange(levelNotes(5));
  assert.equal(k5.at(-1), 'B5');
});

test('every song is playable at the level it unlocks, and level 1 has one', () => {
  assert.deepEqual(songsFor(1).map(s => s.id), ['hot-cross-buns']);
  assert.ok(songsFor(3).some(s => s.id === 'twinkle'));
  assert.ok(songsFor(6).some(s => s.clef === 'bass'));
  assert.equal(songsFor(15).length, SONGS.length);
  for (const s of SONGS) for (const [n, b] of s.notes) { assert.match(n, /^[A-G][2-6]$/); assert.ok(b > 0); }
});
