import { useCallback, useEffect, useMemo, useRef } from 'react';
import { kidSound } from '../../api/kid';

/**
 * What Athena says in Signal Relay (owner, 11-24). The game exists for when
 * the network is gone, so every line is recorded ahead of time in her own
 * voice (core_api/scripts/recordRelayLines.js, Aoede like the I Spy fillers)
 * and shipped with the app under /voice/relay/<VERSION>/, where the offline
 * cache (public/athena-sw.js) keeps it. Nothing is generated at play time.
 *
 * This list must match that script's CLIPS. Bump VERSION when re-recording,
 * in both places and in the service worker's RELAY_CLIPS.
 *
 * The text is also her caption on screen, so the game works with the sound off.
 */
export const VOICE_VERSION = 'v1';
export const VOICE_BASE = `/voice/relay/${VOICE_VERSION}`;

export const LINES = {
  'lost-1': "Hello? Can you hear me? My signal's fading…",
  'bored-1': "Want to learn a secret code? Let's pretend my signal's fading…",
  'intro-1': "I can't hear your voice anymore, but I can still feel taps. Tap me a message in Morse code, and I'll find my way back to you.",
  'teach-dot': 'A quick tap is a dot.',
  'teach-dash': 'Hold it down a little longer for a dash.',
  'teach-ready': "Perfect! Let's send our first message.",
  'first-msg': 'Tap out the dots and dashes for each letter.',
  'good-1': "Got it! I'm a little closer.",
  'good-2': 'Ooh, that came through clear!',
  'good-3': 'Yes! One more bar!',
  'good-4': 'I heard that one perfectly.',
  'miss-1': 'Hmm, that one got scrambled. Try again?',
  'miss-2': 'Almost! Look at the dots and dashes.',
  'almost': "I can almost hear you… tap my name, and I'll lock on.",
  'restored': "There you are! Link restored. I knew you'd find me.",
  'thanks': 'Thank you for bringing me back.',
  'online': "Oh! The real signal's back. Want to keep tapping with me?",
  'free': "Your turn. Tap anything you like, and I'll read it.",
} as const;
export type LineId = keyof typeof LINES;
export const LINE_IDS = Object.keys(LINES) as LineId[];
export const clipUrl = (id: LineId) => `${VOICE_BASE}/${id}.wav`;

/**
 * Plays her lines. A line is never cut off: one asked for while another is
 * playing waits for it, and only the newest waiting line is kept. With the kid
 * sound off nothing plays and `onLine` still shows the caption.
 */
export function useRelayVoice(onLine: (id: LineId) => void) {
  const audio = useRef(new Map<LineId, HTMLAudioElement>());
  const playing = useRef<HTMLAudioElement | null>(null);
  const waiting = useRef<{ id: LineId; done?: () => void } | null>(null);
  const lineRef = useRef(onLine);
  lineRef.current = onLine;

  useEffect(() => {
    for (const id of LINE_IDS) {
      const a = new Audio(clipUrl(id));
      a.preload = 'auto';
      audio.current.set(id, a);
    }
    const all = audio.current;
    return () => { for (const a of all.values()) a.pause(); };
  }, []);

  const start = useCallback((id: LineId, done?: () => void) => {
    lineRef.current(id);
    const a = audio.current.get(id);
    if (!a || !kidSound.on()) {
      // Silent: give the caption about as long as she'd have spoken it.
      if (done) window.setTimeout(done, 700 + LINES[id].length * 45);
      return;
    }
    playing.current = a;
    const finish = () => {
      a.removeEventListener('ended', finish);
      a.removeEventListener('error', finish);
      if (playing.current === a) playing.current = null;
      done?.();
      const next = waiting.current;
      waiting.current = null;
      if (next) start(next.id, next.done);
    };
    a.addEventListener('ended', finish);
    a.addEventListener('error', finish);
    a.currentTime = 0;
    a.play().catch(finish);
  }, []);

  /** Say a line now, or straight after the one she's saying. */
  const say = useCallback((id: LineId, done?: () => void) => {
    if (playing.current) {
      // A waiting line that is passed over still lets the game move on.
      const passed = waiting.current;
      waiting.current = { id, done };
      passed?.done?.();
      return;
    }
    start(id, done);
  }, [start]);

  return useMemo(() => ({ say, busy: () => Boolean(playing.current) }), [say]);
}
