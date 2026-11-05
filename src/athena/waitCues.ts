import { useEffect, useRef } from 'react';
import type { Speech } from './useSpeech';

/**
 * What she says while a reply is on its way, so a question never seems to
 * vanish (owner, 2026-11-04): "Hmm." 1.5 s after their last word. The phone's
 * locked-screen conversation and hands-free do the same (HandsFreeService
 * WaitCues). The timed "Just a moment." at 3 s was dropped by the owner on
 * 2026-11-05: once "Hmm." came on time it was one line too many.
 *
 * - "Hmm." is skipped when the server's own line ("let me check your
 *   calendar, hmm…") came first: she has already said something.
 * - It never plays over her (a filler still going, or the reply itself), and
 *   stops the moment the reply arrives.
 * - Only with her voice on. A device that hasn't fetched it yet plays
 *   nothing this time, so it is fetched as soon as voice is on.
 */
export const WAIT_HMM = 'Hmm.';
export const WAIT_HMM_MS = 1500;

/**
 * The times count from the person's last word when the listener knows it
 * (conversation mode on the phone), not from the message being sent: the
 * end-of-turn wait and the send came first, so counted from the send "Hmm."
 * arrived 3+ s after they stopped (2026-11-05). Without it, from the send.
 */
let lastWords: number | null = null;
export function markLastWords(at: number): void {
  lastWords = at;
}

export function useWaitCues(
  thinking: boolean,
  serverFiller: string | null,
  speech: Speech,
  /** The phone is voicing this turn itself (hands-free): stay quiet here. */
  phoneHasIt: () => Promise<boolean>
): void {
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const fillerRef = useRef(serverFiller);
  fillerRef.current = serverFiller;
  const phoneRef = useRef(phoneHasIt);
  phoneRef.current = phoneHasIt;

  useEffect(() => {
    if (speech.enabled && speech.isSupported) speech.warmFillers([WAIT_HMM]);
    // warmFillers is stable; only turning voice on matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.enabled, speech.isSupported]);

  useEffect(() => {
    if (!thinking) return;
    let over = false;
    const say = async (line: string, unlessSpoken: boolean) => {
      if (unlessSpoken && fillerRef.current) return;
      const s = speechRef.current;
      if (!s.enabled || s.now()) return;
      if (await phoneRef.current()) return;
      if (over || speechRef.current.now()) return;
      speechRef.current.sayFiller(line);
    };
    const now = performance.now();
    const from = lastWords !== null && now - lastWords < 10_000 ? lastWords : now;
    lastWords = null;
    const hmm = window.setTimeout(() => void say(WAIT_HMM, true), Math.max(0, from + WAIT_HMM_MS - now));
    return () => {
      over = true;
      window.clearTimeout(hmm);
    };
  }, [thinking]);
}
