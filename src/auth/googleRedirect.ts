import { GOOGLE_CLIENT_ID } from '../config';

/**
 * Full-page Google sign-in, for browsers where the Google Identity Services
 * button can't finish — Amazon Silk on the kids' Fire tablets stalls at
 * accounts.google.com/gsi/transform and never calls back.
 *
 * No Google JavaScript, popup or iframe: the page itself goes to Google's
 * OpenID Connect endpoint and asks for an ID token (`response_type=id_token`),
 * which Google returns in the URL fragment of the redirect. That token is the
 * very credential the GSI button produces, so it goes to the same
 * POST /auth/companion/google, where the proxy verifies Google's signature,
 * audience and verified email exactly as before. Nothing on the server
 * changes and no client secret is involved.
 *
 * It returns to /oauth/google/callback — the redirect URI the connector
 * consents already registered on this same OAuth client — so turning this on
 * needed no change in the Google Cloud console. The fragment never reaches a
 * server, and the callback page strips it from the address bar at once.
 *
 * `state` ties the answer to a sign-in this tab started (no one can hand the
 * tab a token through a crafted link) and `nonce` ties the token to it.
 */

const KEY = 'athena.googleRedirect';

function random(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function redirectUri(): string {
  return `${window.location.origin}/oauth/google/callback`;
}

/** Leave the app for Google's sign-in page. */
export function startGoogleRedirect(): void {
  const state = random();
  const nonce = random();
  sessionStorage.setItem(KEY, JSON.stringify({ state, nonce }));
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'id_token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
    nonce,
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export type RedirectResult = { credential: string } | { error: string };

function tokenNonce(idToken: string): string | null {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    return typeof json.nonce === 'string' ? json.nonce : null;
  } catch {
    return null;
  }
}

/**
 * Read Google's answer from the fragment, once. Returns null when the
 * fragment isn't a sign-in answer (a connector consent arrives in the query
 * instead), so the callback page can carry on with its usual work.
 */
export function takeGoogleRedirectResult(): RedirectResult | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (!hash.has('id_token') && !hash.has('error')) return null;
  window.history.replaceState(null, '', window.location.pathname);

  let saved: { state?: string; nonce?: string } = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch {
    /* treated as no sign-in in progress */
  }
  sessionStorage.removeItem(KEY);

  if (!saved.state || hash.get('state') !== saved.state) {
    return { error: 'That sign-in didn’t start here. Please try again.' };
  }
  const error = hash.get('error');
  if (error) {
    return { error: error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in could not finish. Please retry.' };
  }
  const idToken = hash.get('id_token') || '';
  if (!idToken || tokenNonce(idToken) !== saved.nonce) {
    return { error: 'Google sign-in could not be confirmed. Please retry.' };
  }
  return { credential: idToken };
}

/**
 * Browsers where the GSI button is known not to finish. Silk is the Fire
 * tablet browser; everything else keeps the Google button, with the
 * full-page sign-in one tap away under it.
 */
export function prefersRedirectSignIn(): boolean {
  return /\bSilk\//.test(navigator.userAgent);
}
