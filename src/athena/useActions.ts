import { useCallback, useEffect, useRef, useState } from 'react';
import { actionsApi, type AthenaAction } from '../api/companion';
import { ACTION_PROPOSED_EVENT } from './useChat';

/**
 * Proposals waiting on the person, and the two answers they can give.
 *
 * Two ways a proposal arrives, on purpose:
 *
 *   the socket   useChat re-broadcasts `actionProposed` as a DOM event and we
 *                pick it up immediately — the card appears with her reply
 *   the poll     a slow refresh that also covers the polling transport (the
 *                Safari fallback), a reload, and a proposal made from the
 *                phone while this tab was open
 *
 * The socket is the fast path and never the only path, because a card that
 * only ever arrives over WebSocket would silently never appear for the people
 * already on the fallback.
 */

// Slow: the socket covers the common case, so this is a safety net rather
// than the delivery mechanism.
const POLL_MS = 20_000;

/**
 * How long a successful card stays before it retires itself.
 *
 * Cards render at the foot of the transcript, so one left sitting there ends
 * up below the NEXT thing Athena says — a card from two turns ago reading
 * as a response to the newest message. A confirmation only needs to be seen
 * once, and the Actions panel keeps the permanent record.
 *
 * Failures are deliberately excluded: those carry a reason the person may
 * need to act on, so they stay until dismissed by hand.
 */
const DONE_CARD_MS = 12_000;

export interface ActionsState {
  pending: AthenaAction[];
  /** The one currently being executed, so the card can show it working. */
  busyUuid: string | null;
  error: string | null;
  confirm: (uuid: string) => Promise<void>;
  decline: (uuid: string) => Promise<void>;
  refresh: () => void;
  /** Clear a terminal card the person has now seen. */
  dismiss: (uuid: string) => void;
}

export function useActions(enabled: boolean): ActionsState {
  const [pending, setPending] = useState<AthenaAction[]>([]);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cards the person has answered. Kept so a refresh mid-flight cannot
  // resurrect a proposal they already declined.
  const answeredRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback((uuid: string) => {
    answeredRef.current.add(uuid);
    setPending((current) => current.filter((a) => a.uuid !== uuid));
  }, []);

  // Timers for self-retiring cards, cleared on unmount so a dismiss cannot
  // fire into an unmounted component.
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);

  const refresh = useCallback(() => {
    if (!enabled) return;
    actionsApi
      .pending()
      .then((rows) =>
        setPending((current) => {
          // Terminal cards live only in local state (the server stops listing
          // them the moment they leave `pending`), so they are preserved here
          // until the person dismisses them or the component unmounts.
          const terminal = current.filter((a) => a.status !== 'pending');
          const fresh = rows.filter((r) => !answeredRef.current.has(r.uuid));
          const seen = new Set(terminal.map((a) => a.uuid));
          return [...terminal, ...fresh.filter((f) => !seen.has(f.uuid))];
        })
      )
      .catch(() => {
        // A failed poll is not worth telling the person about: the card they
        // can see is still accurate and the next tick may succeed.
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPending([]);
      return;
    }
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  // The fast path.
  useEffect(() => {
    if (!enabled) return;
    const onProposed = (event: Event) => {
      const action = (event as CustomEvent<AthenaAction>).detail;
      if (!action?.uuid || answeredRef.current.has(action.uuid)) return;
      setPending((current) =>
        current.some((a) => a.uuid === action.uuid) ? current : [...current, action]
      );
      // A standing approval means the server already executed it, so the card
      // arrives terminal and nobody will ever press a button on it.
      if (action.status === 'done') {
        answeredRef.current.add(action.uuid);
        timersRef.current.push(window.setTimeout(() => dismiss(action.uuid), DONE_CARD_MS));
      }
    };
    window.addEventListener(ACTION_PROPOSED_EVENT, onProposed);
    return () => window.removeEventListener(ACTION_PROPOSED_EVENT, onProposed);
  }, [enabled, dismiss]);

  /** Replace one card in place, so the button that was pressed keeps its spot. */
  const settle = useCallback(
    (uuid: string, next: AthenaAction) => {
      answeredRef.current.add(uuid);
      setPending((current) => current.map((a) => (a.uuid === uuid ? next : a)));
      if (next.status === 'done' || next.status === 'declined') {
        timersRef.current.push(window.setTimeout(() => dismiss(uuid), DONE_CARD_MS));
      }
    },
    [dismiss]
  );

  const confirm = useCallback(
    async (uuid: string) => {
      setError(null);
      setBusyUuid(uuid);
      try {
        const res = await actionsApi.confirm(uuid);
        settle(uuid, res.action);
      } catch (e) {
        const err = e as Error & { body?: { message?: string } };
        const message = err.body?.message || err.message || 'That did not go through.';
        setError(message);
        // The server has already marked the row terminal, so reflect that
        // rather than leaving a card that still looks approvable.
        setPending((current) =>
          current.map((a) =>
            a.uuid === uuid ? { ...a, status: 'failed' as const, error: message } : a
          )
        );
        answeredRef.current.add(uuid);
      } finally {
        setBusyUuid(null);
      }
    },
    [settle]
  );

  const decline = useCallback(
    async (uuid: string) => {
      setError(null);
      setBusyUuid(uuid);
      try {
        const res = await actionsApi.decline(uuid);
        settle(uuid, res.action);
      } catch {
        // Declining something already gone is not a failure worth surfacing:
        // the person's intent is satisfied either way.
        answeredRef.current.add(uuid);
        setPending((current) => current.filter((a) => a.uuid !== uuid));
      } finally {
        setBusyUuid(null);
      }
    },
    [settle]
  );

  return { pending, busyUuid, error, confirm, decline, refresh, dismiss };
}
