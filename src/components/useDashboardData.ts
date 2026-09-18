import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardApi, type DashboardSummary, type NewsResult, type DashboardPriority } from '../api/dashboard';
import { memoryApi, actionsApi, type Fact, type AthenaAction } from '../api/companion';
import { DASHBOARD_REFRESH_EVENT } from '../athena/useChat';

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
  const alive = useRef(false);
  const inFlight = useRef(false);
  const lastRefresh = useRef(0);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    async function load<T>(fetcher: () => Promise<T>, setter: (value: Result<T>) => void) {
      // Clear previous contents so failures cannot present stale private data
      // as current after a disconnect, deletion, or permission change.
      setter({ data: null, loading: true, error: null });
      try { const data = await fetcher(); if (alive.current) setter({ data, loading: false, error: null }); }
      catch (e) { if (alive.current) setter({ data: null, loading: false, error: (e as Error).message || 'Unavailable' }); }
    }
    await Promise.allSettled([load(dashboardApi.summary, setSummary), load(memoryApi.facts, setFacts), load(actionsApi.pending, setActions), load(dashboardApi.news, setNews)]);
    inFlight.current = false; lastRefresh.current = Date.now();
    // After the data, never with it: the ordering is read from the snapshot
    // the server just built, and it must never hold up the cards themselves.
    // A failure here leaves the previous order standing rather than shuffling
    // the page out from under someone mid-read.
    void dashboardApi.priority().then(value => { if (alive.current) setPriority(value); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const tick = () => { if (!document.hidden && Date.now() - lastRefresh.current >= SILENT_REFRESH_MS) void refresh(); };
    const refreshNow = () => { void refresh(); };
    const timer = window.setInterval(tick, SILENT_REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener(DASHBOARD_REFRESH_EVENT, refreshNow);
    return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener(DASHBOARD_REFRESH_EVENT, refreshNow); };
  }, [refresh]);
  return { summary, facts, actions, news, priority, refresh, loading: summary.loading || facts.loading || actions.loading || news.loading };
}
