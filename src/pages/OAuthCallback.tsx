import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

/**
 * Where Google sends the browser back after every Google consent — Gmail,
 * Calendar, Contacts and the sign-in group all share this one redirect URI
 * (core_api config.OAUTH_GOOGLE_CALLBACK_URL).
 *
 * The page does no OAuth itself: it hands the query to
 * POST /api/v1/integrations/callback, where the single-use state decides whose
 * flow it was and what is linked, and follows the `redirect` it is given back
 * into the app (`/?integration=…&status=…`, which the console already reads).
 */

type Outcome = { success?: boolean; redirect?: string; integration?: string; provider?: string; status?: string; message?: string };

// The state is single-use, so the request must go out exactly once — React's
// development double-invoke of effects would otherwise spend it and then
// report the second attempt's "already used".
let sent = false;

export function OAuthCallback() {
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || sent) return;
    started.current = true;
    sent = true;
    const params = new URLSearchParams(window.location.search);
    // The authorization code should not sit in the address bar or history.
    window.history.replaceState(null, '', window.location.pathname);
    const state = params.get('state');
    if (!state) {
      setProblem('There’s nothing to finish here. Start again from Connected apps.');
      return;
    }
    api.post<Outcome>('/api/v1/integrations/callback', {
      code: params.get('code'),
      state,
      error: params.get('error'),
      error_description: params.get('error_description'),
    })
      .then((r) => {
        if (r.redirect) return window.location.replace(r.redirect);
        // No return target (local dev with an empty allowlist): home, with the
        // same outcome parameters the redirect would have carried.
        const integration = r.integration || r.provider || 'google';
        window.location.replace(`/?integration=${encodeURIComponent(integration)}&status=${r.success ? 'connected' : 'error'}`);
      })
      .catch((err: Error & { body?: { message?: string } }) => {
        setProblem(err?.body?.message || err?.message || 'Google’s answer couldn’t be finished. Try connecting again.');
      });
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#030e17] p-6 text-[#dcecf6]">
      <div className="max-w-sm text-center">
        {problem ? (
          <>
            <p className="text-sm leading-relaxed">{problem}</p>
            <a href="/" className="mt-4 inline-block rounded border border-[#40879b] px-4 py-2 text-xs text-[#91f0ff]">
              Back to Athena
            </a>
          </>
        ) : (
          <p className="text-sm opacity-70">Finishing with Google…</p>
        )}
      </div>
    </main>
  );
}
