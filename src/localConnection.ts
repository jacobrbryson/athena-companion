/** No credentials are sent during discovery. Approval is scoped to one origin. */
const KEY = 'athena.local-server.v1';
export interface LocalPreference { origin: string; preferLocal: boolean; allowCloud: boolean }
export const connection = { base: '', kind: 'cloud' as 'cloud' | 'local' | 'blocked', message: '' };

export function normalizeOrigin(value: string): string {
  const url = new URL(value.trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use an HTTPS address. HTTP is supported only on localhost for development.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Enter only the server origin, such as https://athena.example.com.');
  }
  return url.origin;
}

export function readPreference(): LocalPreference | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!p) return null;
    return { origin: normalizeOrigin(p.origin), preferLocal: p.preferLocal === true, allowCloud: p.allowCloud === true };
  } catch { return null; }
}

export function savePreference(p: LocalPreference | null) {
  if (p) localStorage.setItem(KEY, JSON.stringify({ ...p, origin: normalizeOrigin(p.origin) }));
  else localStorage.removeItem(KEY);
}

export async function probeLocal(origin: string): Promise<void> {
  const res = await fetch(`${normalizeOrigin(origin)}/.well-known/athena-local`, {
    credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error('Local server did not respond successfully.');
  const body = await res.json();
  if (body.service !== 'athena-local' || body.version !== 1) throw new Error('This address did not identify an Athena local installation.');
}

/** Resolve once before auth mounts. Never replay writes or change origins mid-session. */
export async function initializeConnection(cloudBase: string): Promise<void> {
  connection.base = cloudBase;
  connection.kind = 'cloud';
  connection.message = '';
  // A local installation hosts its own client, keeping auth cookies same-origin.
  try {
    await probeLocal(window.location.origin);
    connection.base = window.location.origin;
    connection.kind = 'local';
    connection.message = `Local server: ${window.location.origin}`;
    return;
  } catch { /* Cloud deployments do not publish this marker. */ }
  const p = readPreference();
  if (!p?.preferLocal) return;
  try {
    await probeLocal(p.origin);
    connection.base = p.origin;
    connection.kind = 'local';
    connection.message = `Local server: ${p.origin}`;
  } catch {
    connection.kind = p.allowCloud ? 'cloud' : 'blocked';
    connection.message = p.allowCloud
      ? 'Local server unavailable or blocked by this browser. Using your approved cloud fallback.'
      : 'Local server unavailable or blocked by this browser. Cloud fallback is off.';
  }
}
