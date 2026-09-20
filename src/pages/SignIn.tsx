import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { SequenceOverlay } from '../components/SequenceOverlay';
import { VERIFY_MESSAGES } from '../athena/sequences';
import { GOOGLE_CLIENT_ID } from '../config';
import { androidCall, isAndroidCompanion } from '../native/android';
import { LegalLinks } from '../components/LegalLinks';

/**
 * The Companion gate — the Guardians access point, but the credential is a
 * Google account. Same terminal masthead, scanlines and glitch; the Google
 * button is rendered by Google Identity Services into a quiet frame.
 */

const VERIFY_MIN_MS = 1700;

export function SignIn() {
  const { signIn } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (verifying || isAndroidCompanion()) return;
    let tries = 0;
    let timer: number | undefined;

    const onCredential = async (response: GoogleCredentialResponse) => {
      if (!response.credential) {
        setError('Google sign-in was cancelled.');
        return;
      }
      setError(null);
      setVerifying(true);
      const minDelay = new Promise((r) => window.setTimeout(r, VERIFY_MIN_MS));
      const [result] = await Promise.allSettled([signIn(response.credential)]);
      await minDelay;
      if (result.status === 'rejected' && mountedRef.current) {
        const status = (result.reason as { status?: number })?.status;
        setError(status === 429 ? 'Too many attempts. Wait, then retry.' : status === 401 ? 'Identity not recognized.' : status === 503 ? 'Access verification is unavailable. Please retry.' : 'Sign-in could not finish. Please retry.');
        setVerifying(false);
      }
    };

    // The GSI script loads async from index.html; wait for it briefly.
    const init = () => {
      const gsi = window.google?.accounts?.id;
      if (!gsi) {
        if (tries++ < 50) timer = window.setTimeout(init, 100);
        else setError('Sign-in is unavailable. Check your connection.');
        return;
      }
      gsi.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential, cancel_on_tap_outside: true });
      if (buttonRef.current) {
        const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        gsi.renderButton(buttonRef.current, {
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width: 280,
        });
      }
      setGsiReady(true);
    };
    init();
    return () => window.clearTimeout(timer);
  }, [signIn, verifying]);

  if (isAndroidCompanion()) {
    return <main className="android-signin">
      <div className="android-signin-card">
        <img src="/assets/athena-avatar.png" alt="" className="android-signin-avatar" />
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
        <div className="flex justify-center">
          <div
            className={`rounded-sm border border-current/30 p-3 transition-opacity ${gsiReady ? 'opacity-100' : 'opacity-0'}`}
          >
            <div ref={buttonRef} />
          </div>
        </div>
        {!gsiReady && !error && (
          <p className="mt-4 text-xs tracking-widest opacity-40">
            connecting<span className="animate-caret">_</span>
          </p>
        )}

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
