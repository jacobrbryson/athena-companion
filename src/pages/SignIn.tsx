import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { VERIFY_MESSAGES } from '../athena/sequences';
import { androidCall, isAndroidCompanion } from '../native/android';
import { LegalLinks } from '../components/LegalLinks';
import { startGoogleRedirect } from '../auth/googleRedirect';

/**
 * The Companion gate — the Guardians access point, but the credential is a
 * Google account. Same terminal masthead, scanlines and glitch.
 *
 * On the web, sign-in is a full-page redirect to Google (auth/googleRedirect.ts),
 * finished on /oauth/google/callback. It replaced the Google Identity Services
 * button, which stalled at accounts.google.com/gsi/transform in Silk on the
 * kids' Fire tablets — and Silk in desktop mode can't be told apart by its
 * user agent, so there is no browser sniffing: every browser gets the redirect.
 */

export function SignIn() {
  const { signIn } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // Coming back from Google with Back restores this page from the cache with
  // the button still disabled; let it be pressed again.
  useEffect(() => {
    const back = () => setLeaving(false);
    window.addEventListener('pageshow', back);
    return () => window.removeEventListener('pageshow', back);
  }, []);

  if (isAndroidCompanion()) {
    return <main className="android-signin">
      <div className="android-signin-card">
        <img src="/assets/athena-avatar.webp" alt="" className="android-signin-avatar" />
        <p className="android-wordmark">ATHENA</p>
        <h1>Your day. Your companion.</h1>
        <p>Your calendar, conversations, and everything that matters — together.</p>
        <button disabled={verifying} onClick={async () => {
          setError(null); setVerifying(true);
          try {
            const { credential } = await androidCall<{ credential: string }>('googleSignIn');
            await signIn(credential);
          } catch (e) { setError((e as Error).message || 'Sign-in could not finish. Please retry.'); }
          finally { if (mountedRef.current) setVerifying(false); }
        }}>{verifying ? 'Signing in…' : 'Continue with Google'}</button>
        <small>Signing in links this phone to your Athena account.</small>
        <div className="mt-4"><LegalLinks /></div>
        {error && <p role="alert" className="android-signin-error">{error}</p>}
      </div>
    </main>;
  }

  if (verifying) {
    return (
      <main className="relative gd-scanlines gd-sweep min-h-[100dvh]">
        <SequenceOverlay messages={VERIFY_MESSAGES} tone="terminal" eyebrow="athena companion" />
      </main>
    );
  }

  return (
    <main className="gd-scanlines gd-sweep min-h-[100dvh] grid place-items-center px-6 py-10 select-none">
      <div className="w-full max-w-sm font-mono text-center">
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.5em] opacity-40 animate-flicker">athena companion</p>
          <h1 className="mt-2 text-xl tracking-[0.3em] gd-glitch" data-text="// PRIVATE CHANNEL">
            // PRIVATE CHANNEL
          </h1>
        </div>

        <p className="mb-6 text-xs uppercase tracking-[0.3em] opacity-50">Identify yourself</p>
        <button
          type="button"
          onClick={() => { setLeaving(true); startGoogleRedirect(); }}
          disabled={leaving}
          className="mx-auto block w-[280px] rounded border border-current px-4 py-3 text-xs uppercase tracking-[0.3em] opacity-80 hover:opacity-100 disabled:opacity-40"
        >
          {leaving ? 'Opening Google…' : 'Continue with Google'}
        </button>

        <div className="mt-8 h-5" aria-live="polite">
          {error && (
            <p className="text-xs tracking-widest" style={{ color: 'var(--gd-error)' }}>
              {error}
            </p>
          )}
        </div>
        <div className="mt-8"><LegalLinks /></div>
      </div>
    </main>
  );
}
