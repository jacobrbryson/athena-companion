import test from 'node:test';
import assert from 'node:assert/strict';
import { EchoGate } from '../src/athena/echoGate.ts';
import { loudestOver, voiceLevels, SILENT_DB } from '../src/athena/voiceLevel.ts';

// 24 kHz mono PCM16: `ms` of a tone at `amp` (0..1), then `ms` of silence.
function clip(ms, amp) {
  const n = (24000 * ms) / 1000;
  const bytes = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin(i / 7) * amp * 32767) & 0xffff;
    bytes[2 * i] = v & 255;
    bytes[2 * i + 1] = v >> 8;
  }
  return Buffer.from(bytes).toString('base64');
}

test('levels follow the clip: loud while she sounds, silent after', () => {
  const levels = voiceLevels(clip(400, 0.3), 24000, 1);
  assert.equal(levels.length, 40);
  assert.ok(levels[5] > -16 && levels[5] < -10, `tone level ${levels[5]}`);
  assert.equal(levels[30], SILENT_DB);
  // The window reaches back over the delay between playing and the mic hearing it.
  assert.ok(loudestOver(levels, 600, 250) > -16);
  assert.equal(loudestOver(levels, 800, 250), SILENT_DB);
});

test('while she is quiet, any voice is you', () => {
  const gate = new EchoGate();
  assert.equal(gate.isYou(-40, SILENT_DB), true);
  assert.equal(gate.isYou(-40, -70), true);
});

test('at first a loud echo is taken for her, not you', () => {
  const gate = new EchoGate();
  // She plays at -20 dBFS; the laptop mic hears her at -32.
  assert.equal(gate.isYou(-32, -20), false);
});

test('it learns a weak echo, and then a normal voice over her counts as you', () => {
  const gate = new EchoGate();
  for (let i = 0; i < 60; i++) gate.learn(-55, -20); // echo canceller leaves -55
  assert.ok(gate.coupling < -30, `coupling ${gate.coupling}`);
  assert.equal(gate.isYou(-55, -20), false, 'her echo is still her');
  assert.equal(gate.isYou(-35, -20), true, 'you talking over her');
});

test('one loud moment does not teach it that her echo is loud', () => {
  const gate = new EchoGate();
  for (let i = 0; i < 60; i++) gate.learn(-55, -20);
  const before = gate.coupling;
  gate.learn(-25, -20);
  assert.ok(gate.coupling - before < 1.5, `moved ${gate.coupling - before} dB`);
});
