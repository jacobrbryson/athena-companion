import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * Shown when Athena cannot be reached — the proxy is restarting, the network
 * is out, a request timed out. Never when access was actually denied: that is
 * AccessLocked, and confusing the two is exactly the bad night this screen
 * exists to prevent. It reconnects on its own; the button is for impatience.
 */
export function LinkLost() {
  const { user, retry, signOut } = useAuth();
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const tick = window.setInterval(() => setWaited((s) => s + 1), 1000);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.clearInterval(tick);
    };
  }, []);

  return (
    <main className="gd-scanlines gd-sweep min-h-[100dvh] grid place-items-center px-6 py-10">
      <div className="w-full max-w-sm font-mono text-center">
        <p className="text-xs uppercase tracking-widest opacity-50">athena companion</p>
        <h1 className="mt-4 text-xl tracking-widest gd-glitch" data-text="// LINK INTERRUPTED">
          // LINK INTERRUPTED
        </h1>
        <p className="mt-6 text-sm" role="status">
          {online
            ? 'She is still there. Re-establishing the channel…'
            : 'This device is offline. Reconnecting as soon as it is back.'}
        </p>
        <p className="mt-3 text-xs opacity-60">
          Your session is intact{user?.email ? ` — still signed in as ${user.email}` : ''}.
        </p>
        <p className="mt-2 text-xs opacity-40">
          retrying<span className="animate-caret">_</span>
          {waited > 8 ? ` (${waited}s)` : ''}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button className="border border-current rounded px-4 py-3" onClick={retry}>
            Reconnect now
          </button>
          <button className="opacity-60 py-2 text-xs" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
