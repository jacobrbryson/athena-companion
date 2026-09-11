import { CLIENT_HEADERS, proxyUrl } from '../config';

/**
 * Thin fetch wrapper (same as Guardians). Every request carries credentials so
 * the httpOnly Companion session cookie reaches the proxy, plus the
 * X-Athena-Client header so the proxy picks the Companion cookie.
 */
export interface ApiError extends Error {
  status: number;
  body?: unknown;
}

async function request<T>(path: string, init: RequestInit = {}, as: 'json' | 'text' = 'json'): Promise<T> {
  const res = await fetch(proxyUrl(path), {
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

  const isJson = res.headers.get('content-type')?.includes('application/json');
  let body: unknown;
  if (as === 'text' && res.ok) body = await res.text();
  else if (isJson) body = await res.json().catch(() => undefined);

  if (!res.ok) {
    if (res.status === 403 && (body as { code?: string })?.code === 'ACCESS_REQUIRED') {
      window.dispatchEvent(new Event('athena-access-required'));
    }
    const b = body as { message?: string; error?: string } | undefined;
    const err = new Error(b?.message || b?.error || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  text: (path: string) => request<string>(path, { method: 'GET' }, 'text'),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
