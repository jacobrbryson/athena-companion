import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { dashboardApi, type DashboardSummary, type NewsResult, type DashboardPriority, type RightNow } from '../api/dashboard';
import { memoryApi, actionsApi, type Fact, type AthenaAction } from '../api/companion';
import { DASHBOARD_REFRESH_EVENT } from '../athena/useChat';
import { invalidateReads } from '../api/readCache';

interface Result<T> { data: T | null; loading: boolean; error: string | null }
const initial = { data: null, loading: true, error: null };

/**
 * The dashboard has no refresh button. Updates arrive on the chat WebSocket
 * (`dashboardUpdated`, re-broadcast as DASHBOARD_REFRESH_EVENT) — a proposal
 * answered, an app disconnected, anything the server knows has moved.
 *
 * The interval below is not a refresh loop the person is meant to notice; it
 * is the floor under a socket that has dropped to the polling fallback, where
 * no push can arrive at all. Same for the visibility check: a laptop reopened
 * after a night asleep has missed every push that was sent meanwhile.
 */
const SILENT_REFRESH_MS = 300000;

export function useDashboardData() {
  const [summary, setSummary] = useState<Result<DashboardSummary>>(initial);
  const [facts, setFacts] = useState<Result<Fact[]>>(initial);
  const [actions, setActions] = useState<Result<AthenaAction[]>>(initial);
  const [news, setNews] = useState<Result<NewsResult>>(initial);
  const [priority, setPriority] = useState<DashboardPriority | null>(null);
  const [rightNow, setRightNow] = useState<Result<RightNow>>(initial);
  const alive = useRef(false);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const revision = useRef(0);
  const lastRefresh = useRef(0);
  const refresh = useCallback(async () => {
    if (inFlight.current) { queued.current = true; return; }
    inFlight.current = true;
    do {
      queued.current = false;
      const current = ++revision.current;
      const canPublish = () => alive.current && current === revision.current;
      async function load<T>(fetcher: () => Promise<T>, setter: Dispatch<SetStateAction<Result<T>>>) {
        // Keep cards steady during routine polling. Push invalidation clears
        // them immediately below; a failed read also removes the old contents.
        setter(previous => ({ ...previous, loading: previous.data === null, error: null }));
        try { const data = await fetcher(); if (canPublish()) setter({ data, loading: false, error: null }); }
        catch (e) { if (canPublish()) setter({ data: null, loading: false, error: (e as Error).message || 'Unavailable' }); }
      }
      await Promise.allSettled([load(dashboardApi.summary, setSummary), load(memoryApi.facts, setFacts), load(actionsApi.pending, setActions), load(dashboardApi.news, setNews)]);
      lastRefresh.current = Date.now();
      // After the data, never with it: the ordering is read from the snapshot
      // the server just built, and it must never hold up the cards themselves.
      // A failure here leaves the previous order standing rather than shuffling
      // the page out from under someone mid-read.
      if (canPublish() && !queued.current) {
        void dashboardApi.priority().then(value => { if (canPublish()) setPriority(value); }).catch(() => undefined);
        // The suggestion is read from the same snapshot, for the same reason,
        // and fails the same way: a card that cannot be built leaves the day's
        // data standing rather than taking the page down with it.
        void load(dashboardApi.rightNow, setRightNow);
      }
    } while (alive.current && queued.current);
    inFlight.current = false;
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const tick = () => { if (!document.hidden && Date.now() - lastRefresh.current >= SILENT_REFRESH_MS) void refresh(); };
    const refreshNow = () => {
      revision.current++;
      invalidateReads();
      setSummary(initial); setFacts(initial); setActions(initial); setNews(initial); setPriority(null); setRightNow(initial);
      void refresh();
    };
    const timer = window.setInterval(tick, SILENT_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener(DASHBOARD_REFRESH_EVENT, refreshNow);
    return () => { alive.current = false; revision.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener(DASHBOARD_REFRESH_EVENT, refreshNow); };
  }, [refresh]);
  return { summary, facts, actions, news, priority, rightNow, refresh, loading: summary.loading || facts.loading || actions.loading || news.loading };
}
