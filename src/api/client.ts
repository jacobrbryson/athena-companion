import { CLIENT_HEADERS, proxyUrl } from '../config';

/**
 * Thin fetch wrapper (same as Guardians). Every request carries credentials so
 * the httpOnly Companion session cookie reaches the proxy, plus the
 * X-Athena-Client header so the proxy picks the Companion cookie.
 *
 * It also heals the one failure that used to end the session silently: the
 * proxy pins the session JWT to the client IP, and a tab left open overnight
 * comes back on a new IP (DHCP renewal, CGNAT, Private Relay, Wi-Fi ->
 * cellular). Every call then 401s even though the cookie is perfectly valid.
 * On a 401 we re-pin the cookie once (POST /auth/companion/refresh) and retry
 * the request; only if that fails is the session really gone, and then we say
 * so with `athena-session-expired` instead of leaving the app dead.
 */
export interface ApiError extends Error {
  status: number;
  body?: unknown;
  code?: string;
}

/** Fired when the session cannot be recovered and the person must sign in. */
export const SESSION_EXPIRED_EVENT = 'athena-session-expired';

/** Auth endpoints must never trigger a refresh — that is how loops start. */
const isAuthPath = (path: string) => path.startsWith('/auth/');

// One shared attempt: a page-load storm of 401s must produce ONE refresh.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(proxyUrl('/auth/companion/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: CLIENT_HEADERS,
      signal: AbortSignal.timeout(15000),
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        // Cleared on the next tick so callers that 401'd together share this
        // result, while a later 401 gets a fresh attempt.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, as: 'json' | 'text' = 'json'): Promise<T> {
  const res = await send(path, init);

  const isJson = res.headers.get('content-type')?.includes('application/json');
  let body: unknown;
  if (as === 'text' && res.ok) body = await res.text();
  else if (isJson) body = await res.json().catch(() => undefined);

  if (!res.ok) {
    if (res.status === 403 && (body as { code?: string })?.code === 'ACCESS_REQUIRED') {
      window.dispatchEvent(new Event('athena-access-required'));
    }
    if (res.status === 401 && !isAuthPath(path)) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const b = body as { message?: string; error?: string; code?: string } | undefined;
    const err = new Error(b?.message || b?.error || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.body = body;
    err.code = b?.code;
    throw err;
  }
  return body as T;
}

/**
 * Perform the request, and on a 401 re-pin the session once and replay it.
 * The body is only read by the caller, so the retried response is returned
 * untouched and indistinguishable from a first-try success.
 */
async function send(path: string, init: RequestInit): Promise<Response> {
  const res = await rawFetch(path, init);
  if (res.status !== 401 || isAuthPath(path)) return res;
  // A GET or a JSON-string body can be replayed safely; a stream cannot.
  if (init.body !== undefined && typeof init.body !== 'string') return res;
  if (!(await refreshSession())) return res;
  return rawFetch(path, init);
}

function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(proxyUrl(path), {
    credentials: 'include',
    signal: path.startsWith('/auth/') || path === '/api/v1/access' || path === '/api/v1/profile'
      ? AbortSignal.timeout(30000) : undefined,
    ...init,
    headers: {
      ...CLIENT_HEADERS,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  text: (path: string) => request<string>(path, { method: 'GET' }, 'text'),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
