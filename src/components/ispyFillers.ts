import { useEffect, useRef } from 'react';
import { kidSound } from '../api/kid';

/**
 * What Athena says in I Spy while the vision model works (owner, 11-24), so a
 * kid's tap never meets a silent screen: "Hmm, let me take a look…" as their
 * photo uploads and she studies it, "Ooh, let me pick something…" on her own
 * turn. Pre-recorded once in her voice (core_api/scripts/recordIspyFillers.js)
 * and served from the public assets bucket, so they start instantly — never
 * generated at play time. This list must match that script's CLIPS.
 *
 * - looking:  a kid sent their photo; she is working out her guess.
 * - again:    the spy said "Nope" and she gets another guess.
 * - choosing: her turn to spy; she is picking something in the photo.
 *
 * Only with the kid sound on. A line is never cut off: when the answer lands
 * the one playing finishes and no new one starts. A long wait gets a
 * different line after a short pause, at most MAX_LINES per wait.
 */
export type IspyFillerKind = 'looking' | 'again' | 'choosing';

const BASE = (import.meta.env.VITE_ISPY_VOICE_BASE as string | undefined)
  || 'https://storage.googleapis.com/assets-athena-app/voice/ispy/v1';

const CLIPS: Record<IspyFillerKind, string[]> = {
  looking: ['looking-1', 'looking-2', 'looking-3', 'looking-4', 'looking-5'],
  again: ['again-1', 'again-2', 'again-3'],
  choosing: ['choosing-1', 'choosing-2', 'choosing-3'],
};

// Shorter waits than this are covered by the button's own "Athena is looking…".
const START_MS = 250;
const GAP_MS = 1500;
const MAX_LINES = 3;

const shuffled = <T,>(xs: T[]) => xs.map(x => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Plays her filler lines while `waiting` names a kind; null is quiet. */
export function useIspyFiller(waiting: IspyFillerKind | null) {
  const audio = useRef(new Map<string, HTMLAudioElement>());

  // Fetch every clip when the game opens (~1.4 MB in all, cached for a year).
  useEffect(() => {
    if (!kidSound.on()) return;
    for (const id of Object.values(CLIPS).flat()) {
      if (audio.current.has(id)) continue;
      const a = new Audio(`${BASE}/${id}.wav`);
      a.preload = 'auto';
      audio.current.set(id, a);
    }
  }, []);

  useEffect(() => {
    if (!waiting || !kidSound.on()) return;
    let over = false;
    let timer = 0;
    const order = shuffled(CLIPS[waiting]);
    const say = (n: number) => {
      if (over || n >= Math.min(MAX_LINES, order.length)) return;
      // A line from the last wait is still finishing: never talk over herself.
      if ([...audio.current.values()].some(x => !x.paused && !x.ended)) {
        timer = window.setTimeout(() => say(n), GAP_MS);
        return;
      }
      const id = order[n];
      let a = audio.current.get(id);
      if (!a) { a = new Audio(`${BASE}/${id}.wav`); audio.current.set(id, a); }
      a.currentTime = 0;
      a.onended = () => { if (!over) timer = window.setTimeout(() => say(n + 1), GAP_MS); };
      // Blocked or not loaded on this tablet: quiet this time, no retry.
      void a.play().catch(() => undefined);
    };
    timer = window.setTimeout(() => say(0), START_MS);
    return () => { over = true; window.clearTimeout(timer); };
  }, [waiting]);
}
