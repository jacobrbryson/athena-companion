import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { isAndroidCompanion } from './android';
import { beginRegistration, clearFailedRegistration } from './registration';

export function AndroidRegistration() {
  const { status, profile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const failed = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener('athena-native-account-error', failed);
    return () => window.removeEventListener('athena-native-account-error', failed);
  }, []);
  useEffect(() => {
    if (!isAndroidCompanion() || status !== 'authenticated' || !profile) return;
    let cancelled = false;
    setError(null);
    const current = beginRegistration(profile.uuid);
    current.promise.catch((e: Error) => {
      clearFailedRegistration(current);
      if (!cancelled) setError(e.message || 'Could not link this phone.');
    });
    return () => { cancelled = true; };
  }, [status, profile?.uuid, attempt]);
  if (!error || status !== 'authenticated') return null;
  return <div className="android-registration" role="status">
    <span>{error} Your dashboard is still available.</span>
    <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
  </div>;
}
