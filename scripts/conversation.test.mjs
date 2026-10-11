import test from 'node:test';
import './conversationRuntime.test.mjs';
import assert from 'node:assert/strict';
import { isEcho, mightBeHer } from '../src/athena/echo.ts';
import { END_WAIT_MS, UNFINISHED_WAIT_MS, turnWaitMs } from '../src/athena/turnTaking.ts';
import { connectConversationAudio, supportsRecognitionTrack } from '../src/athena/conversationAudio.ts';
import { ConversationEcho, ECHO_TAIL_MS } from '../src/athena/conversationEcho.ts';
import { SILENT_DB } from '../src/athena/voiceLevel.ts';

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

test('short echo captured during playback is rejected even when delivered after it ends', () => {
  const echo = new ConversationEcho();
  echo.observe(REPLY, -20, 1000);
  assert.equal(echo.rejects('six tonight', 1800, 900, false), true);
  assert.equal(echo.rejects('piano', 1800, 900, false), true);
  assert.equal(echo.rejects('wait', 1100, 900, true), false);
  assert.equal(echo.rejects('hang on', 1100, 900, true), false);
});

test('new short follow-ups are allowed even when they reuse her words', () => {
  const echo = new ConversationEcho();
  echo.observe('Yes, we can do that. No problem.', -20, 1000);
  for (const text of ['yes', 'no', 'we can', 'and tomorrow?']) {
    assert.equal(echo.rejects(text, 1700, 1600, false), false, text);
  }
});

test('a delayed filler echo is rejected after another clip takes the voice', () => {
  const echo = new ConversationEcho();
  echo.observe('Let me check your calendar.', -20, 1000);
  echo.observe(REPLY, -20, 2000);
  assert.equal(echo.rejects('let me check your calendar', 2200, 1900, true), true);
  assert.equal(echo.rejects('six tonight', 2200, 1900, true), true);
  assert.equal(echo.rejects('what about Thursday', 2200, 1900, true), false);
  assert.equal(echo.rejects('let me check your calendar', 17000, 16900, false), false);
});

test('the acoustic tail survives end or interruption, then expires', () => {
  const echo = new ConversationEcho();
  echo.observe(REPLY, -20, 1000);
  assert.equal(echo.level(1000 + ECHO_TAIL_MS), -20);
  assert.equal(echo.level(1001 + ECHO_TAIL_MS), SILENT_DB);
  echo.observe(REPLY, SILENT_DB, 2000);
  assert.equal(echo.level(2000), SILENT_DB, 'generation gaps do not extend the sound');
});

test('recognition gating keeps the detector live and cleans up the generated track', () => {
  const node = () => ({ connections: [], connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; } });
  const source = node(), analyser = node(), gain = { ...node(), gain: { value: 1 } };
  const track = { stop() { this.stopped = true; } };
  const output = { ...node(), stream: { getAudioTracks: () => [track], getTracks: () => [track] } };
  const audio = {
    createMediaStreamSource: () => source, createAnalyser: () => analyser,
    createGain: () => gain, createMediaStreamDestination: () => output,
  };
  const input = connectConversationAudio(audio, {});
  assert.equal(input.track, track);
  assert.deepEqual(source.connections, [analyser, gain]);
  assert.deepEqual(gain.connections, [output]);
  input.allowRecognition(false);
  assert.equal(gain.gain.value, 0);
  assert.equal(analyser.disconnected, undefined, 'human interruption detection stays connected');
  input.allowRecognition(true);
  assert.equal(gain.gain.value, 1);
  input.dispose();
  assert.equal(track.stopped, true);
  assert.equal(source.disconnected, true);
});

test('engines that ignore the audioTrack argument are not treated as supported', () => {
  assert.equal(supportsRecognitionTrack('Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36'), true);
  assert.equal(supportsRecognitionTrack('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'), true);
  assert.equal(supportsRecognitionTrack('Mozilla/5.0 Chrome/134.0.0.0 Safari/537.36'), false);
  assert.equal(supportsRecognitionTrack('Mozilla/5.0 Version/18.0 Safari/605.1.15'), false);
  assert.equal(supportsRecognitionTrack('Mozilla/5.0 (Android) Chrome/140.0.0.0'), false);
});
