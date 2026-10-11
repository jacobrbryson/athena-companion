import { useCallback, useEffect, useRef, useState } from 'react';
import { isAndroidCompanion } from '../native/android';
import { words } from './echo';
import { connectConversationAudio, supportsRecognitionTrack } from './conversationAudio';
import { ConversationEcho } from './conversationEcho';
import { EchoGate } from './echoGate';
import { turnWaitMs } from './turnTaking';
import type { CutOff, Speech } from './useSpeech';
import { getCtor, type SpeechRecognitionLike } from './useVoiceInput';
import { SILENT_DB } from './voiceLevel';

/**
 * Conversation mode: the microphone stays on and you just talk.
 *
 * Three parts, all in the page:
 *
 * - **Hearing a voice** is an energy detector on the microphone (echo
 *   cancelled), against a noise floor it learns. While she talks, it also
 *   knows how loud she is at that moment (useSpeech `now().loudness`) and
 *   only counts sound her echo can't explain (EchoGate). Nothing is sent
 *   while it hears only the room, or only her.
 * - **Words** come from the browser's speech recognizer (in Chrome, Google's
 *   servers), opened when the detector hears you and closed a few seconds
 *   after it stops. Words are only ever sent when a voice that wasn't hers
 *   was heard since the last turn, so a recognizer that heard her, or made a
 *   word out of the dog, sends nothing.
 * - **When you've finished**: after the detector stops hearing you, a short
 *   wait for the words to settle — longer when they end "…and" or "um"
 *   (turnTaking.ts) — without waiting for the recognizer to finalise.
 *
 * Talking over her stops her (`speech.interrupt()`) once you've been heard for
 * BARGE_IN_MS (longer while she sings) AND the recognizer has words that
 * aren't her own sentence. What she had got through rides with your next
 * turn, so she knows where she was cut off.
 *
 * Turns itself off when the tab is hidden and after AUTO_OFF_MS of quiet.
 * Not in the Android app, whose WebView has no speech recognizer — hands-free
 * is the phone's version of this.
 */

const FRAME_MS = 30;
/** Frames of you before it counts as a voice (~90 ms). */
const ONSET_FRAMES = 3;
/** A voice carries on through gaps this short. */
const HANGOVER_MS = 400;
/** The recognizer closes this long after the voice stops. */
const RECOGNIZER_IDLE_MS = 2500;
const AUTO_OFF_MS = 120_000;
const BARGE_IN_MS = 300;
/** A song is harder to interrupt: an "aww" shouldn't end it. */
const BARGE_IN_SONG_MS = 700;
/** How far back her playback can still be arriving at the mic. */
const ECHO_LAG_MS = 250;
/** Above the learned noise floor. */
const MARGIN_DB = 10;
const MIN_VOICE_DB = -50;
const CALIBRATION_FRAMES = 10;
/** A "voice" this long with no words is noise (a fan, music): raise the floor. */
const NOISE_SUSPECT_MS = 8000;
/** Words that stopped arriving this long ago are finished, whatever the detector thinks. */
const STALLED_MS = 2500;
/** Unsettled (interim) words get this long without changing before they're taken as said. */
const SETTLE_MS = 350;
/** A one- or two-word result the recognizer itself doubts is usually noise. */
const MIN_SHORT_CONFIDENCE = 0.5;

export interface Conversation {
  isSupported: boolean;
  active: boolean;
  /** The detector hears you right now. */
  hearing: boolean;
  /** Words so far in the turn being spoken. */
  interim: string;
  error: string | null;
  toggle: () => void;
  stop: () => void;
}

export function useConversation(
  speech: Speech,
  onTurn: (text: string, cutOff: CutOff | null) => void
): Conversation {
  const [isSupported] = useState(
    () => !isAndroidCompanion() && getCtor() !== null && !!navigator.mediaDevices?.getUserMedia
  );
  const [active, setActive] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const speechRef = useRef(speech);
  speechRef.current = speech;
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;
  const runRef = useRef<{ dispose: () => void } | null>(null);
  const startingRef = useRef(false);
  const startGeneration = useRef(0);

  const stop = useCallback(() => {
    startGeneration.current++;
    runRef.current?.dispose();
    runRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const Ctor = getCtor();
    if (runRef.current || startingRef.current || !Ctor) return;
    startingRef.current = true;
    const generation = ++startGeneration.current;
    setError(null);
    if (!supportsRecognitionTrack(navigator.userAgent)) {
      startingRef.current = false;
      setError('Conversation mode with echo control needs desktop Chrome or Edge 135 or newer. You can still type or use the mic button.');
      return;
    }
    // Made inside the tap, or the browser keeps it suspended.
    let audio: AudioContext;
    try { audio = new AudioContext(); } catch {
      startingRef.current = false;
      setError('Audio input is unavailable in this browser.');
      return;
    }
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: { exact: true }, noiseSuppression: true, autoGainControl: false },
      });
      await audio.resume();
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      void audio.close();
      startingRef.current = false;
      if (generation === startGeneration.current) {
        setError('Could not start an echo-cancelled microphone. Check microphone permission and your audio device.');
      }
      return;
    }
    startingRef.current = false;

    if (generation !== startGeneration.current || document.visibilityState === 'hidden') {
      stream.getTracks().forEach((track) => track.stop());
      void audio.close();
      return;
    }

    let input: ReturnType<typeof connectConversationAudio>;
    try { input = connectConversationAudio(audio, stream); } catch {
      stream.getTracks().forEach((track) => track.stop());
      void audio.close();
      setError('Could not connect the echo-controlled microphone.');
      return;
    }
    const { analyser } = input;
    const samples = new Float32Array(analyser.fftSize);
    const gate = new EchoGate();
    const echo = new ConversationEcho();

    let disposed = false;
    let frames = 0;
    let floor = -60;
    let above = 0;
    let voiced = false;
    let onsetAt = 0;
    let lastVoiceAt = 0;
    let lastActivityAt = Date.now();
    let lastResultAt = 0;
    // Frames of a voice that wasn't hers since the last turn was sent.
    let heardYou = 0;
    let recognition: SpeechRecognitionLike | null = null;
    // This recognizer's results below this index are already sent (or dropped).
    let consumed = 0;
    let resultCount = 0;
    let finals = '';
    let live = '';
    let commitTimer: number | undefined;
    let cutOff: CutOff | null = null;

    const show = () => setInterim(`${finals} ${live}`.trim());

    const commit = () => {
      window.clearTimeout(commitTimer);
      commitTimer = undefined;
      const text = `${finals} ${live}`.trim();
      const you = heardYou >= ONSET_FRAMES;
      finals = '';
      live = '';
      heardYou = 0;
      // Whatever the recognizer has so far is spoken for, even if it
      // finalises it later.
      consumed = resultCount;
      show();
      if (!text) return;
      // Words with no voice of yours behind them: her, or noise made into a word.
      if (!you) return;
      // Her own reply, come back through the speakers: not a turn.
      if (echo.rejects(text, Date.now(), onsetAt, !!speechRef.current.now())) return;
      // End this recognition session before the answer starts. Late results
      // from it must never borrow voice evidence from the next turn.
      const old = recognition;
      recognition = null;
      try { old?.abort(); } catch { /* already ended */ }
      const cut = cutOff;
      cutOff = null;
      onTurnRef.current(text, cut);
    };

    const scheduleCommit = () => {
      window.clearTimeout(commitTimer);
      commitTimer = undefined;
      const text = `${finals} ${live}`.trim();
      if (!text || voiced) return;
      const wait = live ? Math.max(turnWaitMs(text), SETTLE_MS) : turnWaitMs(text);
      commitTimer = window.setTimeout(commit, wait);
    };

    const tryBargeIn = () => {
      const her = speechRef.current.now();
      if (!her || !voiced) return;
      if (Date.now() - onsetAt < (her.singing ? BARGE_IN_SONG_MS : BARGE_IN_MS)) return;
      const heard = `${finals} ${live}`.trim();
      if (!heard || echo.rejects(heard, Date.now(), onsetAt, true)) return;
      const cut = speechRef.current.interrupt();
      if (cut) cutOff = cut;
    };

    const listen = () => {
      if (recognition || disposed) return;
      const r = new Ctor();
      r.lang = navigator.language || 'en-US';
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      consumed = 0;
      resultCount = 0;
      r.onresult = (event: any) => {
        if (recognition !== r) return;
        resultCount = event.results.length;
        let partial = '';
        const herNow = speechRef.current.now();
        if (herNow) echo.observe(herNow.text, herNow.loudness(ECHO_LAG_MS), Date.now());
        for (let i = Math.max(event.resultIndex, consumed); i < event.results.length; i++) {
          const result = event.results[i];
          const text: string = result[0]?.transcript ?? '';
          // Apply the same gate to interim words: they can be committed or
          // interrupt her before the recognizer ever marks them final.
          if (echo.rejects(text, Date.now(), onsetAt, !!herNow)) {
            if (result.isFinal) consumed = i + 1;
            continue;
          }
          if (!result.isFinal) {
            partial += text;
            continue;
          }
          consumed = i + 1;
          const confidence: number = result[0]?.confidence ?? 0;
          // "okay" out of a dog's bark: short, and the recognizer itself unsure.
          if (confidence > 0 && confidence < MIN_SHORT_CONFIDENCE && words(text).length <= 2) continue;
          // Her own voice through the speakers, transcribed while she talks.
          finals = `${finals} ${text}`.trim();
        }
        live = partial.trim();
        lastResultAt = lastActivityAt = Date.now();
        show();
        tryBargeIn();
        scheduleCommit();
      };
      r.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Microphone access was blocked.');
          stop();
        } else if (event.error === 'network') {
          setError("Couldn't reach speech recognition. Check your connection.");
        }
        // 'no-speech' and 'aborted' are ordinary here.
      };
      r.onend = () => {
        if (recognition !== r) return;
        recognition = null;
        // Words still in flight when it closed are as final as they'll get.
        if (live.trim()) {
          finals = `${finals} ${live}`.trim();
          live = '';
        }
        if (disposed) return;
        scheduleCommit();
        if (voiced) listen();
      };
      try {
        recognition = r;
        r.start(input.track);
      } catch (err) {
        recognition = null;
        console.warn('useConversation: recognizer did not start', err);
        setError('Speech recognition could not use the echo-controlled microphone. Try current desktop Chrome or Edge.');
        stop();
      }
    };

    const rest = () => {
      try {
        recognition?.stop();
      } catch {
        /* already stopping */
      }
    };

    const tick = () => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const db = 10 * Math.log10(sum / samples.length + 1e-12);
      const now = Date.now();
      const her = speechRef.current.now();
      if (her) echo.observe(her.text, her.loudness(ECHO_LAG_MS), now);
      const herDb = Math.max(her ? her.loudness(ECHO_LAG_MS) : SILENT_DB, echo.level(now));

      // The first few frames only learn the room.
      if (frames < CALIBRATION_FRAMES && herDb <= SILENT_DB && !voiced) {
        input.allowRecognition(false);
        floor = frames === 0 ? db : floor + (db - floor) / (frames + 1);
        frames++;
        return;
      }

      const line = Math.max(floor + MARGIN_DB, MIN_VOICE_DB);
      const you = db > line && gate.isYou(db, herDb);
      input.allowRecognition(herDb <= SILENT_DB || you);
      if (her && !you) gate.learn(db, herDb);
      if (you) {
        above++;
        if (above >= ONSET_FRAMES) {
          heardYou = Math.max(heardYou, above);
          if (!voiced) {
            voiced = true;
            onsetAt = now - (ONSET_FRAMES - 1) * FRAME_MS;
            setHearing(true);
            window.clearTimeout(commitTimer);
            commitTimer = undefined;
            listen();
          }
          lastVoiceAt = lastActivityAt = now;
        }
      } else {
        above = 0;
        // Learn the room only when nobody, her included, is talking.
        if (!voiced && herDb <= SILENT_DB) floor += (db - floor) * (db < floor ? 0.2 : 0.01);
      }

      if (voiced && now - lastVoiceAt > HANGOVER_MS) {
        voiced = false;
        setHearing(false);
        scheduleCommit();
      }
      if (voiced) {
        tryBargeIn();
        // Steady noise the recognizer finds no words in: it's the room.
        if (now - onsetAt > NOISE_SUSPECT_MS && now - Math.max(lastResultAt, onsetAt) > NOISE_SUSPECT_MS / 2) {
          floor += 3;
          onsetAt = now;
        }
      }
      if (!voiced && recognition && !finals && !live && now - lastVoiceAt > RECOGNIZER_IDLE_MS) rest();
      if ((finals || live) && !voiced && lastResultAt && now - lastResultAt > STALLED_MS) commit();
      if (!her && now - lastActivityAt > AUTO_OFF_MS) stop();
    };

    const timer = window.setInterval(tick, FRAME_MS);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onHidden);

    runRef.current = {
      dispose: () => {
        disposed = true;
        window.clearInterval(timer);
        window.clearTimeout(commitTimer);
        document.removeEventListener('visibilitychange', onHidden);
        const r = recognition;
        recognition = null;
        try {
          r?.stop();
        } catch {
          /* already stopped */
        }
        stream.getTracks().forEach((track) => track.stop());
        input.dispose();
        void audio.close();
        setActive(false);
        setHearing(false);
        setInterim('');
      },
    };
    setActive(true);
  }, [stop]);

  const toggle = useCallback(() => {
    if (runRef.current || startingRef.current) stop();
    else void start();
  }, [start, stop]);

  useEffect(() => () => stop(), [stop]);

  return { isSupported, active, hearing, interim, error, toggle, stop };
}
