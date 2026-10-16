import test from 'node:test';
import assert from 'node:assert/strict';
import { clauseCut, sentences, speechChunks } from '../src/athena/speechChunks.ts';

const words = (n, word = 'word') => Array.from({ length: n }, () => word).join(' ');

test('only a reply of a few words is voiced whole', () => {
  assert.deepEqual(speechChunks('Sure. It is ten past four.'), ['Sure. It is ten past four.']);
  assert.equal(speechChunks('It is ten past four, and the group run starts at five, so there is plenty of time.').length, 2);
  assert.deepEqual(speechChunks('   '), []);
});

test('a long first sentence is cut to its opening clause, and a tiny opener joins it', () => {
  const reply =
    'Sure. Your first meeting is the design review at ten, and it runs about an hour. ' +
    'After that you are free until lunch with Sam at noon. ' +
    'The afternoon is clear, so it would be a good time for the run you mentioned yesterday.';
  const parts = speechChunks(reply);
  assert.equal(parts[0], 'Sure. Your first meeting is the design review at ten,');
  assert.equal(parts[1], 'and it runs about an hour.');
  assert.ok(parts.length >= 3);
  assert.equal(parts.join(' '), reply);
});

test('no words are lost or reordered, and no part is over the server limit', () => {
  const reply = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} has a few words in it!`).join(' ');
  const parts = speechChunks(reply);
  assert.equal(parts.join(' '), reply);
  assert.ok(parts.every((part) => part.length <= 780));
  assert.ok(parts[1].length <= 220, 'the second part stays small');
});

test('a run-on sentence longer than one request is cut at a space', () => {
  const reply = `Okay. ${words(300)}.`;
  const parts = speechChunks(reply);
  assert.ok(parts.every((part) => part.length <= 780));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), reply);
});

test('abbreviations, initials and decimals do not end a sentence', () => {
  assert.deepEqual(sentences('Dr. Smith said 3.5 miles, e.g. the loop by Mt. Hood. J. R. R. Tolkien agreed. Next.'), [
    'Dr. Smith said 3.5 miles, e.g. the loop by Mt. Hood. ',
    'J. R. R. Tolkien agreed. ',
    'Next.',
  ]);
});

test('closing quotes and question marks stay with their sentence', () => {
  assert.deepEqual(sentences('She said "go!" Then what? Nothing.'), ['She said "go!" ', 'Then what? ', 'Nothing.']);
});

test('a short first sentence is left whole', () => {
  const reply = 'Your run is at five, and it is cold out. ' + words(40) + '.';
  assert.equal(speechChunks(reply)[0], 'Your run is at five, and it is cold out.');
});

test('the clause cut prefers punctuation, falls back to a conjunction, and never leaves a scrap', () => {
  const comma = 'The design review moved to Thursday afternoon, which frees up most of your morning.';
  assert.equal(comma.slice(0, clauseCut(comma)), 'The design review moved to Thursday afternoon, ');
  const conjunction = 'The design review moved to Thursday afternoon and that frees up most of your morning tomorrow.';
  assert.equal(conjunction.slice(clauseCut(conjunction)), 'and that frees up most of your morning tomorrow.');
  assert.equal(clauseCut('Okay, ' + words(20) + '.'), -1, 'a two-word opener is too short a part');
  assert.equal(clauseCut(words(30) + ', okay.'), -1, 'past the first stretch, and a scrap after it');
  assert.equal(clauseCut(words(30) + '.'), -1, 'no pause at all');
});
