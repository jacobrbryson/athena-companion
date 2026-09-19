import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SESSION_EXPIRED_EVENT, type ApiError } from '../api/client';
import { fetchMe, fetchProfile, fetchAccess, googleSignIn, signOut as apiSignOut, type CompanionUser, type Profile } from '../api/auth';
import { unlinkAndroidPhone } from '../native/registration';
import { invalidateReads } from '../api/readCache';

/**
 * `unreachable` is deliberately distinct from `locked`: a failed access check
 * is NOT a denied access check. Treating the two the same is what used to show
 * someone the "request access" gate after a night of proxy hiccups or an IP
 * change — the app claiming their access was gone when only the link was.
 */
type AuthStatus = 'loading' | 'authenticated' | 'locked' | 'anonymous' | 'unreachable';

/**
 * One-shot arrival signal, set by a fresh sign-in and consumed once by the
 * console (same pattern as the Guardians app): a reload does NOT replay it.
 */
interface Arrival {
  isFirstVisit: boolean;
  daysAway: number | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: CompanionUser | null;
  profile: Profile | null;
  arrival: Arrival | null;
  consumeArrival: () => void;
  signIn: (googleCredential: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-run the whole check now (the reconnect screen, `online`, page show). */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const lastSeenKey = (email: string | null) => `companion_last_seen:${email || 'me'}`;

// Reconnect attempts back off, then keep trying at a slow, indefinite beat: an
// overnight tab should be alive again by the time anyone looks at it.
const RETRY_BASE_MS = 4000;
const RETRY_MAX_MS = 30_000;
// At most one silent re-validation per window, however many calls 401.
const REVALIDATE_THROTTLE_MS = 10_000;

function computeArrival(email: string | null): Arrival {
  let last: number | null = null;
  try {
    const raw = localStorage.getItem(lastSeenKey(email));
    last = raw ? Number(raw) : null;
    localStorage.setItem(lastSeenKey(email), String(Date.now()));
  } catch {
    /* storage unavailable — treat as returning, no day count */
  }
  if (last == null) return { isFirstVisit: true, daysAway: null };
  return { isFirstVisit: false, daysAway: Math.floor((Date.now() - last) / 86_400_000) };
}

const statusOf = (err: unknown) => (err as ApiError | undefined)?.status;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CompanionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failuresRef = useRef(0);
  const statusRef = useRef<AuthStatus>('loading');
  statusRef.current = status;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const lock = () => { setProfile(null); setArrival(null); setStatus('locked'); };
    window.addEventListener('athena-access-required', lock);
    return () => window.removeEventListener('athena-access-required', lock);
  }, []);

  // The profile is created on first call from the Google identity; it binds
  // the chat session to this person (identity-based, and it turns on memory).
  const loadProfile = useCallback(async () => {
    const p = await fetchProfile();
    if (!p?.uuid) throw new Error('No profile');
    invalidateReads();
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A retry keeps the reconnect screen up rather than flashing the splash.
    setStatus((prev) => (prev === 'unreachable' ? prev : 'loading'));

    (async () => {
      try {
        const res = await fetchMe();
        if (cancelled) return;
        setUser(res.user);
        // A failure here must propagate, not be read as a denial.
        const access = await fetchAccess();
        if (cancelled) return;
        if (!access.allowed) { setStatus('locked'); return; }
        await loadProfile();
        if (cancelled) return;
        setUser(res.user);
        failuresRef.current = 0;
        setStatus('authenticated');
      } catch (err) {
        if (cancelled) return;
        if (statusOf(err) === 401) {
          // The session is genuinely gone (or was never there): sign in.
          setUser(null);
          setProfile(null);
          setArrival(null);
          failuresRef.current = 0;
          setStatus('anonymous');
          return;
        }
        // Anything else — proxy restart, cold start, timeout, offline, 5xx —
        // says nothing about this person's access. Keep retrying.
        failuresRef.current += 1;
        setStatus('unreachable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, loadProfile]);

  // Reconnect on a backoff for as long as the link is down.
  useEffect(() => {
    if (status !== 'unreachable') return;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failuresRef.current - 1));
    const timer = window.setTimeout(retry, delay);
    return () => window.clearTimeout(timer);
  }, [status, attempt, retry]);

  /**
   * A 401 that survived the client's automatic session re-pin. Re-check
   * quietly: a still-valid session leaves the console exactly as it is (the
   * chat's own polling recovers), and only a confirmed 401 sends the person to
   * sign in. Nothing here can produce the "request access" gate.
   */
  const revalidateAt = useRef(0);
  useEffect(() => {
    const onExpired = () => {
      if (statusRef.current !== 'authenticated') return;
      const now = Date.now();
      if (now - revalidateAt.current < REVALIDATE_THROTTLE_MS) return;
      revalidateAt.current = now;
      void (async () => {
        try {
          const res = await fetchMe();
          setUser(res.user);
          const access = await fetchAccess();
          if (!access.allowed) { setProfile(null); setArrival(null); setStatus('locked'); }
        } catch (err) {
          if (statusOf(err) !== 401) return; // link trouble, not a verdict
          setUser(null);
          setProfile(null);
          setArrival(null);
          setStatus('anonymous');
        }
      })();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Coming back to the tab (or to the network) should not wait out a backoff.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      if (statusRef.current === 'unreachable') { failuresRef.current = 0; retry(); }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('online', wake);
    };
  }, [retry]);

  const signIn = useCallback(
    async (credential: string) => {
      const res = await googleSignIn(credential);
      setUser(res.user);
      // A stale proxy may omit access — verify, and let a failure surface as a
      // sign-in error rather than a false lock.
      const access = res.access ?? (await fetchAccess());
      if (access.allowed !== true) { setStatus('locked'); return; }
      await loadProfile();
      setUser(res.user);
      setArrival(computeArrival(res.user.email));
      failuresRef.current = 0;
      setStatus('authenticated');
    },
    [loadProfile]
  );

  const consumeArrival = useCallback(() => setArrival(null), []);

  const signOut = useCallback(async () => {
    try { await unlinkAndroidPhone(); }
    catch {
      window.dispatchEvent(new CustomEvent('athena-native-account-error', {
        detail: 'Could not unlink this phone. Check your connection and try Sign out again.',
      }));
      return;
    }
    try {
      await apiSignOut();
      window.google?.accounts.id.disableAutoSelect();
    } finally {
      setUser(null);
      setProfile(null);
      setArrival(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, profile, arrival, consumeArrival, signIn, signOut, retry }),
    [status, user, profile, arrival, consumeArrival, signIn, signOut, retry]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
