/** Tab-local server state. Private data never enters localStorage/IndexedDB. */
export class ReadCache {
  private generation = 0;
  private values = new Map<string, { value: unknown; expires: number }>();
  private flights = new Map<string, Promise<unknown>>();

  clear() {
    this.generation++;
    this.values.clear();
    this.flights.clear();
  }

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.values.get(key);
    if (hit && hit.expires > Date.now()) return structuredClone(hit.value) as T;
    this.values.delete(key);
    const existing = this.flights.get(key);
    if (existing) return structuredClone(await existing) as T;
    const generation = this.generation;
    const work = load().then(value => {
      // A logout, mutation or push occurred while this request was running.
      // Reject its result as well as refusing to repopulate the cache.
      if (generation !== this.generation) throw new Error('Data changed while loading. Please retry.');
      for (const [id, item] of this.values) if (item.expires <= Date.now()) this.values.delete(id);
      while (this.values.size >= 64) this.values.delete(this.values.keys().next().value!);
      this.values.set(key, { value: structuredClone(value), expires: Date.now() + ttlMs });
      return value;
    });
    if (this.flights.size < 64) this.flights.set(key, work);
    try { return structuredClone(await work); }
    finally { if (this.flights.get(key) === work) this.flights.delete(key); }
  }
}

export const readCache = new ReadCache();
export const clearReadCache = () => readCache.clear();

// A second tab may sign out or change the shared session cookie.
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('athena-read-cache') : null;
if (channel) channel.onmessage = clearReadCache;
export function invalidateReads() {
  clearReadCache();
  channel?.postMessage('invalidate');
}
if (typeof window !== 'undefined') {
  for (const event of ['athena-dashboard-refresh', 'athena-session-expired', 'athena-access-required']) {
    window.addEventListener(event, invalidateReads);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearReadCache(); });
  window.addEventListener('pageshow', clearReadCache);
}
