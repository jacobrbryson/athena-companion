import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { localTimezone, wsUrl } from '../config';

/**
 * Chat hook — the Guardians app's useChat, adapted for Companion. Same proxy
 * endpoints and WebSocket contract:
 *
 *   GET  /api/v1/session?sessionId=...        -> { session: { uuid, ... } }
 *   GET  /api/v1/message?sessionId=...        -> Message[]
 *   POST /api/v1/message { text, sessionId }  -> { message }
 *   WS   /ws?sessionId=...                     -> rpc: addMessage | sessionStatus
 *                                                     | actionProposed | dashboardUpdated
 *
 * Auth rides on the httpOnly session cookie (sent automatically). Because
 * Safari does not reliably attach the cross-site cookie to WebSocket upgrades
 * (ITP) — and drops sockets aggressively on backgrounding — the socket is
 * additionally authenticated with a short-lived ticket fetched over plain
 * HTTP, and the whole conversation degrades to HTTP polling whenever the
 * WebSocket is unavailable, so chat keeps working even with no socket at all.
 */

export interface Message {
  uuid: string;
  is_human: boolean;
  text: string;
  created_at?: string | number;
}

/** Where Athena is talking from, sent with every message (see message.js). */
export interface CompanionContext {
  device: 'web' | 'android' | 'car';
  driving?: boolean;
}

export interface SendOptions {
  companion?: Partial<CompanionContext>;
}

export interface ChatOptions {
  /**
   * Awaited before an incoming Athena message is appended to the transcript
   * (the "thinking" state persists while it runs). Used to hold the text
   * reveal until her generated voice is ready so both land together. A gate
   * that throws or hangs never blocks the reveal beyond its own timeout —
   * callers are expected to cap themselves (see MAX_VOICE_HOLD_MS).
   */
  onBeforeAthenaMessage?: (message: Message) => Promise<void>;
}

/** Fired when Athena proposes an action. See useActions. */
export const ACTION_PROPOSED_EVENT = 'athena-action-proposed';

/**
 * Fired when the server says this person's dashboard data has moved. This is
 * how the dashboard stays current — it has no refresh control of its own.
 * Re-broadcast as a DOM event rather than held in chat state because the
 * dashboard and the chat share nothing but this socket.
 */
export const DASHBOARD_REFRESH_EVENT = 'athena-dashboard-refresh';

export type ChatTransport = 'connecting' | 'ws' | 'polling';

export interface ChatState {
  sessionId: string | null;
  messages: Message[];
  isThinking: boolean;
  wsConnected: boolean;
  /** Which channel is currently delivering Athena's replies. */
  transport: ChatTransport;
  /** True when replies can arrive at all (live socket OR polling fallback). */
  connected: boolean;
  ready: boolean;
  sendMessage: (text: string, opts?: SendOptions) => Promise<void>;
  /**
   * Append a local Athena message (e.g. the arrival greeting). Not persisted.
   * Returns the generated uuid (or null for empty text) so callers can reconcile
   * it with side effects like TTS.
   */
  injectAthenaMessage: (text: string) => string | null;
}

// Safari can sit in CONNECTING indefinitely without firing an error.
const WS_CONNECT_TIMEOUT_MS = 8000;
const WS_BACKOFF_BASE_MS = 1000;
const WS_BACKOFF_MAX_MS = 30_000;
// Polling fallback cadence: fast while a reply is pending, relaxed otherwise.
const POLL_FAST_MS = 2000;
const POLL_SLOW_MS = 8000;
// Never leave the UI stuck on "thinking" if a reply is lost in transit.
const THINKING_WATCHDOG_MS = 90_000;

export function useChat(profileUuid: string, options?: ChatOptions): ChatState {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [transport, setTransport] = useState<ChatTransport>('connecting');
  const [ready, setReady] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);
  const isThinkingRef = useRef(false);

  // Every message uuid ever ingested. The WS push and the polling fallback
  // overlap by design, so this is what keeps the transcript duplicate-free.
  const seenRef = useRef<Set<string>>(new Set());
  // Incoming messages are revealed strictly in arrival order, even when the
  // voice-sync gate makes individual reveals asynchronous.
  const gateChainRef = useRef<Promise<void>>(Promise.resolve());

  // Latest options, mirrored to refs so the stable callbacks can read them
  // without being re-created on every render.
  const gateRef = useRef<ChatOptions['onBeforeAthenaMessage']>(options?.onBeforeAthenaMessage);
  gateRef.current = options?.onBeforeAthenaMessage;

  const storageKey = `companion_sessionId:${profileUuid}`;

  const setThinking = useCallback((value: boolean) => {
    isThinkingRef.current = value;
    setIsThinking(value);
  }, []);

  /**
   * Route one message (from the WS or a poll) into the transcript exactly
   * once. Athena's messages are held behind the optional gate (voice sync);
   * a gate failure reveals the text anyway.
   */
  const ingest = useCallback(
    (message: Message) => {
      if (!message?.uuid || seenRef.current.has(message.uuid)) return;
      seenRef.current.add(message.uuid);

      if (message.is_human) {
        gateChainRef.current = gateChainRef.current.then(() => {
          if (!closedRef.current) setMessages((prev) => [...prev, message]);
        });
        return;
      }

      const gate = gateRef.current;
      gateChainRef.current = gateChainRef.current.then(async () => {
        if (gate) {
          try {
            await gate(message);
          } catch {
            // Voice preparation failed — reveal the text regardless.
          }
        }
        if (closedRef.current) return;
        setMessages((prev) => [...prev, message]);
        setThinking(false);
      });
    },
    [setThinking]
  );

  /** Fetch the transcript and ingest anything we have not seen yet. */
  const syncMessages = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || closedRef.current) return;
    try {
      const history = await api.get<Message[]>(
        `/api/v1/message?sessionId=${encodeURIComponent(session)}`
      );
      if (Array.isArray(history)) history.forEach(ingest);
    } catch {
      // Transient — the next poll or reconnect retries.
    }
  }, [ingest]);

  // Breaks the connect <-> reconnect callback cycle.
  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (reconnectRef.current || closedRef.current) return;
    const delay =
      Math.min(WS_BACKOFF_MAX_MS, WS_BACKOFF_BASE_MS * 2 ** attemptRef.current) +
      Math.floor(Math.random() * 500);
    attemptRef.current += 1;
    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null;
      connectRef.current();
    }, delay);
  }, []);

  const connectWebSocket = useCallback(() => {
    const session = sessionRef.current;
    if (!session || closedRef.current) return;
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // Safari does not reliably attach the cross-site session cookie to the
    // WebSocket upgrade request, so exchange the cookie (over a regular
    // fetch, which does carry it) for a short-lived ticket in the URL.
    // If the ticket fetch fails we still try cookie auth on the upgrade.
    void (async () => {
      let ticket: string | null = null;
      try {
        const res = await api.get<{ ticket?: string }>('/auth/companion/ws-ticket');
        ticket = res?.ticket || null;
      } catch {
        ticket = null;
      }
      if (closedRef.current || sessionRef.current !== session) return;

      const params = new URLSearchParams({ sessionId: session });
      if (ticket) params.set('token', ticket);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl(`/ws?${params.toString()}`));
      } catch (err) {
        // Some privacy modes refuse to even construct a socket — fall back to
        // polling and keep retrying on the normal backoff schedule.
        console.warn('useChat: WebSocket unavailable', err);
        setTransport('polling');
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      const deadline = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) ws.close();
      }, WS_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        window.clearTimeout(deadline);
        attemptRef.current = 0;
        setWsConnected(true);
        setTransport('ws');
        // Catch up on anything broadcast while the socket was down.
        void syncMessages();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg?.rpc === 'addMessage' && msg.message) {
            ingest(msg.message as Message);
          }
          if (msg?.rpc === 'sessionStatus' && msg.session?.is_busy === true) {
            setThinking(true);
          }
          // Athena proposed doing something. Re-broadcast as a DOM event
          // rather than adding it to chat state: the proposal card lives
          // outside the transcript, and useActions also polls, so this is
          // purely the fast path — everything still works on the polling
          // transport where no socket message ever arrives.
          if (msg?.rpc === 'actionProposed' && msg.action) {
            window.dispatchEvent(
              new CustomEvent(ACTION_PROPOSED_EVENT, { detail: msg.action })
            );
          }
          // Something behind the dashboard changed — an approval decided, an
          // app disconnected, a proposal raised. Same reasoning as above: the
          // dashboard owns its own data, this is only the nudge to re-read it.
          if (msg?.rpc === 'dashboardUpdated') {
            window.dispatchEvent(
              new CustomEvent(DASHBOARD_REFRESH_EVENT, { detail: msg.reason ?? null })
            );
          }
        } catch (err) {
          console.error('useChat: invalid WS JSON', err);
        }
      };

      ws.onclose = () => {
        window.clearTimeout(deadline);
        if (wsRef.current === ws) wsRef.current = null;
        setWsConnected(false);
        if (!closedRef.current) {
          setTransport('polling');
          scheduleReconnect();
        }
      };

      ws.onerror = () => ws.close();
    })();
  }, [ingest, scheduleReconnect, setThinking, syncMessages]);
  connectRef.current = connectWebSocket;

  // Boot: resolve session, load history, open WebSocket.
  useEffect(() => {
    closedRef.current = false;
    let cancelled = false;
    seenRef.current = new Set();
    gateChainRef.current = Promise.resolve();
    attemptRef.current = 0;
    setTransport('connecting');

    (async () => {
      try {
        const stored = localStorage.getItem(storageKey);
        const params = new URLSearchParams();
        if (stored) params.set('sessionId', stored);
        // Companion mode, bound to the signed-in profile: binding moves the
        // session off IP checks onto identity (survives network changes) and
        // turns on long-term memory for this conversation.
        params.set('mode', 'companion');
        params.set('profile_uuid', profileUuid);

        const res = await api.get<{ session?: { uuid?: string } }>(
          `/api/v1/session?${params.toString()}`
        );
        const uuid = res?.session?.uuid;
        if (!uuid || cancelled) return;

        localStorage.setItem(storageKey, uuid);
        sessionRef.current = uuid;
        setSessionId(uuid);

        const history = await api
          .get<Message[]>(`/api/v1/message?sessionId=${encodeURIComponent(uuid)}`)
          .catch(() => []);
        if (!cancelled && Array.isArray(history)) {
          history.forEach((m) => m?.uuid && seenRef.current.add(m.uuid));
          setMessages(history);
        }

        if (!cancelled) {
          setReady(true);
          connectWebSocket();
        }
      } catch (err) {
        console.error('useChat: session init failed', err);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      closedRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // HTTP polling fallback: whenever the WebSocket is down (Safari, flaky
  // networks, proxies that block upgrades), keep the conversation alive over
  // plain fetches. Athena's replies then arrive via syncMessages instead of a
  // WS push — same ingest path, same voice-sync gating.
  useEffect(() => {
    if (!ready || wsConnected) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      await syncMessages();
      if (cancelled) return;
      timer = window.setTimeout(tick, isThinkingRef.current ? POLL_FAST_MS : POLL_SLOW_MS);
    };
    // First poll comes quickly when a reply is pending.
    timer = window.setTimeout(tick, isThinking ? 400 : 2000);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ready, wsConnected, isThinking, syncMessages]);

  // Safari aggressively drops sockets for background tabs and restores pages
  // from the back/forward cache. Whenever the page comes back (or the network
  // returns), retry the socket immediately and sync any missed messages.
  useEffect(() => {
    const revive = () => {
      if (closedRef.current || document.visibilityState === 'hidden') return;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      attemptRef.current = 0;
      connectRef.current();
      void syncMessages();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('pageshow', revive);
    window.addEventListener('online', revive);
    return () => {
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('pageshow', revive);
      window.removeEventListener('online', revive);
    };
  }, [syncMessages]);

  // Thinking watchdog: a reply that never arrives (server error, dropped
  // broadcast) must not pin the UI on "Athena is thinking" forever.
  useEffect(() => {
    if (!isThinking) return;
    const timer = window.setTimeout(() => setThinking(false), THINKING_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [isThinking, setThinking]);

  const sendMessage = useCallback(
    async (text: string, opts?: SendOptions) => {
      const session = sessionRef.current;
      const trimmed = text.trim();
      if (!session || !trimmed) return;

      const body: Record<string, unknown> = {
        text: trimmed,
        sessionId: session,
        // Surface + timezone: lets Athena keep replies speakable when driving
        // and read "yesterday" in the person's local day during recall.
        companion: { device: 'web', driving: false, ...opts?.companion, timezone: localTimezone() },
      };

      setThinking(true);
      try {
        const res = await api.post<{ message?: Partial<Message> }>('/api/v1/message', body);
        if (res?.message) {
          const message = res.message;
          if (typeof message.text === 'string' && typeof message.is_human === 'boolean') {
            const echoed: Message = {
              uuid:
                typeof message.uuid === 'string' && message.uuid
                  ? message.uuid
                  : `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              is_human: message.is_human,
              text: message.text,
              created_at: message.created_at,
            };
            // Registered as seen so the polling fallback can't re-append it.
            seenRef.current.add(echoed.uuid);
            setMessages((prev) => [...prev, echoed]);
          }
        }
      } catch (err) {
        setThinking(false);
        throw err;
      }
    },
    [setThinking]
  );

  const injectAthenaMessage = useCallback((text: string): string | null => {
    if (!text?.trim()) return null;
    const uuid = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    seenRef.current.add(uuid);
    setMessages((prev) => [
      ...prev,
      {
        uuid,
        is_human: false,
        text: text.trim(),
      },
    ]);
    return uuid;
  }, []);

  return {
    sessionId,
    messages,
    isThinking,
    wsConnected,
    transport,
    connected: wsConnected || (ready && transport === 'polling'),
    ready,
    sendMessage,
    injectAthenaMessage,
  };
}
