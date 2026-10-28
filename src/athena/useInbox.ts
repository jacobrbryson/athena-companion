import { useCallback, useEffect, useState } from 'react';
import { inboxApi, type InboxNotification } from '../api/dashboard';
import { DASHBOARD_REFRESH_EVENT } from './useChat';
import { usePresentPoll } from './idle';

/** Every push is also kept here; coming back to the app should show it fast. */
const POLL_MS = 60_000;

/**
 * Notifications Athena pushed that the person has not acknowledged yet.
 *
 * Tapping a phone notification opens the app and clears the tray entry before
 * it can be read, so this is where it stays. Acknowledging is the only way one
 * leaves. A failed read leaves the previous list standing so a flaky network
 * never reads as "nothing is waiting".
 */
export function useInbox(enabled: boolean) {
  const [waiting, setWaiting] = useState<InboxNotification[]>([]);
  const [recent, setRecent] = useState<InboxNotification[]>([]);
  /** Counts completed reads, so a caller can act once on the first fresh list after the app opens. */
  const [reads, setReads] = useState(0);
  const refresh = useCallback(() => {
    if (!enabled) return;
    inboxApi.list().then(r => { setWaiting(r.unacknowledged); setRecent(r.recent); setReads(n => n + 1); }).catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) { setWaiting([]); setRecent([]); return; }
    refresh();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, refresh);
    // The push just tapped is the one to show: refetch when the tab returns.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener(DASHBOARD_REFRESH_EVENT, refresh); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, refresh]);
  usePresentPoll(refresh, POLL_MS, enabled);
  const ack = useCallback((uuid: string) => {
    setWaiting(prev => prev.filter(n => n.uuid !== uuid));
    inboxApi.ack(uuid).catch(refresh);
  }, [refresh]);
  const ackAll = useCallback(() => {
    setWaiting([]);
    inboxApi.ackAll().catch(refresh);
  }, [refresh]);
  return { waiting, recent, reads, refresh, ack, ackAll };
}
