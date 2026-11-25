import { useCallback, useEffect, useRef, useState } from 'react';
import { keepRelayOffline } from '../../api/relay';
import { LINE_IDS, clipUrl } from './lines';
import type { RelayReason } from './RelayGame';

/**
 * When Signal Relay opens by itself (owner, 11-24): on a kid's tablet, the
 * moment the browser says it is offline, or when Base has failed to answer
 * twice in a row (a car's hotspot can be "online" with nothing behind it).
 * It opens once per outage: a kid who closes it isn't pushed back in until the
 * link has come back and gone again. "Bored?" on Base opens it any time.
 *
 * While a kid is online this also asks the service worker to keep the app and
 * her relay lines on the tablet, so the next outage has something to open.
 */
export function useSignalRelay(isKid: boolean, failures: number) {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine !== false);
  const [open, setOpen] = useState<RelayReason | null>(null);
  const armed = useRef(true);
  const kept = useRef(false);
  const online = browserOnline && failures < 2;

  useEffect(() => {
    const sync = () => setBrowserOnline(navigator.onLine !== false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  useEffect(() => {
    if (!isKid) return;
    if (online) { armed.current = true; return; }
    if (armed.current) { armed.current = false; setOpen(o => o || 'lost'); }
  }, [isKid, online]);

  useEffect(() => {
    if (!isKid || !online || kept.current) return;
    kept.current = true;
    // After the page has settled, so every asset it loaded is in the list.
    const t = window.setTimeout(() => void keepRelayOffline(LINE_IDS.map(clipUrl)), 4000);
    return () => window.clearTimeout(t);
  }, [isKid, online]);

  const start = useCallback((reason: RelayReason) => setOpen(reason), []);
  const close = useCallback(() => setOpen(null), []);
  return { open, online, start, close };
}
