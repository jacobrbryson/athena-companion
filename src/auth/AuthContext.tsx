import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, fetchProfile, googleSignIn, signOut as apiSignOut, type CompanionUser, type Profile } from '../api/auth';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

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
}

const AuthContext = createContext<AuthContextValue | null>(null);

const lastSeenKey = (email: string | null) => `companion_last_seen:${email || 'me'}`;

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CompanionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);

  // The profile is created on first call from the Google identity; it binds
  // the chat session to this person (identity-based, and it turns on memory).
  const loadProfile = useCallback(async () => {
    const p = await fetchProfile();
    if (!p?.uuid) throw new Error('No profile');
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then(async (res) => {
        if (cancelled) return;
        await loadProfile();
        if (cancelled) return;
        setUser(res.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (credential: string) => {
      const res = await googleSignIn(credential);
      await loadProfile();
      setUser(res.user);
      setArrival(computeArrival(res.user.email));
      setStatus('authenticated');
    },
    [loadProfile]
  );

  const consumeArrival = useCallback(() => setArrival(null), []);

  const signOut = useCallback(async () => {
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
    () => ({ status, user, profile, arrival, consumeArrival, signIn, signOut }),
    [status, user, profile, arrival, consumeArrival, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
