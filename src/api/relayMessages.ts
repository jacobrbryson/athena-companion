import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';

/**
 * Secret messages in Signal Relay (owner, 11-25): tap a message in Morse and
 * send it to anyone else with Athena access; they decode it in the game.
 * core_api services/relayMessages.js logs every one (owner: "log everything").
 *
 * Like relay runs (api/relay.ts), a message tapped with no signal waits on the
 * tablet and goes out when the server answers. Each has its own id, so a send
 * repeated after a dropped reply is logged once. The people list is kept too,
 * so a kid can still pick who to write to on a road trip.
 */
export interface RelayPerson { uuid: string; name: string; picture: string | null }
export interface RelayMessage { uuid: string; body: string; from: string; picture: string | null; at: string }
interface Outgoing { id: string; to: string; toName: string; body: string; at: string }

const outKey = (who: string) => `relay_outbox_v1:${who}`;
const peopleKey = (who: string) => `relay_people_v1:${who}`;
export const MAX_SECRET = 30;

const readJson = <T,>(k: string, fallback: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? fallback; } catch { return fallback; } };
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* this visit only */ } };
const newId = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const base = '/api/v1/relay-messages';

export const relayMessages = {
  /** Everyone they can write to; the last list we had when there's no signal. */
  async people(who: string): Promise<RelayPerson[]> {
    try {
      const { people } = await api.get<{ people: RelayPerson[] }>(`${base}/recipients`);
      writeJson(peopleKey(who), people);
      return people;
    } catch { return readJson<RelayPerson[]>(peopleKey(who), []); }
  },
  waiting: (who: string) => readJson<Outgoing[]>(outKey(who), []),
  /** Keep a message on this tablet until it reaches the server. */
  queue(who: string, to: RelayPerson, body: string) {
    const out = readJson<Outgoing[]>(outKey(who), []);
    writeJson(outKey(who), [...out, { id: newId(), to: to.uuid, toName: to.name, body: body.slice(0, MAX_SECRET), at: new Date().toISOString() }].slice(-50));
  },
  /** Send what's waiting; true when the queue is empty afterwards. */
  async flush(who: string): Promise<boolean> {
    const out = readJson<Outgoing[]>(outKey(who), []);
    if (!out.length) return true;
    try {
      await api.post(base, { messages: out.map(({ id, to, body, at }) => ({ id, to, body, at })) });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // A refusal won't change by retrying (signed out, no access): drop them.
      if (!(status && status >= 400 && status < 500 && status !== 408 && status !== 429)) return false;
    }
    const left = readJson<Outgoing[]>(outKey(who), []).filter(m => !out.some(o => o.id === m.id));
    writeJson(outKey(who), left);
    return left.length === 0;
  },
  inbox: async (): Promise<RelayMessage[]> => (await api.get<{ messages: RelayMessage[] }>(`${base}/inbox`)).messages || [],
  decoded: (uuid: string) => api.post(`${base}/${uuid}/decoded`, {}).catch(() => undefined),
};

/**
 * Messages waiting for this person: checked when the page opens, comes back
 * into view or goes online, and every few minutes while it's showing (more
 * often while the game itself is open). Also sends anything queued.
 */
export function useRelayInbox(who: string | null | undefined, gameOpen = false) {
  const [messages, setMessages] = useState<RelayMessage[]>([]);
  const busy = useRef(false);
  const check = useCallback(async () => {
    if (!who || busy.current || navigator.onLine === false) return;
    busy.current = true;
    try {
      await relayMessages.flush(who);
      setMessages(await relayMessages.inbox());
    } catch { /* keep what we had */ } finally { busy.current = false; }
  }, [who]);
  useEffect(() => {
    if (!who) return;
    void check();
    const again = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    const t = window.setInterval(again, gameOpen ? 45_000 : 180_000);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('online', again); window.clearInterval(t); };
  }, [who, check, gameOpen]);
  const done = useCallback((uuid: string) => {
    setMessages(ms => ms.filter(m => m.uuid !== uuid));
    void relayMessages.decoded(uuid);
  }, []);
  return { messages, check, done };
}
