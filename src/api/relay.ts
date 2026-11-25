import { api } from './client';

/**
 * Signal Relay runs a kid finished (owner, 11-24). The game is for when the
 * network is gone, so a finished run is kept on the tablet first and sent to
 * their Guardian record once Base answers again. Each run has its own id, so
 * sending the same run twice records it once (core_api athena_gm_relay).
 *
 * Keyed by the signed-in profile, so two kids sharing a tablet never post each
 * other's runs.
 */
export interface RelayRun { id: string; at: string; messages: number; wpm: number }

const key = (who: string) => `relay_runs:${who}`;
const MAX_KEPT = 50;

function read(who: string): RelayRun[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(who)) || '[]');
    return Array.isArray(raw) ? raw.filter(r => r && typeof r.id === 'string') : [];
  } catch { return []; }
}
function write(who: string, runs: RelayRun[]) {
  try { localStorage.setItem(key(who), JSON.stringify(runs.slice(-MAX_KEPT))); } catch { /* sends next time it fits */ }
}

const newId = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const relayRuns = {
  waiting: (who: string) => read(who).length,
  /** Keep a finished run on this tablet until it reaches Base. */
  keep(who: string, run: Omit<RelayRun, 'id' | 'at'>) {
    write(who, [...read(who), { ...run, id: newId(), at: new Date().toISOString() }]);
  },
  /** Send what's waiting. Quietly keeps it for later when Base can't be reached. */
  async send(who: string): Promise<number> {
    const runs = read(who);
    if (!runs.length) return 0;
    try {
      await api.post<{ saved: number }>('/api/v1/guardian-missions/kid/relay', { runs });
    } catch (err) {
      // A refusal (an adult's sign-in, a family not on the team) will never
      // succeed, so it is dropped; anything else is link trouble and waits.
      const status = (err as { status?: number })?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) write(who, read(who).filter(r => !runs.some(s => s.id === r.id)));
      return 0;
    }
    write(who, read(who).filter(r => !runs.some(s => s.id === r.id)));
    return runs.length;
  },
};

/** Kid-only offline install: keep the app shell and her relay lines on this tablet. */
export async function keepRelayOffline(clips: string[]) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/athena-sw.js');
    await navigator.serviceWorker.ready;
    const here = location.origin;
    const shell = performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(u => u.startsWith(`${here}/assets/`))
      .map(u => new URL(u).pathname);
    (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'keep-offline', urls: [...new Set([...shell, ...clips])] });
  } catch { /* the game still runs while this page stays open */ }
}
