import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dashboardApi, type AlertPlace, type DashboardAlert, type EmergencyAlert, type NearbyIncident } from '../api/dashboard';
import { MiniMap } from './MiniMap';

/**
 * The alert across the top of every screen.
 *
 * Two sources, one banner:
 *   - the emergency situation near home (GET /dashboard/alert), assessed by
 *     the athena-incidents job — polled every minute, because it changes;
 *   - whatever Athena decided deserves an alert when she read the whole
 *     dashboard at open (priority.alert) — anything from any source.
 * The louder one wins. The server already floors both so the model can never
 * talk an emergency down; this only chooses what to draw.
 *
 * Why it never disappears while urgent: the owner sat through a storm with a
 * structure fire and trees down within two miles and "had NO CLUE". So "Got
 * it" collapses the banner to a slim red bar instead of hiding it, and a NEW
 * development (a different set of calls) opens it fully again.
 */

const POLL_MS = 60_000;
const ACK_KEY = 'athena.emergency.ack';

function readAck(): string | null {
  try { return localStorage.getItem(ACK_KEY); } catch { return null; }
}
function writeAck(key: string) {
  try { localStorage.setItem(ACK_KEY, key); } catch { /* private window: the banner just reopens */ }
}

function minutesAgo(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

interface Shown {
  level: 'watch' | 'urgent';
  headline: string;
  body: string;
  incidents: NearbyIncident[];
  key: string;
  startedAt: string | null;
}

function pick(situation: EmergencyAlert | null, model: DashboardAlert | null): Shown | null {
  const rank = { none: 0, watch: 1, urgent: 2 } as const;
  const fromSituation: Shown | null =
    situation && situation.level !== 'none' && situation.headline
      ? {
          level: situation.level,
          headline: situation.headline,
          body: situation.body || '',
          incidents: situation.incidents || [],
          key: situation.key || situation.headline,
          startedAt: situation.startedAt,
        }
      : null;
  const fromModel: Shown | null = model
    ? { level: model.level, headline: model.headline, body: model.body, incidents: [], key: `model:${model.headline}`, startedAt: null }
    : null;
  if (!fromSituation) return fromModel;
  if (!fromModel) return fromSituation;
  // Equal level: the live situation, because it carries the calls themselves.
  return rank[fromModel.level] > rank[fromSituation.level] ? fromModel : fromSituation;
}

/**
 * `pinned` is for the chat view, where the page scrolls to the conversation
 * and a banner above it would scroll away within seconds: there it is a slim
 * bar held under the top bar for as long as the situation lasts.
 */
export function EmergencyBanner({
  onAsk,
  onPlaces,
  pinned = false,
}: {
  onAsk: (text: string) => void;
  onPlaces?: () => void;
  pinned?: boolean;
}) {
  const [topbar, setTopbar] = useState(0);
  useEffect(() => {
    if (!pinned) return;
    const bar = document.querySelector<HTMLElement>('.companion-topbar');
    if (!bar) return;
    const measure = () => setTopbar(bar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [pinned]);
  const stick = pinned ? { position: 'sticky' as const, top: topbar, zIndex: 30 } : undefined;
  const [situation, setSituation] = useState<EmergencyAlert | null>(null);
  const [modelAlert, setModelAlert] = useState<DashboardAlert | null>(null);
  const [ack, setAck] = useState<string | null>(() => readAck());
  const [expanded, setExpanded] = useState(false);
  const buzzed = useRef<string | null>(null);

  const refresh = useCallback(() => {
    dashboardApi.alert().then(setSituation).catch(() => undefined);
    dashboardApi.priority().then((p) => setModelAlert(p.alert ?? null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('athena-native-resume', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('athena-native-resume', refresh);
    };
  }, [refresh]);

  const shown = useMemo(() => pick(situation, modelAlert), [situation, modelAlert]);
  const acknowledged = !!shown && ack === shown.key;

  // A new urgent development buzzes the phone once and retitles the tab, so it
  // is noticed even from another app or a background tab.
  useEffect(() => {
    if (!shown || shown.level !== 'urgent' || acknowledged) {
      document.title = document.title.replace(/^🚨 /, '');
      return;
    }
    if (!document.title.startsWith('🚨 ')) document.title = `🚨 ${document.title}`;
    if (buzzed.current !== shown.key) {
      buzzed.current = shown.key;
      try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* not a phone */ }
    }
  }, [shown, acknowledged]);

  const feedDown = situation && !situation.feed.ok;

  if (!shown) {
    if (!feedDown) return null;
    return (
      <div role="status" className="mx-3 mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        <strong className="font-semibold">Emergency watch is offline.</strong>{' '}
        I can't read the county 911 dispatch board right now
        {situation?.feed.lastOkAt ? ` (last read ${minutesAgo(situation.feed.lastOkAt)})` : ''}, so I can't warn you about anything nearby.
      </div>
    );
  }

  const urgent = shown.level === 'urgent';
  // One pin per call, numbered as the list below numbers them, and the rings
  // of the places being watched so the distance means something at a glance.
  const mapPins = shown.incidents.flatMap((i, n) =>
    Number.isFinite(i.latitude) && Number.isFinite(i.longitude)
      ? [{ latitude: i.latitude as number, longitude: i.longitude as number, n: n + 1, serious: i.serious, label: `${i.what} — ${i.where}` }]
      : []
  );
  const mapPlaces: AlertPlace[] = (situation?.places || []).filter((p) => !p.live);
  const askText = urgent
    ? "What's going on with the emergencies near the house?"
    : "What's that emergency call near the house?";

  // Acknowledged, or in the chat view: a slim bar that stays until the
  // situation is over. Tap to open the whole thing.
  if ((acknowledged || pinned) && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        style={stick}
        className={`mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold shadow-lg ${
          urgent ? 'bg-red-600 text-white' : 'bg-amber-500 text-black'
        }`}
      >
        <span aria-hidden>{urgent ? '🚨' : '⚠️'}</span>
        <span className="min-w-0 flex-1 truncate">{shown.headline}</span>
        {shown.incidents.length > 0 && <span className="shrink-0 opacity-80">{shown.incidents.length} active</span>}
        <span className="shrink-0 opacity-80" aria-hidden>▾</span>
      </button>
    );
  }

  return (
    <section
      role="alert"
      aria-live="assertive"
      style={pinned ? { ...stick, maxHeight: '70vh', overflowY: 'auto' } : undefined}
      className={`mx-3 mt-2 overflow-hidden rounded-xl border-2 shadow-2xl ${
        urgent ? 'border-red-400 bg-red-700 text-white shadow-red-900/60' : 'border-amber-300 bg-amber-400 text-black'
      }`}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="relative mt-1 flex h-4 w-4 shrink-0" aria-hidden>
          {urgent && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
          <span className={`relative inline-flex h-4 w-4 rounded-full ${urgent ? 'bg-white' : 'bg-black/70'}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">
            {urgent ? 'Emergency near home' : 'Heads up'}
            {shown.startedAt ? ` · started ${minutesAgo(shown.startedAt)}` : ''}
          </p>
          <h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{shown.headline}</h2>
          {shown.body && <p className="mt-2 text-base leading-snug opacity-95">{shown.body}</p>}
        </div>
      </div>

      {mapPins.length > 0 && (
        <div className="mx-4 mt-3">
          <MiniMap pins={mapPins} places={mapPlaces} height={pinned ? 150 : 190} />
        </div>
      )}

      {shown.incidents.length > 0 && (
        <ul className={`mx-4 mt-3 divide-y rounded-lg ${urgent ? 'divide-white/15 bg-black/20' : 'divide-black/10 bg-white/40'}`}>
          {shown.incidents.slice(0, 8).map((i) => (
            <li key={i.id} className="flex items-baseline gap-3 px-3 py-2 text-sm">
              {mapPins.length > 0 && Number.isFinite(i.latitude) && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-red-700">
                  {shown.incidents.indexOf(i) + 1}
                </span>
              )}
              <span className="w-14 shrink-0 font-mono font-semibold">{i.miles} mi</span>
              <span className="min-w-0 flex-1">
                <strong className="font-semibold">{i.what}</strong>
                {i.serious && <span className="ml-1 rounded bg-white/90 px-1 text-[10px] font-bold uppercase text-red-700">serious</span>}
                <span className="block opacity-85">
                  {i.where}
                  {i.units > 1 ? ` · ${i.units} units` : ''}
                  {minutesAgo(i.receivedAt) ? ` · ${minutesAgo(i.receivedAt)}` : ''}
                </span>
              </span>
            </li>
          ))}
          {shown.incidents.length > 8 && <li className="px-3 py-2 text-sm opacity-80">…and {shown.incidents.length - 8} more</li>}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 px-4 pb-4 pt-3">
        <button
          type="button"
          onClick={() => onAsk(askText)}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${urgent ? 'bg-white text-red-700' : 'bg-black text-amber-300'}`}
        >
          Talk to Athena about it
        </button>
        <button
          type="button"
          onClick={() => { writeAck(shown.key); setAck(shown.key); setExpanded(false); }}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${urgent ? 'border-white/60' : 'border-black/40'}`}
        >
          Got it
        </button>
        {onPlaces && (
          <button type="button" onClick={onPlaces} className="self-center text-xs underline opacity-80 hover:opacity-100">
            Watched places
          </button>
        )}
        {feedDown && <span className="self-center text-xs opacity-80">Feed offline — this may be out of date.</span>}
      </div>
    </section>
  );
}
