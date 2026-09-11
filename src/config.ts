/**
 * Runtime configuration, sourced from Vite env vars (build-time) with safe
 * defaults for local development. Mirrors the Guardians app.
 */

// Base URL of the proxy_service. '' = same origin (local dev via Vite proxy).
export const PROXY_BASE: string = (import.meta.env.VITE_PROXY_BASE ?? '').replace(/\/$/, '');

// Where the Unity WebGL build lives (same-origin /unity by default; see vite.config.ts).
export const UNITY_ASSET_BASE: string = (import.meta.env.VITE_UNITY_ASSET_BASE ?? '/unity').replace(
  /\/$/,
  ''
);

// Google OAuth web client ID — a public identifier (the marketing app ships the same one).
export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '12367074465-eg00iem3k5nfsnh7v13j2rltql3c7nqg.apps.googleusercontent.com';

// Every request identifies the app so the proxy reads the Companion cookie
// (not the Guardians one) when a browser is signed into both.
export const CLIENT_HEADERS = { 'X-Athena-Client': 'companion' } as const;

export function proxyUrl(path: string): string {
  return `${PROXY_BASE}${path}`;
}

export function wsUrl(path: string): string {
  const base = PROXY_BASE || window.location.origin;
  return base.replace(/^http/, 'ws') + path;
}

/** The browser's IANA timezone, so "yesterday" in memory recall means the user's day. */
export function localTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
