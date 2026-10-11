import test from 'node:test';
import assert from 'node:assert/strict';
import { isEcho, mightBeHer } from '../src/athena/echo.ts';
import { END_WAIT_MS, UNFINISHED_WAIT_MS, turnWaitMs } from '../src/athena/turnTaking.ts';

const REPLY = "You've got piano lessons at six tonight, and nothing else until tomorrow morning.";

test('her reply heard back is an echo; a real follow-up is not', () => {
  assert.equal(isEcho('piano lessons at six tonight and nothing else until tomorrow', REPLY), true);
  assert.equal(isEcho('can you move piano lessons to seven', REPLY), false);
  // Too short to judge: never an echo for sending purposes.
  assert.equal(isEcho('six tonight', REPLY), false);
});

test('while she talks, a short scrap of her own words does not stop her', () => {
  assert.equal(mightBeHer('six tonight', REPLY), true);
  assert.equal(mightBeHer('piano', REPLY), true);
  assert.equal(mightBeHer('', REPLY), true);
});

test('while she talks, "wait" and real questions do', () => {
  assert.equal(mightBeHer('wait', REPLY), false);
  assert.equal(mightBeHer('hang on', REPLY), false);
  assert.equal(mightBeHer('what about Thursday', REPLY), false);
  assert.equal(mightBeHer('can you move piano lessons to seven', REPLY), false);
});

test('a sentence-like ending is answered quickly', () => {
  assert.equal(turnWaitMs("what's on my calendar tomorrow"), END_WAIT_MS);
  assert.equal(turnWaitMs('thanks.'), END_WAIT_MS);
});

test('a trailing "and", filler or comma waits for the rest', () => {
  for (const text of ['remind me to call Sam and', 'so um', "I was thinking about the,", 'what if we went to the']) {
    assert.equal(turnWaitMs(text), UNFINISHED_WAIT_MS, text);
  }
});
