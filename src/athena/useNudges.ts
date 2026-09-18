import { useCallback, useEffect, useRef, useState } from 'react';
import { initiativeApi, type Nudge } from '../api/companion';

/**
 * Things Athena said without being asked.
 *
 * Polled rather than pushed. The evaluator that produces these runs as a
 * scheduled job in its own process, so it has no WebSocket to broadcast on —
 * unlike an action proposal, which is created inside the request that answered
 * the person. A minute of latency is the right trade for something that is
 * ambient by definition.
 *
 * Fetching is NOT free of side effects: the server marks what it returns as
 * delivered, so that two open tabs count as one interruption and so the
 * nightly review can tell a real interruption from one that expired unseen.
 * That is why this polls on a fixed timer and never opportunistically.
 */

const POLL_MS = 60_000;

/**
 * A nudge plus whether the person has answered it.
 *
 * `answered` is not the same as gone. Once they reply, what she said stays in
 * the transcript because it IS part of the conversation now — only the
 * dismiss affordance goes away. Dismissing, by contrast, removes it: they
 * waved it off, and leaving it sitting there would be arguing.
 */
export type OpenNudge = Nudge & { answered: boolean };

export interface NudgesState {
  /** Delivered nudges, oldest first, answered or not. */
  nudges: OpenNudge[];
  dismiss: (uuid: string) => void;
  /**
   * Record that the person replied to what she raised. Called when they send
   * any message while a nudge is open: answering her IS the engagement, and
   * asking them to also press a button to say so would be worse data and a
   * worse conversation.
   */
  engageAll: () => void;
}

export function useNudges(enabled: boolean): NudgesState {
  const [nudges, setNudges] = useState<OpenNudge[]>([]);
  // Answered locally, so an in-flight poll cannot bring one back.
  const answeredRef = useRef<Set<string>>(new Set());
  // A mirror of the rendered list, so engageAll can decide what to record
  // without doing that work inside a state updater.
  const nudgesRef = useRef<OpenNudge[]>([]);
  useEffect(() => {
    nudgesRef.current = nudges;
  }, [nudges]);

  useEffect(() => {
    if (!enabled) {
      setNudges([]);
      return;
    }
    let cancelled = false;
    const poll = () => {
      initiativeApi
        .pending()
        .then((rows) => {
          if (cancelled || !rows.length) return;
          setNudges((current) => {
            const seen = new Set([
              ...current.map((n) => n.uuid),
              ...answeredRef.current,
            ]);
            return [
              ...current,
              ...rows
                .filter((r) => !seen.has(r.uuid))
                .map((r) => ({ ...r, answered: false })),
            ];
          });
        })
        .catch(() => {
          // Initiative being unreachable should cost nothing visible. The
          // person did not ask for this and must not be shown its plumbing.
        });
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const dismiss = useCallback((uuid: string) => {
    answeredRef.current.add(uuid);
    setNudges((current) => current.filter((n) => n.uuid !== uuid));
    initiativeApi.react(uuid, 'dismissed').catch(() => undefined);
  }, []);

  const engageAll = useCallback(() => {
    // Side effects BEFORE the updater, never inside it. React may invoke a
    // state updater more than once for the same update — StrictMode does it
    // deliberately — so an updater that mutates a ref sees its own first pass
    // on the second and concludes there is nothing to do. That is exactly how
    // this silently stopped recording engagement while looking correct.
    const open = nudgesRef.current.filter(
      (n) => !n.answered && !answeredRef.current.has(n.uuid)
    );
    if (!open.length) return;
    for (const n of open) {
      answeredRef.current.add(n.uuid);
      // Fire and forget: the reaction is a measurement, and failing to record
      // one must never interfere with sending the message.
      initiativeApi.react(n.uuid, 'engaged').catch(() => undefined);
    }
    setNudges((current) => current.map((n) => (n.answered ? n : { ...n, answered: true })));
  }, []);

  return { nudges, dismiss, engageAll };
}
