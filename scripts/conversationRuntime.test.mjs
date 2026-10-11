import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ts from 'typescript';

// Compile the real hook and its dependencies in memory. React's server renderer
// supplies the hooks; audio, recognition and time are controlled below. This
// exercises event ordering without recording anyone or needing an ASR provider.
const compiled = new Map();
async function moduleUrl(url) {
  if (compiled.has(url.href)) return compiled.get(url.href);
  const pending = (async () => {
    const source = await readFile(url, 'utf8');
    let code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
    }).outputText;
    const imports = [...code.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)];
    for (const match of imports) {
      const specifier = match[2];
      const replacement = specifier === 'react'
        ? new URL(`../node_modules/react/index.js`, import.meta.url).href
        : await moduleUrl(new URL(specifier.endsWith('.ts') ? specifier : `${specifier}.ts`, url));
      code = code.replace(match[0], `from '${replacement}'`);
    }
    code += `\n//# sourceURL=${url.href}\n`;
    return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  })();
  compiled.set(url.href, pending);
  return pending;
}
const { useConversation } = await import(await moduleUrl(new URL('../src/athena/useConversation.ts', import.meta.url)));
const { useVoiceInput } = await import(await moduleUrl(new URL('../src/athena/useVoiceInput.ts', import.meta.url)));

function setup(t) {
  let now = 1000, id = 0, micDb = -70, currentSpeech = null, interruptions = 0;
  const timers = new Map(), recognizers = [], turns = [], contexts = [];
  let conversation;
  const restore = [];
  t.after(() => {
    conversation?.stop();
    restore.forEach((fn) => fn());
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const microphone = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [microphone] };
  let getUserMedia = async () => stream;
  const schedule = (fn, ms, repeat = false) => {
    timers.set(++id, { fn, at: now + ms, ms, repeat });
    return id;
  };
  class Audio {
    constructor() { contexts.push(this); }
    async resume() {}
    async close() { this.closed = true; }
    createMediaStreamSource() { return node(); }
    createAnalyser() {
      return { ...node(), getFloatTimeDomainData(samples) { samples.fill(10 ** (micDb / 20)); } };
    }
    createGain() { return this.gain = { ...node(), gain: { value: 1 } }; }
    createMediaStreamDestination() {
      this.track = { stopped: false, stop() { this.stopped = true; } };
      return { ...node(), stream: { getAudioTracks: () => [this.track], getTracks: () => [this.track] } };
    }
  }
  class Recognition {
    constructor() { recognizers.push(this); this.results = []; }
    start(track) { this.track = track; }
    abort() { this.aborted = true; }
    stop() { this.onend?.(); }
    emit(text, final = false) {
      let index = this.results.length;
      if (index && !this.results[index - 1].isFinal) index--;
      this.results[index] = { 0: { transcript: text, confidence: 0.99 }, isFinal: final };
      this.onresult?.({ resultIndex: index, results: this.results });
    }
  }
  const replacements = {
    window: {
      SpeechRecognition: Recognition,
      setTimeout: (fn, ms) => schedule(fn, ms), clearTimeout: (key) => timers.delete(key),
      setInterval: (fn, ms) => schedule(fn, ms, true), clearInterval: (key) => timers.delete(key),
    },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    navigator: {
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', language: 'en-US',
      mediaDevices: { getUserMedia: (...args) => getUserMedia(...args) },
    },
    AudioContext: Audio,
  };
  for (const [name, value] of Object.entries(replacements)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    restore.push(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  t.mock.method(Date, 'now', () => now);
  const speech = {
    now: () => currentSpeech,
    interrupt: () => { interruptions++; currentSpeech = null; return { heard: 'Her introduction', singing: false }; },
  };
  renderToString(React.createElement(() => {
    conversation = useConversation(speech, (text, cut) => turns.push({ text, cut }));
    return null;
  }));
  const advance = (ms) => {
    const until = now + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      const [key, timer] = next;
      now = timer.at;
      if (timer.repeat) timer.at += timer.ms;
      else timers.delete(key);
      timer.fn();
    }
    now = until;
  };
  const flush = async () => { await new Promise(setImmediate); };
  return {
    conversation, turns, recognizers, contexts, microphone, advance, flush,
    setMic: (db) => { micDb = db; },
    speak: (text) => { currentSpeech = { text, singing: false, loudness: () => -20 }; },
    quiet: () => { currentSpeech = null; },
    setGetUserMedia: (fn) => { getUserMedia = fn; },
    interruptions: () => interruptions,
    async start() { conversation.toggle(); await flush(); advance(300); },
    voiceHook(onStart) {
      let voice;
      renderToString(React.createElement(() => {
        voice = useVoiceInput((text) => turns.push({ text }), onStart);
        return null;
      }));
      return voice;
    },
  };
}

test('runtime: echo is silenced for recognition while the detector remains ready', async (t) => {
  const h = setup(t);
  await h.start();
  h.speak('Your meeting is at six tonight.');
  h.setMic(-35);
  h.advance(600);
  assert.equal(h.contexts[0].gain.gain.value, 0);
  assert.equal(h.recognizers.length, 0);
  assert.equal(h.interruptions(), 0);
  assert.deepEqual(h.turns, []);
});

test('runtime: a human can interrupt and the turn carries the cut-off context', async (t) => {
  const h = setup(t);
  await h.start();
  h.speak('Your meeting is at six tonight.');
  h.setMic(-18);
  h.advance(120);
  const r = h.recognizers[0];
  assert.equal(r.track, h.contexts[0].track, 'ASR uses the processed track');
  r.emit('wait', false);
  h.advance(330);
  assert.equal(h.interruptions(), 1);
  h.setMic(-70);
  h.advance(900);
  assert.deepEqual(h.turns, [{ text: 'wait', cut: { heard: 'Her introduction', singing: false } }]);
  assert.equal(r.aborted, true);
  r.emit('Your meeting is at six tonight.', true);
  h.advance(900);
  assert.equal(h.turns.length, 1, 'late callbacks from the completed turn are ignored');
});

test('runtime: interim and delayed final short echoes cannot interrupt or become a turn', async (t) => {
  const h = setup(t);
  await h.start();
  h.speak('Your meeting is at six tonight.');
  // Deliberately exceed the loudness gate to exercise the text defence.
  h.setMic(-18);
  h.advance(120);
  const r = h.recognizers[0];
  r.emit('six tonight', false);
  h.advance(400);
  assert.equal(h.interruptions(), 0);
  h.quiet();
  h.setMic(-70);
  h.advance(700);
  r.emit('six tonight', true);
  h.advance(900);
  assert.deepEqual(h.turns, []);
});

test('runtime: a new yes after playback is accepted even when Athena said yes', async (t) => {
  const h = setup(t);
  await h.start();
  h.speak('Yes, that is correct.');
  h.setMic(-55); // browser AEC leaves only a weak echo
  h.advance(600);
  h.quiet();
  // Start immediately, inside the acoustic-tail window.
  h.setMic(-30);
  h.advance(120);
  h.recognizers[0].emit('yes', true);
  h.setMic(-70);
  h.advance(900);
  assert.deepEqual(h.turns, [{ text: 'yes', cut: null }]);
});

test('runtime: stopping releases both microphone and recognition tracks', async (t) => {
  const h = setup(t);
  await h.start();
  h.setMic(-30);
  h.advance(120);
  const r = h.recognizers[0];
  h.conversation.stop();
  assert.equal(h.microphone.stopped, true);
  assert.equal(h.contexts[0].track.stopped, true);
  assert.equal(h.contexts[0].closed, true);
  r.emit('A result delivered after stop', true);
  h.advance(1000);
  assert.deepEqual(h.turns, []);
});

test('runtime: stop during a permission prompt releases the eventual microphone', async (t) => {
  const h = setup(t);
  let grant;
  h.setGetUserMedia(() => new Promise((resolve) => { grant = resolve; }));
  h.conversation.toggle();
  h.conversation.stop();
  grant({ getTracks: () => [h.microphone] });
  await h.flush();
  assert.equal(h.microphone.stopped, true);
  assert.equal(h.contexts[0].closed, true);
  assert.equal(h.contexts[0].track, undefined);
});

test('runtime: one-shot mic stops playback, delivers once, and ignores stopped sessions', (t) => {
  const h = setup(t);
  let stoppedSpeech = 0;
  const voice = h.voiceHook(() => { stoppedSpeech++; });
  voice.toggle();
  assert.equal(stoppedSpeech, 1);
  const first = h.recognizers[0];
  first.emit('Hello Athena', true);
  assert.equal(first.aborted, true);
  first.emit('Her answer heard back', true);
  assert.deepEqual(h.turns, [{ text: 'Hello Athena' }]);
  voice.toggle();
  const second = h.recognizers[1];
  voice.stop();
  second.emit('A late final', true);
  assert.equal(h.turns.length, 1);
});
