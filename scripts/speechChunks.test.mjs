import test from 'node:test';
import assert from 'node:assert/strict';
import { sentences, speechChunks } from '../src/athena/speechChunks.ts';

const words = (n, word = 'word') => Array.from({ length: n }, () => word).join(' ');

test('short replies are voiced whole', () => {
  assert.deepEqual(speechChunks('Sure. It is ten past four.'), ['Sure. It is ten past four.']);
  assert.deepEqual(speechChunks('   '), []);
});

test('the first part is a sentence, and a tiny opener joins the next one', () => {
  const reply =
    'Sure. Your first meeting is the design review at ten, and it runs about an hour. ' +
    'After that you are free until lunch with Sam at noon. ' +
    'The afternoon is clear, so it would be a good time for the run you mentioned yesterday.';
  const parts = speechChunks(reply);
  assert.equal(parts[0], 'Sure. Your first meeting is the design review at ten, and it runs about an hour.');
  assert.ok(parts.length >= 2);
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
