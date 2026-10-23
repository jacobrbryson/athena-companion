import { useEffect, useRef, useState } from 'react';

/**
 * Is anyone actually here? A tab left open all day otherwise holds the chat
 * WebSocket open all day — and on Cloud Run an open socket is one request
 * that never ends, so it keeps the proxy and core_api instances billed around
 * the clock for a page nobody is looking at. After IDLE_AFTER_MS with no
 * input the page counts as idle: useChat lets the socket go (and stops its
 * own polling), then reconnects and catches up the moment input returns.
 *
 * Nothing is lost while idle: every message is stored, and the reconnect
 * syncs the transcript. Push notifications are a separate channel and never
 * depend on this socket.
 *
 * Module-level rather than per-hook so every poller shares one notion of
 * "here", and so a plain setInterval can ask `isIdle()` without a re-render.
 */

export const IDLE_AFTER_MS = 10 * 60_000;

// Anything a person does to the page. pointermove covers a mouse resting on
// the page and being nudged; scroll catches reading without clicking.
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'focus'] as const;

let lastActivity = Date.now();
let idle = false;
let timer: number | undefined;
let started = false;
// Things that keep the page awake without input: a pending reply, a spoken
// conversation (mic on, hands off the screen). Counted, not boolean, so two
// holders can't release each other.
let holds = 0;
const listeners = new Set<(idle: boolean) => void>();

function setIdle(next: boolean) {
  if (idle === next) return;
  idle = next;
  listeners.forEach((fn) => fn(next));
}

function arm() {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(check, Math.max(1000, lastActivity + IDLE_AFTER_MS - Date.now()));
}

function check() {
  timer = undefined;
  if (holds > 0) return; // Re-armed when the last hold is released.
  if (Date.now() - lastActivity >= IDLE_AFTER_MS) setIdle(true);
  else arm();
}

function markActive() {
  lastActivity = Date.now();
  if (idle) setIdle(false);
  // pointermove fires constantly; the pending timer already re-checks against
  // lastActivity when it fires, so only arm when none is pending.
  if (timer === undefined && holds === 0) arm();
}

function onVisibility() {
  // Coming back to the tab is being here, even before the first click.
  if (document.visibilityState === 'visible') markActive();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  ACTIVITY_EVENTS.forEach((type) =>
    window.addEventListener(type, markActive, { passive: true, capture: true })
  );
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', markActive);
  arm();
}

/** True when nobody has touched the page for IDLE_AFTER_MS. */
export function isIdle(): boolean {
  start();
  return idle;
}

/**
 * Nobody is here to see what a poll would fetch: the tab is hidden, or idle.
 * Hidden counts at once — a background tab is throttled to one timer a
 * minute, which is exactly the all-day trickle that kept both services billed.
 */
export function isAway(): boolean {
  return document.visibilityState === 'hidden' || isIdle();
}

/**
 * Runs `fn` now, then every `ms` while someone is here, and once the moment
 * they come back — so a paused poll catches up before anyone can notice it
 * was paused. Nothing waits on these polls but the screen: what they fetch
 * stays on the server until read, and pushes never depend on them.
 * `keepAlive`, when it returns true, keeps polling through an absence.
 */
export function usePresentPoll(fn: () => void, ms: number, enabled = true, keepAlive?: () => boolean) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const keepAliveRef = useRef(keepAlive);
  keepAliveRef.current = keepAlive;
  useEffect(() => {
    if (!enabled) return;
    start();
    fnRef.current();
    const id = window.setInterval(() => {
      if (!isAway() || keepAliveRef.current?.()) fnRef.current();
    }, ms);
    let away = isAway();
    const onChange = () => {
      const now = isAway();
      if (away && !now) fnRef.current();
      away = now;
    };
    listeners.add(onChange);
    document.addEventListener('visibilitychange', onChange);
    return () => {
      window.clearInterval(id);
      listeners.delete(onChange);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, [ms, enabled]);
}

/** Re-renders on every idle change. */
export function useIdle(): boolean {
  const [value, setValue] = useState(isIdle);
  useEffect(() => {
    listeners.add(setValue);
    setValue(idle);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Keeps the page awake while `active` is true. */
export function useStayAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    start();
    holds += 1;
    markActive();
    return () => {
      holds -= 1;
      // The countdown starts from the release, not from the last click.
      lastActivity = Date.now();
      if (holds === 0) arm();
    };
  }, [active]);
}
