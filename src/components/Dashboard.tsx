import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEvent, Source, JiraIssue, RecoveryDay, DashboardSummary, GcpBilling, TimeSaved, SystemHealthStatus, TriageEmail, FamilyHealthStatus, HealthSeverity, NearbyIncident, WeatherAlert } from '../api/dashboard';
import { dashboardApi } from '../api/dashboard';
import { integrationsApi, type Fact } from '../api/companion';
import { androidCall, isAndroidCompanion } from '../native/android';
import type { ApiError } from '../api/client';
import { useDashboardData } from './useDashboardData';
import { NewsSourcesPanel } from './NewsSourcesPanel';
import { PlansPanel } from './PlansPanel';
import { EmergencyBanner } from './EmergencyBanner';
import { RightNowCard } from './RightNowCard';
import { buildFamilyRoster, type RosterRow } from './familyRoster';
import { FamilyPeopleList } from './FamilyPeople';
import { DoorToDoor } from './DoorToDoor';
import { communityEvents } from './communityCalendar.ts';
import { WorkBanner } from './WorkBanner';
import { untilLabel } from './workStatus';
import { EmailPanel, CATEGORY_LABEL } from './EmailPanel';
import { MailBundles } from './MailBundles';
import { DreamCard, DreamsPage } from './Dreams';
import { DashboardIcon } from './icons';
import { CommunityMap, PointsOfInterest, Neighbors, LocalEvents, PlaceReminders, ContactAvatar, eventWhen, isPastEvent } from './Community';
import { EmergencyAlertSetup } from './EmergencyAlertSetup';
import { Websites } from './Websites';

/** Enough for a household, so nobody sorted late in the alphabet is cut off the card. */
const FAMILY_CARD_ROWS = 7;

/** Open a console panel; `consentFor` opens Connected apps on that provider's consent prompt. */
export type OpenPanel = (panel: 'integrations' | 'memory' | 'actions' | 'notifications' | 'knows' | 'photo' | 'devices', options?: { consentFor?: string }) => void;
export type DashboardSection = 'Home' | 'Today' | 'Calendar' | 'Health' | 'Family' | 'Community' | 'Mail' | 'Work' | 'Projects' | 'News' | 'Dreams' | 'System';
// Icons live in ./icons — one registry, so a drawn icon looks the same in
// the nav, on its card and in the phone's bottom bar.
export { DashboardIcon } from './icons';
// Left-hand navigation. "Home" is presented to people as Dashboard; it also
// replaces the old Quick Actions entry, which now lives on as the bell in the
// top bar (the Notifications card was removed by the owner, 2026-09-27).
// Today remains an internal page for now but is not a left-navigation entry.
export const dashboardSections: DashboardSection[] = ['Home', 'Calendar', 'Health', 'Family', 'Community', 'Mail', 'Work', 'Projects', 'News', 'Dreams', 'System'];
// The card set, in the one order the dashboard uses. Fixed by the owner
// (2026-09-26): Health & Performance first, and Athena no longer re-sorts it.
// The first row is the owner's hierarchy (2026-09-27): take care of yourself,
// so you can take care of your family, so your family can take care of the
// community. Ids are shared with services/dashboardPriority.js in core_api —
// changing one means changing both.
const DEFAULT_CARD_ORDER = ['health', 'family', 'community', 'calendar', 'mail', 'work', 'news', 'projects'];
// The first row holds three cards; whatever ranks below them drops to the second.
const PRIMARY_SLOTS = 3;
const statusText = { not_connected: 'Not connected', needs_reauth: 'Reconnect to refresh', consent_required: 'Health consent required', error: 'Couldn’t load this source', ready: 'Connected' };
/**
 * The integration each summary source is re-linked through — the same ids the
 * Connected apps panel passes to `integrationsApi.connect`.
 */
const SOURCE_PROVIDER: Partial<Record<keyof DashboardSummary, string>> = {
  calendar: 'google_calendar', emailTriage: 'gmail',
  recovery: 'whoop', sleep: 'whoop', strain: 'whoop',
  jira: 'jira', slack: 'slack', familyChores: 'family_chores',
};
/** What a source that cannot be read offers to do about it, where it is read. */
interface SourceFix { reconnect: () => void; panel: () => void; retry: () => void; busy?: boolean }
/**
 * The one button that fixes an unreadable source, right beside the line that
 * says so: a missing or expired link goes straight to the provider, consent
 * opens the panel that asks for it, and a provider error is worth one more try.
 */
function FixButton({ source, fix, className = 'source-fix' }: { source?: Source<unknown>; fix?: SourceFix; className?: string }) {
  if (!fix || !source) return null;
  const [label, run] = source.status === 'not_connected' ? ['Connect', fix.reconnect]
    : source.status === 'needs_reauth' ? ['Reconnect', fix.reconnect]
    : source.status === 'consent_required' ? ['Give consent', fix.panel]
      : source.status === 'error' ? ['Retry', fix.retry]
        : [null, null];
  if (!label || !run) return null;
  return <button type="button" className={className} disabled={fix.busy} onClick={run}>{fix.busy ? 'Opening…' : label} <span>↗</span></button>;
}
/**
 * Why a card is quiet about something, with the button that fixes it.
 *
 * A source nobody has linked is said out loud too, with Connect beside it:
 * the owner asked (2026-09-29) for every card missing data to carry its call
 * to action, rather than a briefing that stays silent about what it can't see.
 */
function SourceNote({ source, name, fix }: { source?: Source<unknown>; name: string; fix?: SourceFix }) {
  return <><p className="source-note">{name} · {source ? statusText[source.status] : 'Loading…'}</p>
    {source?.detail && <p className="source-note source-detail">{source.detail}</p>}
    <FixButton source={source} fix={fix} /></>;
}
/** A labelled run of card rows, or the note that says why they are missing. */
function SourceBlock({ source, label, name, fix, children }: { source?: Source<unknown>; label: string; name: string; fix?: SourceFix; children: ReactNode }) {
  // Not ready: the note names the source itself, so the label would say it twice.
  return source?.status === 'ready' ? <><p className="source-note">{label}</p>{children}</> : <SourceNote source={source} name={name} fix={fix} />;
}
/** An empty card row that says what would fill it, with the button that does. */
function EmptyCta({ text, action, onClick }: { text: ReactNode; action: string; onClick: () => void }) {
  return <><p className="dashboard-empty">{text}</p><button type="button" className="source-fix" onClick={onClick}>{action} <span>↗</span></button></>;
}
function safeHref(url?: string | null) { try { const parsed = new URL(url || ''); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : undefined; } catch { return undefined; } }
function ExternalLink({ url, children }: { url?: string | null; children: ReactNode }) {
  const href = safeHref(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
}
function dateLabel(value?: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...options }) : 'Date unavailable';
}
/** How long ago, in the few words a card has room for. */
function agoLabel(value?: string | null) {
  const at = Date.parse(value || '');
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return dateLabel(value);
}
/** A clock that re-renders its reader, so a countdown stays honest while the page is open. */
function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}
/** The soonest timed event that hasn't finished: what is on now, or what is next. */
function nextUp(events: CalendarEvent[], now: number) {
  for (const event of events) {
    if (event.allDay) continue;
    const start = Date.parse(event.start), end = Date.parse(event.end);
    if (!Number.isFinite(start)) continue;
    if (start <= now && Number.isFinite(end) && end > now) return { event, ongoing: true, ms: end - now };
    if (start > now) return { event, ongoing: false, ms: start - now };
  }
  return null;
}
// Which cards a person has folded away on a phone. Remembered per browser;
// unset means "use the default" (folded on a phone, always open on a desktop,
// where the setting has no effect).
const COLLAPSE_KEY = 'athena.dashboard.collapsed';
const isPhoneWidth = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches;
function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; } catch { return {}; }
}
function incidentLine(c: NearbyIncident) {
  return <li key={c.id}><strong>{c.serious ? '● ' : ''}{c.what}</strong><small>{[c.where, `${c.miles} mi from ${c.place}`, agoLabel(c.receivedAt)].filter(Boolean).join(' · ')}</small></li>;
}
function weatherLine(w: WeatherAlert) {
  return <li key={w.id}><strong>{w.event}</strong><small>{[w.place, w.expires ? `until ${new Date(w.expires).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : null].filter(Boolean).join(' · ')}</small></li>;
}
function Facts({ facts }: { facts: Fact[] }) {
  return <ul className="dashboard-memory-list">{facts.map(fact => <li key={fact.uuid}><span className="memory-avatar">{fact.key.slice(0, 1).toUpperCase()}</span><div><strong>{fact.key}</strong><p>{fact.value || 'Saved in memory'}</p></div></li>)}</ul>;
}
function Issues({ issues }: { issues: JiraIssue[] }) {
  return <ul className="dashboard-data-list">{issues.map(issue => <li key={`${issue.site}-${issue.key}`}><ExternalLink url={issue.url}><strong>{issue.key} · {issue.title}</strong><small>{issue.project} · {issue.status}</small></ExternalLink></li>)}</ul>;
}

// --- Section-page building blocks -----------------------------------------
// A section page is one source read closely, so it gets a different vocabulary
// from the briefing: a headline row of numbers, then panels. Cards stay for
// Home, where the job is breadth rather than depth.

/** One number worth reading at a glance, with the note that gives it meaning. */
export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'ok' | 'low' | 'idle' }) {
  return <div className={`stat-tile${tone ? ` stat-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
export function Panel({ title, note, children, wide, id }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean; id?: string }) {
  return <section id={id} className={`section-panel${wide ? ' section-panel-wide' : ''}`}><header><h2>{title}</h2>{note && <span>{note}</span>}</header>{children}</section>;
}
/**
 * A source that cannot be read is the whole answer for its panel, so it is
 * stated in the panel rather than whispered under it — and, where the person
 * can actually fix it, it comes with the button that does.
 */
function Unavailable({ source, name, fix }: { source?: Source<unknown>; name: string; fix?: SourceFix }) {
  return <div className="section-unavailable">
    <p className="dashboard-empty">{name} · {source ? statusText[source.status] : 'Loading…'}</p>
    {/* What the provider actually said. A card that cannot be read is only
        actionable if it says why — "reconnect" is the wrong advice for an API
        that was never enabled, and the person has no way to tell them apart. */}
    {source?.detail && <p className="dashboard-empty source-detail">{source.detail}</p>}
    <FixButton source={source} fix={fix} className="dashboard-chat-cta" />
  </div>;
}
/**
 * A week of one WHOOP metric, tall enough to read the shape of.
 *
 * `neutral` is for strain, where more is not better: colouring a hard day
 * green and a rest day red would be a judgement the data does not support.
 */
/**
 * Seven days of one number.
 *
 * `min` lifts the floor off zero, which a heart rate needs: every resting
 * value a living person records sits in the top third of a 0-90 scale, and
 * seven bars of the same height say nothing. Panels that do this name the
 * scale in their note, because a chart that does not start at zero has to say
 * so. `goal` draws the line the person is aiming at.
 */
function Trend({ rows, max, min = 0, goal, unit, format, neutral }: { rows: { date: string; value: number | null }[]; max: number; min?: number; goal?: number; unit: string; format?: (value: number) => string; neutral?: boolean }) {
  if (!rows.some(row => row.value !== null)) return <p className="dashboard-empty">No scored days in this window.</p>;
  const place = (value: number) => Math.max(4, Math.min(100, ((value - min) / (max - min)) * 100));
  return <ul className="trend-bars" aria-label={`Last ${rows.length} days, ${unit}`}>{rows.map(row => {
    const pct = row.value === null ? 0 : place(row.value);
    const share = row.value === null ? 0 : (row.value - min) / (max - min);
    const tone = row.value === null ? 'idle' : neutral ? 'plain' : share >= .66 ? 'good' : share >= .34 ? 'ok' : 'low';
    return <li key={row.date}>
      <b>{row.value === null ? '—' : format ? format(row.value) : Math.round(row.value)}</b>
      <span className="trend-track">{goal !== undefined && <span className="trend-goal" style={{ bottom: `${place(goal)}%` }} title={`Goal ${goal}`} />}<span className={`trend-bar trend-${tone}`} style={{ height: `${pct}%` }} /></span>
      <small>{new Date(`${row.date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'narrow' })}</small>
    </li>;
  })}</ul>;
}

/** What every section page needs from the console around it. */
export interface SectionContext {
  onAsk: (text: string) => void;
  onPanel: OpenPanel;
  onHome: () => void;
  error: string | null;
  sourcesOpen: boolean;
  setSourcesOpen: (open: boolean) => void;
  refresh: () => void;
}
/**
 * Every section page: the same head, the same footer, its own middle.
 *
 * Declared out here, not inside Dashboard, because a component defined during
 * render is a new type on every render — React would unmount and remount this
 * whole subtree each time, and the news-sources panel would lose what was
 * being typed into it.
 */
export function SectionPage({ eyebrow, title, blurb, stats, children, ask, ctx }: {
  eyebrow: string; title: string; blurb: string; stats?: ReactNode; children: ReactNode; ask: string; ctx: SectionContext;
}) {
  return <main className="dashboard-content dashboard-section">
    <div className="dashboard-toolbar"><span className="dashboard-eyebrow">{eyebrow}</span><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => ctx.onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
    <header className="section-head"><h1>{title}</h1><p>{blurb}</p></header>
    {ctx.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {ctx.error}</p>}
    {stats && <div className="stat-row">{stats}</div>}
    <div className="section-panels">{children}</div>
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>She has read all of this.<br />Ask her what she makes of it.</h2><button className="dashboard-chat-cta" onClick={() => ctx.onAsk(ask)}>Talk it through <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={ctx.onHome}>Back to your briefing <span>↗</span></button><button onClick={() => ctx.onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => ctx.onPanel('memory')}>Explore memories <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {ctx.sourcesOpen && <NewsSourcesPanel onClose={() => ctx.setSourcesOpen(false)} onSaved={ctx.refresh} />}
  </main>;
}

/** One provider read for the System page. Each loads on its own, so one failing never blanks the others. */
function useSystemRead<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    void load().then(data => {
      if (alive) setState({ data, loading: false, error: null });
    }).catch(err => {
      if (alive) setState({ data: null, loading: false, error: (err as Error).message || 'Unavailable' });
    });
    return () => { alive = false; };
  }, [load]);
  return state;
}

const money = (currency: string | null | undefined, value: number | null | undefined) =>
  value == null || !currency ? '—' : `${currency} ${value.toFixed(2)}`;

/** The last seven days of spend, oldest first, with empty days filled in as zero. */
function lastWeek(daily: { date: string; cost: number }[] | undefined, today = new Date()) {
  const byDate = new Map((daily || []).map(d => [d.date, d.cost]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today.getTime() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { date, value: byDate.get(date) ?? 0 };
  });
}

function CostTrend({ daily, currency }: { daily?: { date: string; cost: number }[]; currency: string }) {
  const rows = lastWeek(daily);
  const max = Math.max(...rows.map(r => r.value ?? 0));
  if (max <= 0) return <p className="dashboard-empty">No spend recorded in the last 7 days.</p>;
  return <Trend rows={rows} max={max} unit={currency} format={v => v.toFixed(2)} neutral />;
}

const GCP_SETUP: Record<NonNullable<GcpBilling['reason']>, string> = {
  no_project: 'No GCP project is configured on this Athena system.',
  no_dataset: 'The billing export dataset does not exist yet.',
  no_export: 'Cloud Billing export is not switched on yet, or has not delivered its first rows.',
};

const HEALTH_LABEL: Record<SystemHealthStatus, { word: string; tone: 'good' | 'ok' | 'low' }> = {
  ok: { word: 'Good', tone: 'good' },
  degraded: { word: 'Degraded', tone: 'ok' },
  down: { word: 'Down', tone: 'low' },
};

/**
 * Several providers' figures as one amount. A provider that couldn't be read
 * is named rather than counted as zero, so a partial total never passes for
 * the whole one.
 */
function combined(parts: { name: string; currency?: string | null; value?: number | null }[]) {
  const read = parts.filter(p => p.value != null && p.currency);
  if (!read.length || new Set(read.map(p => p.currency)).size > 1) return { value: '—', missing: parts.map(p => p.name) };
  return { value: money(read[0].currency, read.reduce((sum, p) => sum + (p.value as number), 0)), missing: parts.filter(p => !read.includes(p)).map(p => p.name) };
}
const without = (missing: string[]) => missing.length ? ` · without ${missing.join(', ')}` : '';
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** A new export backfills oldest-first; until it reaches this month, this month reads as nothing. */
function exportBehind(cloud: GcpBilling | null) {
  if (!cloud?.dataThrough || !cloud.invoiceMonth) return null;
  return cloud.dataThrough.slice(0, 7).replace('-', '') < cloud.invoiceMonth ? dateLabel(cloud.dataThrough) : null;
}

/** Minutes as the unit a person would say: "40 min", "6.2 h". */
const duration = (minutes: number) => minutes < 60 ? `${Math.round(minutes)} min` : `${(minutes / 60).toFixed(1)} h`;
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'long' });

/**
 * What Athena has saved, from approved actions only. Every figure traces to a
 * count and a per-action rate shown right beside it, so it can be argued with;
 * actions with no rate are shown as not counted rather than left out.
 */
function TimeSavedPanel({ saved }: { saved: { data: TimeSaved | null; loading: boolean; error: string | null } }) {
  const t = saved.data;
  return <Panel title="Time saved" note={t ? `${monthName(t.month)} · approved actions only` : 'approved actions only'} wide>
    {saved.loading ? <p className="dashboard-empty">Counting what Athena has done…</p>
      : !t ? <div className="section-unavailable"><p className="dashboard-empty">{saved.error || 'Time saved is unavailable.'}</p></div>
      : !t.actionsAllTime ? <p className="dashboard-empty">Nothing yet. This counts actions Athena carried out after you approved them — add an event, file or trash an email, save a memory — at a conservative number of minutes each.</p>
      : <>
        <div className="system-summary-grid"><div><span>This month · {t.actionsThisMonth} action{t.actionsThisMonth === 1 ? '' : 's'}</span><strong>{duration(t.minutesThisMonth)}</strong></div><div><span>Last month</span><strong>{duration(t.minutesLastMonth)}</strong></div><div><span>Lifetime{t.since ? ` · since ${dateLabel(`${t.since}T12:00:00`)}` : ''}</span><strong>{duration(t.minutesAllTime)}</strong></div></div>
        <div className="day-group"><h3>Last 7 days</h3>{t.daily.length ? <Trend rows={lastWeek(t.daily.map(d => ({ date: d.date, cost: d.minutes })))} max={Math.max(1, ...t.daily.map(d => d.minutes))} unit="minutes" format={v => `${Math.round(v)}m`} neutral /> : <p className="dashboard-empty">Nothing done in the last 7 days.</p>}</div>
        <div className="day-group"><h3>This month, by action</h3>{t.byAction.length ? <ul className="dashboard-data-list">{t.byAction.map(a => <li key={a.actionId}><strong>{a.minutesEach ? duration(a.minutes) : 'Not counted'} · {a.label}</strong><small>{a.count} × {a.minutesEach ? `${a.minutesEach} min` : 'no fair hand-done time to credit yet'}</small></li>)}</ul> : <p className="dashboard-empty">Nothing done yet this month.</p>}</div>
      </>}
  </Panel>;
}

function SystemPage({ ctx }: { ctx: SectionContext }) {
  const health = useSystemRead(dashboardApi.systemHealth);
  const twilio = useSystemRead(dashboardApi.systemTwilio);
  const openai = useSystemRead(dashboardApi.systemOpenAI);
  const gcp = useSystemRead(dashboardApi.systemGcp);
  const saved = useSystemRead(dashboardApi.systemTimeSaved);
  const billing = twilio.data, loading = twilio.loading;
  const unavailable = twilio.error || (billing && !billing.configured ? 'Twilio is not configured on this Athena system.' : null);
  const balance = billing?.balance?.amount && billing.balance.currency ? `${billing.balance.currency} ${billing.balance.amount}` : '—';
  const ai = openai.data?.configured ? openai.data : null;
  const cloud = gcp.data?.configured ? gcp.data : null;
  const behind = exportBehind(cloud);
  const state = health.data ? HEALTH_LABEL[health.data.status] : null;
  const failing = health.data?.checks.filter(c => c.status !== 'ok').length ?? 0;
  const lifetime = combined([
    { name: 'Twilio', currency: billing?.balance?.currency, value: billing?.configured ? billing.costAllTime : null },
    { name: 'OpenAI', currency: ai?.currency, value: ai?.costAllTime },
    { name: 'Google Cloud', currency: cloud?.currency, value: cloud?.costAllTime },
  ]);
  const llmCost = combined([
    { name: 'OpenAI', currency: ai?.currency, value: ai?.costThisMonth },
    { name: 'Gemini', currency: cloud?.currency, value: cloud?.llmThisMonth },
  ]);
  return <SectionPage ctx={ctx}
    eyebrow="ATHENA SYSTEM" title="System" blurb="A small, live view of how Athena is doing, the time she has saved you, and what the services she runs on are costing."
    ask="What should I know about the Athena system right now?"
    stats={<>
      <Stat label="Athena's health" value={health.loading ? '…' : state?.word ?? 'Unknown'} tone={state?.tone ?? 'idle'}
        note={health.loading ? 'Checking…' : health.data?.status === 'ok' ? `Last check ${clock(health.data.checkedAt)}`
          : <a href="#system-health" onClick={e => { e.preventDefault(); document.getElementById('system-health')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{health.data ? `Why? ${failing} check${failing === 1 ? ' needs' : 's need'} attention` : 'Why? The health check did not answer'} ↓</a>} />
      <Stat label="Time saved" value={saved.loading ? '…' : saved.data ? duration(saved.data.minutesThisMonth) : '—'}
        note={saved.data ? `This month · ${saved.data.actionsThisMonth} approved action${saved.data.actionsThisMonth === 1 ? '' : 's'}` : saved.error || 'Approved actions only'} tone={saved.data?.minutesThisMonth ? 'good' : 'idle'} />
      <Stat label="Total spend" value={twilio.loading || openai.loading || gcp.loading ? '…' : lifetime.value}
        note={`Lifetime · Twilio, OpenAI, Google Cloud${without(lifetime.missing)}`} tone={lifetime.missing.length === 3 ? 'idle' : undefined} />
      <Stat label="LLM cost" value={openai.loading || gcp.loading ? '…' : llmCost.value}
        note={`This month · OpenAI + Gemini${without(llmCost.missing)}${behind ? ` · Gemini through ${behind}` : ''}`} tone={llmCost.missing.length === 2 ? 'idle' : undefined} />
      <Stat label="Hosting cost" value={gcp.loading ? '…' : money(cloud?.currency, cloud?.hostingThisMonth)}
        note={!cloud ? 'Billing export not ready' : behind ? `Export catching up · data through ${behind}` : 'This month · Google Cloud, excluding Gemini'} tone={cloud && !behind ? undefined : 'idle'} />
    </>}
  >
    <Panel id="system-health" title="Health" note={health.data ? `checked ${clock(health.data.checkedAt)}` : 'live check'} wide>
      {health.loading ? <p className="dashboard-empty">Checking Athena…</p>
        : !health.data ? <div className="section-unavailable"><p className="dashboard-empty">{health.error || 'The health check did not answer.'}</p><p className="source-detail">If this persists, Athena's API itself may be down, and the rest of this page will be unavailable too.</p></div>
        : <ul className="dashboard-data-list">{health.data.checks.map(c => <li key={c.id}><strong>{HEALTH_LABEL[c.status].word} · {c.label}</strong><small>{c.detail}</small></li>)}</ul>}
    </Panel>
    <TimeSavedPanel saved={saved} />
    <Panel title="OpenAI" note="organization costs · month to date" wide>
      {openai.loading ? <p className="dashboard-empty">Reading OpenAI costs…</p>
        : !ai ? <div className="section-unavailable"><p className="dashboard-empty">{openai.error || 'OpenAI billing is not configured on this Athena system.'}</p><p className="source-detail">The system owner needs an OpenAI admin key in OPENAI_API_ADMIN_KEY. OpenAI does not publish a prepaid credit balance through its API, so this shows spend.</p></div>
        : <>
          <div className="system-summary-grid"><div><span>This month</span><strong>{money(ai.currency, ai.costThisMonth)}</strong></div><div><span>Today (UTC)</span><strong>{money(ai.currency, ai.costToday)}</strong></div><div><span>Lifetime{ai.allTimeSince ? ` · since ${dateLabel(`${ai.allTimeSince}T12:00:00`)}` : ''}</span><strong>{money(ai.currency, ai.costAllTime)}</strong></div></div>
          <div className="day-group"><h3>Last 7 days</h3><CostTrend daily={ai.daily} currency={ai.currency || 'USD'} /></div>
          <div className="day-group"><h3>By model and usage</h3>{ai.lineItems?.length ? <ul className="dashboard-data-list">{ai.lineItems.slice(0, 10).map(item => <li key={item.name}><strong>{money(ai.currency, item.cost)}</strong><small>{item.name}</small></li>)}</ul> : <p className="dashboard-empty">No spend yet this month.</p>}</div>
        </>}
    </Panel>
    <Panel title="Google Cloud" note={cloud ? `${cloud.project} · ${cloud.lastExportAt ? `export as of ${dateLabel(cloud.lastExportAt)}` : 'billing export'}` : 'billing export'} wide>
      {gcp.loading ? <p className="dashboard-empty">Reading the billing export…</p>
        : !cloud ? <div className="section-unavailable"><p className="dashboard-empty">{gcp.error || (gcp.data?.reason ? GCP_SETUP[gcp.data.reason] : 'GCP billing is unavailable.')}</p><p className="source-detail">In the Cloud console: Billing → Billing export → Standard usage cost → export to {gcp.data?.dataset || 'the billing_export dataset'}. The first rows arrive within a few hours; earlier history is not included.</p></div>
        : <>
          {behind && <p className="dashboard-notice" role="status">The billing export is still catching up: it has reached {behind}, and this month's figures appear once it gets here. The connection itself is fine.</p>}
          <div className="system-summary-grid"><div><span>This month · after credits</span><strong>{money(cloud.currency, cloud.costThisMonth)}</strong></div><div><span>Before credits · credits</span><strong>{money(cloud.currency, cloud.grossThisMonth)} · {money(cloud.currency, cloud.creditsThisMonth)}</strong></div><div><span>Hosting · Gemini</span><strong>{money(cloud.currency, cloud.hostingThisMonth)} · {money(cloud.currency, cloud.llmThisMonth)}</strong></div><div><span>Lifetime{cloud.dataSince ? ` · since ${dateLabel(`${cloud.dataSince}T12:00:00`)}` : ''}</span><strong>{money(cloud.currency, cloud.costAllTime)}</strong></div></div>
          <div className="day-group"><h3>Last 7 days</h3><CostTrend daily={cloud.daily} currency={cloud.currency || 'USD'} /></div>
          <div className="day-group"><h3>By service</h3>{cloud.services?.length ? <ul className="dashboard-data-list">{cloud.services.map(s => <li key={s.name}><strong>{money(cloud.currency, s.cost)} · {s.name}</strong>{s.gross !== s.cost && <small>{money(cloud.currency, s.gross)} before credits</small>}</li>)}</ul> : <p className="dashboard-empty">No charges yet this month.</p>}</div>
          {!!cloud.topSkus?.length && <div className="day-group"><h3>Top line items</h3><ul className="dashboard-data-list">{cloud.topSkus.map(s => <li key={`${s.service}-${s.name}`}><strong>{money(cloud.currency, s.cost)} · {s.name}</strong><small>{s.service}</small></li>)}</ul></div>}
        </>}
    </Panel>
    <Panel title="Twilio" note="live account read" wide>
      {unavailable ? <div className="section-unavailable"><p className="dashboard-empty">{unavailable}</p><p className="source-detail">The system owner can check the Twilio credentials and account permissions.</p></div> : <div className="system-summary-grid"><div><span>Balance</span><strong>{balance}</strong></div><div><span>SMS messages sent · this month</span><strong>{loading ? '…' : billing?.smsMessagesSent ?? '—'}</strong></div><div><span>SMS cost · this month</span><strong>{loading ? '…' : billing?.smsCostThisMonth != null && billing?.balance?.currency ? `${billing.balance.currency} ${billing.smsCostThisMonth.toFixed(2)}` : '—'}</strong></div><div><span>Lifetime · all charges</span><strong>{loading ? '…' : money(billing?.balance?.currency, billing?.costAllTime)}</strong></div></div>}
    </Panel>
  </SectionPage>;
}

// --- Heart data -----------------------------------------------------------
// Whoop already sends resting heart rate, HRV and blood oxygen with every
// recovery, and a daily average heart rate with every cycle. None of it means
// much as a single number, so everything below reads today against the days
// behind it rather than against a population.

/** What these numbers are aiming at. Change them here and the card follows. */
const HEART_GOALS = { restingHeartRate: 55, hrvMs: 60 };
/** Days averaged as "recent", and the fewest older days worth comparing to. */
const RECENT_DAYS = 3, MIN_BASELINE_DAYS = 3;

/** Mean of the finite numbers `pick` finds, or null when it finds none. */
function average<T>(rows: T[], pick: (row: T) => number | null | undefined) {
  const values = rows.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
interface Trending { direction: 'up' | 'down' | 'steady'; delta: number; recent: number; baseline: number; baselineDays: number }
/**
 * The last few days against the days before them. `rows` newest first.
 * `deadband` is the change small enough to call flat — day-to-day noise in
 * these numbers is a beat or two, and an arrow that flips every morning is
 * worse than no arrow.
 */
function trendOf<T>(rows: T[], pick: (row: T) => number | null | undefined, deadband: number): Trending | null {
  const recent = average(rows.slice(0, RECENT_DAYS), pick);
  const older = rows.slice(RECENT_DAYS);
  const baseline = older.length >= MIN_BASELINE_DAYS ? average(older, pick) : null;
  if (recent === null || baseline === null) return null;
  const delta = recent - baseline;
  return { direction: Math.abs(delta) < deadband ? 'steady' : delta > 0 ? 'up' : 'down', delta, recent, baseline, baselineDays: older.length };
}
type ReadinessLevel = 'go' | 'rest' | 'warning';
/** `headline` is the few words a stat tile has room for; `reason` is the whole
 *  argument, for the card that can afford it. */
interface Readiness { level: ReadinessLevel; label: string; headline: string; reason: string }
/**
 * GO, REST or WARNING, from today's recovery read against the fortnight behind
 * it.
 *
 * The rules are deliberately dull, and the card states the ones that fired, so
 * a verdict can always be argued with. Resting heart rate climbing while HRV
 * falls is the shape an infection tends to make, which is why the two of them
 * together outrank a merely poor recovery score — but this is a reason to pay
 * attention, not a diagnosis, and the card says so.
 *
 * Blood oxygen is read against your own nights, not a population line: WHOOP
 * measures it asleep, where 92–96% is ordinary for plenty of people, and a
 * fixed 95% cut-off flagged a normal night as a warning. It counts when it sits
 * well under your usual or genuinely low, and it is worded as one signal —
 * never folded into the "two signals" sentence it isn't part of.
 */
function readinessOf(today: RecoveryDay | undefined, prior: RecoveryDay[], sleepPercent: number | null): Readiness | null {
  if (!today || today.state !== 'SCORED') return null;
  const score = today.recovery_score;
  const baseRhr = average(prior, r => r.resting_heart_rate);
  const baseHrv = average(prior, r => r.hrv_ms);
  const baseSpo2 = average(prior, r => r.spo2_percent);
  const rhrUp = baseRhr !== null && today.resting_heart_rate != null ? today.resting_heart_rate - baseRhr : null;
  const hrvOff = baseHrv !== null && today.hrv_ms != null ? (today.hrv_ms - baseHrv) / baseHrv : null;
  const spo2 = today.spo2_percent ?? null;
  const spo2Drop = baseSpo2 !== null && spo2 !== null ? baseSpo2 - spo2 : null;
  const lowOxygen = spo2 !== null && (spo2 < 90 || (spo2Drop !== null && spo2Drop >= 3));
  const infectionShape = rhrUp !== null && rhrUp >= 4 && hrvOff !== null && hrvOff <= -.2;

  const notes: string[] = [];
  if (rhrUp !== null && rhrUp >= 3) notes.push(`resting HR ${rhrUp.toFixed(1)} bpm over baseline`);
  if (hrvOff !== null && hrvOff <= -.15) notes.push(`HRV ${Math.round(-hrvOff * 100)}% under baseline`);
  if (lowOxygen || (spo2Drop !== null && spo2Drop >= 2)) {
    notes.push(`blood oxygen ${spo2!.toFixed(1)}%${baseSpo2 !== null ? ` (usually ${baseSpo2.toFixed(1)}%)` : ''}`);
  }
  if (sleepPercent !== null && sleepPercent < 60) notes.push(`slept ${sleepPercent}% of need`);
  const said = notes.length ? `${notes.join(' · ')}.` : '';

  if (infectionShape) {
    // `said` has already listed the numbers (blood oxygen among them when it
    // counts), so this sentence only has to say what they add up to — plainly,
    // and as a pattern rather than a diagnosis.
    return { level: 'warning', label: 'WARNING', headline: 'Resting HR up while HRV is down', reason: `${said} Resting heart rate up and HRV down together often means your body is fighting something off. It’s a pattern, not a diagnosis — take it easy today and get to bed early.` };
  }
  if (lowOxygen) {
    return { level: 'warning', label: 'WARNING', headline: 'Blood oxygen is low', reason: `${said} Well under your usual overnight reading. One night can be a loose strap; if it stays low, or you feel short of breath, take it seriously.` };
  }
  if ((score != null && score < 34) || (rhrUp !== null && rhrUp >= 4) || (hrvOff !== null && hrvOff <= -.2) || (sleepPercent !== null && sleepPercent < 60)) {
    return { level: 'rest', label: 'REST', headline: notes[0] || `Recovery ${score}%`, reason: said || `Recovery is ${score}%. Keep today light and let it come back.` };
  }
  return { level: 'go', label: 'GO', headline: notes[0] || 'Nothing flagging', reason: said ? `${said} Nothing else is flagging — go, but keep an eye on it.` : `Recovery ${score}%, heart rate and HRV sitting where they usually do. Go.` };
}
/** A number and its unit, spaced the way that unit wants to be read. */
const withUnit = (value: string, unit: string) => (unit === '%' || !unit ? `${value}${unit}` : `${value} ${unit}`);
/** Which way is the good way for this number — or neither, for the ones that
 *  are only ever a fact about the day. */
type Better = 'lower' | 'higher' | 'flat';
/** An arrow that knows which direction is the good one for this number. */
function TrendArrow({ trend, better, unit, decimals = 0 }: { trend: Trending | null | undefined; better: Better; unit: string; decimals?: number }) {
  if (!trend) return null;
  const good = trend.direction === 'steady' || better === 'flat' ? 'steady'
    : (trend.direction === 'down') === (better === 'lower') ? 'good' : 'bad';
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
  return <span className={`heart-trend heart-trend-${good}`}>
    {arrow} {trend.direction === 'steady' ? 'steady' : withUnit(Math.abs(trend.delta).toFixed(decimals), unit)}
  </span>;
}
/**
 * One heart number and which way it is going.
 *
 * The tile carries the number and the arrow and nothing else. The goal it is
 * walking towards, the day it belongs to and the span the arrow compares are
 * all true and all worth having, but none of them are worth a row on a card
 * this size, so they wait behind the marker beside the label.
 */
function HeartMetric({ label, value, display, unit, goal, better, trend, decimals = 0, note }: {
  label: string; value?: number | null; display?: ReactNode; unit: string;
  goal?: number; better: Better; trend?: Trending | null; decimals?: number; note?: string | null;
}) {
  const has = typeof value === 'number' && Number.isFinite(value);
  const met = has && goal !== undefined && (better === 'lower' ? value! <= goal : value! >= goal);
  const away = has && goal !== undefined ? Math.abs(value! - goal) : null;
  const goalLine = goal === undefined ? null
    : !has ? `Goal ${withUnit(String(goal), unit)}.`
      : met ? `Goal ${withUnit(String(goal), unit)} — met.`
        : `Goal ${withUnit(String(goal), unit)} — ${withUnit(away!.toFixed(decimals), unit)} to go.`;
  const trendLine = trend && `Arrow: the last ${RECENT_DAYS} days averaged ${withUnit(trend.recent.toFixed(decimals), unit)} against ${withUnit(trend.baseline.toFixed(decimals), unit)} over the ${trend.baselineDays} days before.`;
  return <div className={met ? 'heart-metric heart-met' : 'heart-metric'}>
    <span>{label}<Hint label={`About ${label.toLowerCase()}`} title={label.toUpperCase()} lines={[note, goalLine, trendLine]} /></span>
    <strong>{display ?? (has ? value!.toFixed(decimals) : '—')}{display === undefined && <em className={unit === '%' ? 'heart-unit-tight' : undefined}>{unit}</em>}</strong>
    <TrendArrow trend={trend} better={better} unit={unit} decimals={decimals} />
  </div>;
}

/**
 * A marker that keeps something worth knowing out of the way until it is
 * asked for.
 *
 * A card has a handful of rows and every one of them is spoken for, so a goal,
 * a date or the span an arrow compares waits behind this rather than spending
 * one. The note floats over what follows instead of pushing it down, pinned to
 * the marker from a portal, since the card clips its own overflow.
 */
function Hint({ label, title, lines, glyph = '?', className = 'hint', noteClassName = 'hint-note' }: {
  label: string; title?: string; lines: (string | null | undefined | false)[];
  glyph?: string; className?: string; noteClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const badge = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && (wrap.current?.contains(event.target as Node) || note.current?.contains(event.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, [open]);
  // Pin the note to the badge in viewport coordinates: below it when there is
  // room, above it when there is not, and never past a screen edge or under
  // the phone's bottom nav.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const at = badge.current?.getBoundingClientRect();
      const el = note.current;
      if (!at || !el) return;
      const gap = 8, edge = 12;
      const nav = document.querySelector('.mobile-navigation');
      const floor = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : window.innerHeight;
      const { width, height } = el.getBoundingClientRect();
      const left = Math.min(Math.max(at.left + at.width / 2 - width / 2, edge), window.innerWidth - width - edge);
      const below = at.bottom + gap;
      const above = below + height > floor - edge && at.top - gap - height >= edge;
      el.style.left = `${left}px`;
      el.style.top = `${above ? at.top - gap - height : below}px`;
      el.style.setProperty('--caret-x', `${at.left + at.width / 2 - left}px`);
      el.dataset.side = above ? 'above' : 'below';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  const said = lines.filter((line): line is string => typeof line === 'string' && line.length > 0);
  if (!said.length) return null;
  return <span className={className} ref={wrap}>
    <button ref={badge} type="button" className={`hint-badge${open ? ' open' : ''}`} aria-expanded={open}
      aria-label={label} onClick={() => setOpen(value => !value)}>{glyph}</button>
    {/* Portalled so the card's clipped overflow can't cut it off. */}
    {open && createPortal(<span ref={note} className={`hint-float ${noteClassName}`} role="status">{title && <span className="dashboard-eyebrow">{title}</span>}{said.map((line, i) => <span key={i}>{line}</span>)}</span>, document.body)}
  </span>;
}

/** The recovery dial. The arc is the score, not decoration: it sweeps from the
    top and is coloured by the same thresholds the Recovery stat tile uses. */
function RecoveryRing({ score }: { score: number | null | undefined }) {
  const pct = score == null ? 0 : Math.min(100, Math.max(0, score));
  const circumference = 2 * Math.PI * 34;
  const tone = score == null ? '#2f5d6c' : score >= 67 ? '#33dfb5' : score >= 34 ? '#e8c35c' : '#ff8267';
  return <div className="recovery-ring" role="img" aria-label={score == null ? 'No recovery score' : `Recovery ${score} percent`}>
    <svg viewBox="0 0 76 76" aria-hidden="true">
      <circle className="recovery-ring-track" cx="38" cy="38" r="34" />
      <circle className="recovery-ring-fill" cx="38" cy="38" r="34" stroke={tone}
        strokeDasharray={`${(circumference * pct) / 100} ${circumference}`} />
    </svg>
    <span className="recovery-ring-label">{score ?? '—'}<small>%</small></span>
  </div>;
}

/** YYYY-MM-DD in a named zone, so "today" means the person's today. */
function zonedDay(value: Date | string, timeZone?: string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
/** The day an event belongs under. All-day starts are already calendar dates. */
const eventDay = (event: CalendarEvent, timeZone?: string) => (event.allDay ? event.start : zonedDay(event.start, timeZone));
function eventTime(event: CalendarEvent, timeZone?: string) {
  if (event.allDay) return 'All day';
  return new Date(event.start).toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' });
}
function dayHeading(key: string, today: string) {
  const date = new Date(`${key}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return key;
  const days = Math.round((date.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
  const label = date.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
  return days === 0 ? `Today · ${label}` : days === 1 ? `Tomorrow · ${label}` : label;
}

export function Dashboard({ section = 'Home', firstName, onAsk, onPanel, onPlaces, onNavigate, compact = false, onExpand }: {
  section?: DashboardSection;
  firstName: string; onAsk: (text: string) => void;
  onPanel: OpenPanel;
  onPlaces?: () => void;
  onNavigate?: (section: DashboardSection) => void;
  compact?: boolean; onExpand?: () => void;
}) {
  const data = useDashboardData();
  const summary = data.summary.data;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  // Bumped after propose/confirm/decline/dismiss so MailPage's own list refetches —
  // it does not live in useDashboardData, same reasoning as places/projects below.
  const [mailRefresh, setMailRefresh] = useState(0);
  const [mailItems, setMailItems] = useState<TriageEmail[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState('');
  const [mailScanning, setMailScanning] = useState(false);
  const [mailScanNote, setMailScanNote] = useState('');
  const [healthName, setHealthName] = useState('');
  const [healthSymptom, setHealthSymptom] = useState('');
  const [healthSeverity, setHealthSeverity] = useState<HealthSeverity>('mild');
  const [healthNotes, setHealthNotes] = useState('');
  const [healthSaving, setHealthSaving] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [healthResolving, setHealthResolving] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const now = useNow(30000);
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(loadCollapsed);
  const isCollapsed = (id: string) => collapsedMap[id] ?? isPhoneWidth();
  const toggleCollapsed = (id: string) => {
    const next = { ...collapsedMap, [id]: !isCollapsed(id) };
    setCollapsedMap(next);
    try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* a per-browser nicety; the cards work without it */ }
  };

  /**
   * Straight back to the provider's consent screen, the same way the Connected
   * apps panel does it. Anything that can't be finished from a card — consent
   * to record, an unknown provider, the server refusing — opens that panel,
   * which knows how to say why.
   */
  const reconnect = async (provider?: string) => {
    if (!provider) return onPanel('integrations');
    setReconnecting(provider);
    try {
      const { authorize_url } = await integrationsApi.connect(provider, window.location.origin);
      // Google blocks embedded user agents; Android hands consent to the system browser.
      if (isAndroidCompanion()) await androidCall('openExternal', { url: authorize_url });
      else window.location.assign(authorize_url);
    } catch (e) {
      // Health providers need consent first; land on that prompt, not the list.
      onPanel('integrations', (e as ApiError).code === 'consent_required' ? { consentFor: provider } : undefined);
    } finally {
      setReconnecting(null);
    }
  };
  const fixFor = (key: keyof DashboardSummary): SourceFix => ({
    reconnect: () => void reconnect(SOURCE_PROVIDER[key]),
    panel: () => onPanel('integrations', { consentFor: SOURCE_PROVIDER[key] }),
    retry: () => void data.refresh(),
    busy: !!reconnecting && reconnecting === SOURCE_PROVIDER[key],
  });
  const unavailable = (key: keyof DashboardSummary, name: string) => <Unavailable source={summary?.[key] as Source<unknown> | undefined} name={name} fix={fixFor(key)} />;
  const retryData = () => void data.refresh();

  // Only fetched while the Mail page is actually open — 2,000 emails do not
  // belong in the dashboard summary blob the way a week of calendar does.
  useEffect(() => {
    if (section !== 'Mail' || compact) return;
    let active = true;
    setMailLoading(true);
    setMailError('');
    dashboardApi.mailList({ status: 'new', limit: 200 })
      .then(res => { if (active) { setMailItems(res.items); setMailLoading(false); } })
      .catch(e => { if (active) { setMailError((e as Error).message); setMailLoading(false); } });
    return () => { active = false; };
  }, [section, compact, mailRefresh]);

  const scanMoreMail = async () => {
    setMailScanning(true);
    setMailError('');
    setMailScanNote('');
    try {
      const res = await dashboardApi.mailScan();
      setMailScanNote(`Scanned ${res.scanned}, ${res.newCount} new to review.`);
      setMailRefresh(n => n + 1);
      void data.refresh();
    } catch (e) {
      setMailError((e as Error).message);
    } finally {
      setMailScanning(false);
    }
  };
  const submitHealthReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!healthName.trim() || !healthSymptom.trim()) return;
    setHealthSaving(true);
    setHealthError('');
    try {
      await dashboardApi.reportFamilyHealth({ personName: healthName.trim(), symptom: healthSymptom.trim(), severity: healthSeverity, notes: healthNotes.trim() || undefined });
      setHealthName(''); setHealthSymptom(''); setHealthSeverity('mild'); setHealthNotes('');
      void data.refresh();
    } catch (e) {
      setHealthError((e as Error).message || 'Could not save that.');
    } finally {
      setHealthSaving(false);
    }
  };
  const resolveHealthStatus = async (uuid: string) => {
    setHealthResolving(uuid);
    setHealthError('');
    try {
      await dashboardApi.resolveFamilyHealth(uuid);
      void data.refresh();
    } catch (e) {
      setHealthError((e as Error).message || 'Could not update that.');
    } finally {
      setHealthResolving(null);
    }
  };
  const facts = data.facts.data || [];
  const family = facts.filter(f => /^(person|family|pet)$/i.test(f.category));
  const projects = facts.filter(f => /^(goal|project)$/i.test(f.category));
  // Community: what is happening around the places this person watches (the
  // incident watcher's stored situation — calls and NWS alerts, whether or not
  // they rose to a banner), and the places they have told Athena about.
  const communityPlaces = facts.filter(f => /^place$/i.test(f.category));
  const community = data.community.data;
  const nextLocalEvent = (community?.events || []).find(e => !isPastEvent(e));
  const nearbyCalls = data.nearby.data?.incidents || [];
  const nearbyWeather = data.nearby.data?.weather || [];
  const issues = summary?.jira.data?.issues || [];
  // Already ordered by when Athena read them, which is the only timestamp that
  // is always there and always honest — half of `published` is missing and some
  // of the rest is the moment the page was rebuilt.
  const news = data.news.data?.items || [];
  const newsSources = data.news.data?.sources || [];
  const pending = (data.actions.data || []).filter(a => a.status === 'pending');
  const latest = <T extends { date: string }>(rows?: T[] | null) => [...(rows || [])].sort((a, b) => b.date.localeCompare(a.date))[0];
  const newestFirst = <T extends { date: string }>(rows?: T[] | null) => [...(rows || [])].sort((a, b) => b.date.localeCompare(a.date));
  const scoredDays = newestFirst(summary?.recovery.data?.filter(r => r.state === 'SCORED'));
  const strainDays = newestFirst(summary?.strain.data);
  const recovery = scoredDays[0];
  // Deadbands: a beat of resting heart rate, two milliseconds of HRV. Below
  // those an arrow is reporting the noise floor, not a direction.
  const rhrTrend = trendOf(scoredDays, r => r.resting_heart_rate, 1);
  const hrvTrend = trendOf(scoredDays, r => r.hrv_ms, 2);
  const avgHrTrend = trendOf(strainDays, s => s.average_heart_rate, 1);
  const spo2Trend = trendOf(scoredDays, r => r.spo2_percent, .3);
  const strainTrend = trendOf(strainDays, s => s.day_strain, .5);
  const sleepDays = newestFirst(summary?.sleep.data?.filter(s => !s.nap));
  const sleep = sleepDays[0];
  // A quarter of an hour: less than that between one stretch of nights and the
  // next is when you went to bed, not how you are sleeping.
  const sleepTrend = trendOf(sleepDays, s => s.hours_asleep, .25);
  const strain = strainDays[0];
  const readiness = readinessOf(recovery, scoredDays.slice(1), sleep?.sleep_performance_percent ?? null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const ready = (source?: Source<unknown>) => source?.status === 'ready';
  const go = (target: DashboardSection) => () => onNavigate?.(target);

  // Shared derivations the section pages read from.
  const timeZone = summary?.calendar.data?.timeZone;
  const events = summary?.calendar.data?.events || [];
  // What on the calendar mentions where they live: soccer practice, the games, the 5K.
  const today = zonedDay(new Date(), timeZone);
  const todayEvents = events.filter(e => eventDay(e, timeZone) === today);
  const nextEvent = events.find(e => !e.allDay && new Date(e.start).getTime() > Date.now()) || todayEvents[0];
  const chores = summary?.familyChores.data?.chores || [];
  const sickFamily = summary?.familyHealth.data?.active || [];
  const choresDone = chores.filter(c => c.completed).length;
  const familyPeople = data.familyPeople.data;
  const roster = buildFamilyRoster({ facts: family, sick: sickFamily, events, now: new Date(now), children: familyPeople?.children, links: familyPeople?.links });
  // Community: what mentions where they live, plus the games and recitals of the people in their corner.
  const communityCal = communityEvents(data.communityCalendar.data?.events ?? events, community?.places || [], new Date(now), roster.filter(r => r.relation !== 'Pet').map(r => r.name));
  const hoursMinutes = (hours: number) => `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  /** The last `days` calendar days, oldest first, so a gap reads as a gap. */
  function week<T extends { date: string }>(rows: T[] | null | undefined, value: (row: T) => number | null) {
    const byDate = new Map((rows || []).map(row => [row.date, row]));
    return Array.from({ length: 7 }, (_, i) => {
      const date = zonedDay(new Date(Date.now() - (6 - i) * 86400000), timeZone);
      const row = byDate.get(date);
      return { date, value: row ? value(row) : null };
    });
  }

  function calendarBody(limit: number) {
    const source = summary?.calendar;
    if (!ready(source)) return <SourceNote source={source} name="Google Calendar" fix={fixFor('calendar')} />;
    // The lead is whatever is on now or comes next, with a countdown; it is not
    // repeated in the list under it. Distance and drive time are not known here —
    // an event carries only its location text — so none is claimed.
    const lead = nextUp(events, now);
    const rest = lead ? events.filter(e => e !== lead.event) : events;
    return <>{lead && <div className="next-up"><small>{lead.ongoing ? 'ON NOW' : 'NEXT UP'}</small><strong>{lead.event.title}</strong><span>{lead.ongoing ? `ends in ${untilLabel(lead.ms)}` : lead.ms < 12 * 3600000 ? `in ${untilLabel(lead.ms)} · ${eventTime(lead.event, source?.data?.timeZone)}` : `${dateLabel(lead.event.start, { timeZone: source?.data?.timeZone, weekday: 'short' })} · ${eventTime(lead.event, source?.data?.timeZone)}`}{lead.event.location ? ` · ${lead.event.location}` : ''}</span></div>}
      <p className="source-note">Next 7 days · {source?.data?.timeZone}</p>{!events.length && <p className="dashboard-empty">No upcoming events in this window.</p>}<ul className="dashboard-data-list calendar-events">{rest.slice(0, lead ? limit - 1 : limit).map((event, index) => <li key={`${event.id}-${index}`}><span className="event-dot" /><div><small>{event.allDay ? `${dateLabel(`${event.start}T12:00:00Z`, { timeZone: 'UTC' })} · All day` : `${dateLabel(event.start, { timeZone })} · ${eventTime(event, timeZone)}`}</small><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.shared && <small>{event.calendar}</small>}</div></li>)}</ul></>;
  }
  /** The heart tiles, in the one place the card and the Health page agree on. */
  function heartMetrics(wide = false) {
    return <>
      <HeartMetric label="Resting HR" value={recovery?.resting_heart_rate} unit="bpm" goal={HEART_GOALS.restingHeartRate} better="lower" trend={rhrTrend}
        note={recovery ? `WHOOP's resting heart rate for ${dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' })}.` : null} />
      <HeartMetric label="HRV" value={recovery?.hrv_ms} unit="ms" goal={HEART_GOALS.hrvMs} better="higher" trend={hrvTrend}
        note={recovery ? `Heart rate variability for ${dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' })}. Higher is a body with more left in it.` : null} />
      <HeartMetric label="Avg HR" value={strain?.average_heart_rate} unit="bpm" better="lower" trend={avgHrTrend}
        note={strain ? `Your average over the whole of ${dateLabel(`${strain.date}T12:00:00Z`, { timeZone: 'UTC' })}, asleep and awake.` : null} />
      <HeartMetric label="Sleep" value={sleep?.hours_asleep} display={sleep ? hoursMinutes(sleep.hours_asleep) : undefined} unit="h" better="higher" trend={sleepTrend} decimals={1}
        note={sleep?.sleep_performance_percent != null ? `${sleep.sleep_performance_percent}% of the sleep your body asked for on ${dateLabel(`${sleep.date}T12:00:00Z`, { timeZone: 'UTC' })}.` : 'No sleep recorded.'} />
      <HeartMetric label="Day strain" value={strain?.day_strain} unit="" better="flat" trend={strainTrend} decimals={1}
        note={strain ? `WHOOP's 0–21 exertion score for ${dateLabel(`${strain.date}T12:00:00Z`, { timeZone: 'UTC' })}.` : 'No strain recorded.'} />
      {wide && <HeartMetric label="Blood oxygen" value={recovery?.spo2_percent} unit="%" better="higher" trend={spo2Trend} decimals={1}
        note="Overnight blood oxygen. Under 95% alongside a raised heart rate is worth noticing." />}
    </>;
  }
  /**
   * One WHOOP link feeds recovery, sleep and strain, so when all three are
   * down for the same reason they are one line and one Reconnect, not three.
   */
  function whoopNotes() {
    const down = (['recovery', 'sleep', 'strain'] as const).filter(key => !ready(summary?.[key]));
    if (!down.length) return null;
    if (down.every(key => summary?.[key]?.status === summary?.[down[0]]?.status && !summary?.[key]?.detail)) return <SourceNote source={summary?.[down[0]]} name="WHOOP" fix={fixFor(down[0])} />;
    return down.map(key => <SourceNote key={key} source={summary?.[key]} name={`WHOOP ${key}`} fix={fixFor(key)} />);
  }
  function healthBody() {
    // With WHOOP never linked there is no ring or tile to draw — only the Connect.
    const whoopUnlinked = (['recovery', 'sleep', 'strain'] as const).every(key => summary?.[key]?.status === 'not_connected');
    return <>{!whoopUnlinked && <><div className="recovery-preview"><RecoveryRing score={recovery?.recovery_score} />
      <p>{readiness ? <span className={`readiness readiness-${readiness.level}`}>{readiness.label}</span> : 'Latest recovery'}<small>{recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'}</small></p></div>
      {readiness && <p className="readiness-reason">{readiness.reason}</p>}
      <div className="health-metrics">{heartMetrics()}</div></>}
      {whoopNotes()}
      </>;
  }
  function workBody(limit: number) {
    return <>
      <SourceBlock source={summary?.jira} label="Jira · assigned open issues" name="Jira" fix={fixFor('jira')}>
        {!issues.length && <p className="dashboard-empty">No assigned open issues returned.</p>}<Issues issues={issues.slice(0, limit)} />{summary?.jira.data?.partial && <p className="source-note">Some sites could not be included.</p>}
      </SourceBlock>
      <SourceBlock source={summary?.slack} label="Slack · recent mentions" name="Slack" fix={fixFor('slack')}>
        <ul className="dashboard-data-list">{summary?.slack.data?.messages.slice(0, limit).map(m => <li key={m.timestamp}><ExternalLink url={m.url}><strong>#{m.channel}</strong><small>{m.text}</small></ExternalLink></li>)}</ul>{!summary?.slack.data?.messages.length && <p className="dashboard-empty">No mentions returned in the last 7 days.</p>}
      </SourceBlock></>;
  }
  function emailPreviewLine(email: TriageEmail) {
    const who = email.from_name || email.from_address || 'Unknown sender';
    return <li key={email.uuid}><button className="dashboard-link-row" onClick={() => setSelectedEmail(email.uuid)}><strong>{email.subject || '(no subject)'}</strong><small>{who} · {CATEGORY_LABEL[email.category]}</small></button></li>;
  }
  function mailBody(limit: number) {
    const source = summary?.emailTriage;
    if (!ready(source)) return <SourceNote source={source} name="Gmail" fix={fixFor('emailTriage')} />;
    const preview = source?.data?.preview || [];
    const pending = source?.data?.pendingCount || 0;
    const bundles = source?.data?.bundles;
    const open = source?.data?.newCount || 0;
    return <><p className="source-note">{open} open{pending ? ` · ${pending} new, sorting` : ''}</p>
      {!open && (mailScanning ? <p className="dashboard-empty">Scanning your inbox…</p>
        : mailScanNote ? <p className="dashboard-empty">{mailScanNote}</p>
          : <EmptyCta text="Nothing new to sort." action="Scan more" onClick={() => void scanMoreMail()} />)}
      {open > 0 && (bundles
        ? <MailBundles bundles={bundles} compact onOpenEmail={setSelectedEmail} onChanged={mailChanged} onReviewEvents={go('Mail')} />
        : <ul className="dashboard-data-list">{preview.slice(0, limit).map(emailPreviewLine)}</ul>)}</>;
  }
  /** After any mail action: refetch the page list and the card's summary. */
  function mailChanged() { setMailRefresh(n => n + 1); void data.refresh(); }
  function rosterRow(r: RosterRow) {
    const resolving = r.signal.healthUuid && healthResolving === r.signal.healthUuid;
    const press = () => r.signal.healthUuid ? void resolveHealthStatus(r.signal.healthUuid) : onAsk(r.signal.ask);
    return <li key={r.id} className={`roster-row roster-${r.signal.kind}`}>
      <ContactAvatar name={r.name} photoUrl={r.photoUrl} />
      <div><strong>{r.name}{r.relation && <em>{r.relation}</em>}</strong><small>{r.signal.label}</small></div>
      <button type="button" className="roster-action" disabled={!!resolving} onClick={press}>{resolving ? 'Updating…' : r.signal.action}</button>
    </li>;
  }
  /** One row per person, most pressing first; the card never goes quiet — thin or stale knowledge is itself the prompt. */
  function familyCardBody() {
    if (data.facts.error && !roster.length) return <EmptyCta text="Memories couldn’t load." action="Retry" onClick={retryData} />;
    if (data.facts.loading && !roster.length) return <p className="dashboard-empty">Loading…</p>;
    if (!roster.length) return <EmptyCta text="Athena doesn’t know your people yet." action="Tell her about your family" onClick={() => onAsk('Let me tell you about my family. Ask me about each person — who they are, birthdays, what is going on in their lives.')} />;
    return <>
      <ul className="dashboard-data-list roster-list">{roster.slice(0, FAMILY_CARD_ROWS).map(rosterRow)}</ul>
      {roster.length > FAMILY_CARD_ROWS && <p className="source-note">+{roster.length - FAMILY_CARD_ROWS} more on the Family page</p>}
      <button type="button" className="source-fix" onClick={() => onAsk('I want to add someone to my family. Ask me who they are and what you should know.')}>Add someone <span>↗</span></button>
    </>;
  }
  function communityEventList(list: ReturnType<typeof communityEvents>) {
    return <ul className="dashboard-data-list calendar-events">{list.map((c, i) => <li key={`${c.event.id}-${i}`}><span className="event-dot" /><div><strong>{c.what}</strong><small>{c.when}{c.who ? ` · ${c.who}` : ''}</small></div></li>)}</ul>;
  }
  function healthStatusLine(h: FamilyHealthStatus) {
    return <li key={h.uuid}>
      <strong>{h.personName} · {h.symptom}</strong>
      <small>{h.severity} · day {h.daysActive}{h.notes ? ` · ${h.notes}` : ''}</small>
    </li>;
  }
  function familyHealthPanel() {
    return <>
      {sickFamily.length > 0 && <ul className="dashboard-data-list family-health-list">{sickFamily.map(h => <li key={h.uuid}>
        <strong>{h.personName} · {h.symptom}</strong>
        <small>{h.severity} · day {h.daysActive}{h.notes ? ` · ${h.notes}` : ''}</small>
        <button className="dashboard-chat-cta" disabled={healthResolving === h.uuid} onClick={() => void resolveHealthStatus(h.uuid)}>{healthResolving === h.uuid ? 'Updating…' : 'Feeling better?'}</button>
      </li>)}</ul>}
      {!sickFamily.length && <p className="dashboard-empty">Nobody's reported under the weather right now.</p>}
      <form className="dashboard-form" onSubmit={submitHealthReport}>
        <p className="source-note">Log a symptom — Athena will know, and can nudge the household about precautions.</p>
        <input placeholder="Who (e.g. Thomas)" value={healthName} onChange={e => setHealthName(e.target.value)} maxLength={120} required />
        <input placeholder="What you noticed (e.g. a slight cough)" value={healthSymptom} onChange={e => setHealthSymptom(e.target.value)} maxLength={200} required />
        <select value={healthSeverity} onChange={e => setHealthSeverity(e.target.value as HealthSeverity)}>
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe</option>
        </select>
        <input placeholder="Notes (optional)" value={healthNotes} onChange={e => setHealthNotes(e.target.value)} maxLength={500} />
        {healthError && <p className="dashboard-notice" role="status">{healthError}</p>}
        <button className="dashboard-chat-cta" type="submit" disabled={healthSaving || !healthName.trim() || !healthSymptom.trim()}>{healthSaving ? 'Saving…' : 'Log it'} <span>↗</span></button>
      </form>
    </>;
  }
  function newsBody(limit: number) {
    const failing = newsSources.filter(s => s.lastError);
    return <>{data.news.loading && <p className="source-note">Loading what I’ve read…</p>}{data.news.error && <><p className="source-note" role="status">News couldn’t load.</p><button type="button" className="source-fix" onClick={retryData}>Retry <span>↗</span></button></>}{data.news.data && !newsSources.length && <EmptyCta text="Paste a news page and I’ll start reading it for you." action="Add a news page" onClick={() => setSourcesOpen(true)} />}{failing.map(s => <p key={s.uuid} className="source-note">Couldn’t read {s.host} last time. {s.lastError}</p>)}{failing.length > 0 && <button type="button" className="source-fix" onClick={() => setSourcesOpen(true)}>Fix {failing.length === 1 ? 'this page' : 'these pages'} <span>↗</span></button>}<ul className="dashboard-data-list">{news.slice(0, limit).map((n, i) => <li key={`${n.url}-${i}`}><ExternalLink url={n.url}><strong>{n.title}</strong><small>{n.source} · {dateLabel(n.firstSeen)}</small></ExternalLink></li>)}</ul>{data.news.data && newsSources.length > 0 && !news.length && <p className="dashboard-empty">Nothing new on these pages yet — I’ll keep looking.</p>}</>;
  }
  // The fixed order. Every card stays, even one whose apps are all unlinked:
  // it carries the Connect buttons that would fill it.
  const ranked = DEFAULT_CARD_ORDER.map(id => ({ id }));
  /**
   * On a phone a card folds to its title and one headline — the single thing
   * worth knowing without opening it (GO for Health, the next event for
   * Calendar). The title toggles it; the headline opens the page. Wider than a
   * phone the fold has no effect and every card is open, as before.
   */
  function card(id: string, name: string, title: string, body: ReactNode, action: string, click: () => void, count?: number, headline?: ReactNode) {
    const folded = isCollapsed(id);
    return <article className={`dashboard-card card-${id}${folded ? ' is-collapsed' : ''}`} id={`dashboard-${name.toLowerCase()}`} key={id}>
      <div className="dashboard-card-head">
        <button className="dashboard-card-heading" aria-expanded={!folded} onClick={() => (isPhoneWidth() ? toggleCollapsed(id) : click())}><DashboardIcon name={name} /><h2>{title}</h2>{count !== undefined && <span className="card-count">{count}</span>}</button>
        <button className="dashboard-card-chevron" onClick={click} aria-label={`Open ${title}`}>›</button>
        <button className="dashboard-card-toggle" onClick={() => toggleCollapsed(id)} aria-label={`${folded ? 'Expand' : 'Collapse'} ${title}`} aria-expanded={!folded}>{folded ? '▾' : '▴'}</button>
      </div>
      {headline && <button className="dashboard-card-headline" onClick={click} aria-label={`Open ${title}`}>{headline}</button>}
      <div className="dashboard-card-body">{body}</div>
      <button className="dashboard-card-action" onClick={click}>{action}<span>↗</span></button>
    </article>;
  }
  // The one datum each card leads with when it is folded. Never invented: a
  // source that can't be read says so, in its own status words.
  const say = (value: ReactNode, note?: ReactNode) => <><strong>{value}</strong>{note && <small>{note}</small>}</>;
  const sayStatus = (source: Source<unknown> | undefined, name: string) => say(source ? statusText[source.status] : 'Loading…', name);
  const lead = nextUp(events, now);
  const openMail = summary?.emailTriage.data?.newCount || 0;
  const needReply = summary?.emailTriage.data?.bundles?.replies.count || 0;
  const whoopDown = (['recovery', 'sleep', 'strain'] as const).every(key => summary?.[key]?.status === 'not_connected');
  const headlines: Record<string, ReactNode> = {
    health: whoopDown ? sayStatus(summary?.recovery, 'WHOOP')
      : readiness ? say(<span className={`readiness readiness-${readiness.level}`}>{readiness.label}</span>, `Recovery ${recovery?.recovery_score}% · ${readiness.headline}`)
        : recovery?.recovery_score != null ? say(`${recovery.recovery_score}%`, 'recovery') : say('—', ready(summary?.recovery) ? 'No scored recovery yet' : 'WHOOP unavailable'),
    family: data.facts.loading && !roster.length ? say('Loading…')
      : roster.length ? say(`${roster[0].name} · ${roster[0].signal.label}`, roster.length > 1 ? `and ${roster.length - 1} more in your corner` : 'in your corner')
        : say('Nobody here yet', 'tell her about your family'),
    community: nearbyWeather.length ? say(nearbyWeather[0].event, nearbyWeather[0].place)
      : nearbyCalls.length ? say(`${nearbyCalls.length} call${nearbyCalls.length === 1 ? '' : 's'} nearby`, nearbyCalls[0].what)
        : communityCal.length ? say(communityCal[0].what, communityCal[0].when)
          : data.nearby.loading ? say('Checking…') : data.nearby.error ? say('Couldn’t load') : say('Quiet', 'near your places'),
    calendar: lead ? say(lead.event.title, lead.ongoing ? `on now · ends in ${untilLabel(lead.ms)}` : `in ${untilLabel(lead.ms)}`)
      : ready(summary?.calendar) ? say('Clear', 'nothing timed coming up') : sayStatus(summary?.calendar, 'Google Calendar'),
    mail: ready(summary?.emailTriage) ? say(openMail, needReply ? `open · ${needReply} need you` : 'open') : sayStatus(summary?.emailTriage, 'Gmail'),
    work: ready(summary?.jira) ? say(issues.length, 'open issues assigned to you') : sayStatus(summary?.jira, 'Jira'),
    news: news[0] ? say(news[0].title, news[0].source) : data.news.loading ? say('Loading…') : say('No headlines yet', newsSources.length ? 'still reading' : 'add a news page'),
    projects: ready(summary?.jira) ? say(new Set(issues.map(i => i.project)).size, `project${new Set(issues.map(i => i.project)).size === 1 ? '' : 's'} with open issues`) : sayStatus(summary?.jira, 'Jira'),
  };
  const cards: Record<string, ReactNode> = {
    // Every card now opens its own page, including when its source is down:
    // the page says what is wrong and carries the button that fixes it, which
    // is more use than dropping someone straight into the settings panel.
    calendar: card('calendar', 'Calendar', 'Calendar', calendarBody(3), 'View schedule', go('Calendar'), summary?.calendar.data?.events.length, headlines.calendar),
    health: card('health', 'Health', 'Health & Performance', healthBody(), 'View health', go('Health'), undefined, headlines.health),
    family: card('family', 'Family', 'Family', familyCardBody(), 'View family', go('Family'), sickFamily.length || undefined, headlines.family),
    community: card('community', 'Community', 'Community', <>
      <p className="source-note">Around your points of interest</p>
      {data.nearby.loading ? <p className="dashboard-empty">Checking nearby…</p>
        : data.nearby.error ? <EmptyCta text="Nearby activity couldn’t load." action="Retry" onClick={retryData} />
          : nearbyCalls.length || nearbyWeather.length ? <ul className="dashboard-data-list">{nearbyWeather.slice(0, 1).map(weatherLine)}{nearbyCalls.slice(0, nearbyWeather.length ? 2 : 3).map(incidentLine)}</ul>
            : <p className="dashboard-empty">Quiet near your places.</p>}
      {communityCal.length > 0 && <><p className="source-note">On your calendar</p>{communityEventList(communityCal.slice(0, 5))}{communityCal.length > 5 && <p className="source-note">+{communityCal.length - 5} more on the Community page</p>}</>}
      {nextLocalEvent && <><p className="source-note">Coming up locally</p><ul className="dashboard-data-list calendar-events"><li><span className="event-dot" /><div><small>{eventWhen(nextLocalEvent)}</small><strong>{nextLocalEvent.title}</strong></div></li></ul></>}
      {community && !community.places.length && onPlaces && <button type="button" className="source-fix" onClick={onPlaces}>Add a point of interest <span>↗</span></button>}
    </>, 'View community', go('Community'), nearbyCalls.length + nearbyWeather.length || undefined, headlines.community),
    mail: card('mail', 'Mail', 'Mail', mailBody(3), 'Review inbox', go('Mail'), summary?.emailTriage.data?.newCount, headlines.mail),
    work: card('work', 'Work', 'Work', workBody(1), 'View work', go('Work'), undefined, headlines.work),
    news: card('news', 'News', 'News & Updates', newsBody(3), 'View news', go('News'), news.length || undefined, headlines.news),
    projects: card('projects', 'Projects', 'Projects', <><SourceBlock source={summary?.jira} label="Jira projects · your assigned issues" name="Jira" fix={fixFor('jira')}>{issues.length ? <ul className="dashboard-data-list">{[...new Set(issues.map(i => i.project))].slice(0, 3).map(project => <li key={project}><strong>{project}</strong><small>{issues.filter(i => i.project === project).length} assigned issues in this snapshot</small></li>)}</ul> : <p className="dashboard-empty">No assigned issues in this snapshot.</p>}</SourceBlock><p className="source-note">Saved goals</p>{projects.length ? <Facts facts={projects.slice(0, 2)} /> : data.facts.error ? <EmptyCta text="Memories unavailable." action="Retry" onClick={retryData} /> : <EmptyCta text="No saved goals yet." action="Tell her what you’re working towards" onClick={() => onAsk('Here is what I am working towards right now.')} />}</>, 'View projects', go('Projects'), undefined, headlines.projects),
  };

  // --- The section pages ---------------------------------------------------
  // Invoked as plain functions below, not as <TodayPage />, for the same
  // reason SectionPage lives outside this component: a type created during
  // render remounts its subtree on every render.
  const ctx: SectionContext = {
    onAsk, onPanel, onHome: go('Home'), error: data.summary.error,
    sourcesOpen, setSourcesOpen, refresh: () => void data.refresh(),
  };

  function TodayPage() {
    const headlines = news.slice(0, 6);
    return <SectionPage ctx={ctx}
      eyebrow="WHAT TODAY ASKS OF YOU" title={`${greeting}, ${firstName}`}
      blurb="Only today. Everything further out is waiting for you in the other sections."
      ask="Walk me through today — what matters most, and what can wait?"
      stats={<>
        <Stat label="Next up" value={nextEvent ? eventTime(nextEvent, timeZone) : '—'} note={nextEvent?.title || (ready(summary?.calendar) ? 'Nothing left today' : 'Calendar unavailable')} />
        <Stat label="Recovery" value={readiness ? readiness.label : recovery?.recovery_score ?? '—'} note={readiness ? `${recovery?.recovery_score}% · ${readiness.headline}` : 'No scored result'} tone={readiness?.level === 'go' ? 'good' : readiness?.level === 'rest' ? 'ok' : readiness?.level === 'warning' ? 'low' : 'idle'} />
        <Stat label="Chores" value={chores.length ? `${choresDone}/${chores.length}` : '—'} note={chores.length ? (choresDone === chores.length ? 'All done' : `${chores.length - choresDone} still open`) : 'Nothing for today'} />
        <Stat label="Waiting on you" value={pending.length} note={pending.length ? 'Athena needs an answer' : 'Nothing to approve'} tone={pending.length ? 'ok' : 'idle'} />
      </>}
    >
      <Panel title="Today’s schedule" note={timeZone} wide>
        {!ready(summary?.calendar) ? unavailable('calendar', 'Google Calendar')
          : !todayEvents.length ? <p className="dashboard-empty">Nothing on the calendar for today.</p>
            : <ul className="dashboard-data-list calendar-events">{todayEvents.map((event, i) => <li key={`${event.id}-${i}`}><span className="event-dot" /><div><small>{eventTime(event, timeZone)}</small><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.shared && <small>{event.calendar}</small>}</div></li>)}</ul>}
      </Panel>
      <Panel title="Waiting on you" note={pending.length ? `${pending.length} open` : undefined}>
        {data.actions.loading ? <p className="dashboard-empty">Checking approvals…</p>
          : data.actions.error ? <EmptyCta text="Approvals couldn’t load." action="Retry" onClick={retryData} />
            : pending.length ? <><ul className="dashboard-data-list">{pending.map(a => <li key={a.uuid}><strong>{a.label}</strong><small>{a.summary}</small></li>)}</ul><button className="dashboard-chat-cta" onClick={() => onPanel('notifications')}>Review them <span>↗</span></button></>
              : <p className="dashboard-empty">Nothing waiting for your approval.</p>}
      </Panel>
      <Panel title="Chores today" note={summary?.familyChores.data?.name}>
        {!ready(summary?.familyChores) ? unavailable('familyChores', 'Family Chores')
          : !chores.length ? <p className="dashboard-empty">No chores returned for today.</p>
            : <ul className="dashboard-data-list chore-list">{chores.map((c, i) => <li key={i} className={c.completed ? 'chore-done' : ''}><strong>{c.completed ? '✓' : '○'} {c.title}</strong><small>{c.completed ? 'Completed' : c.status || 'Open'}</small></li>)}</ul>}
      </Panel>
      <Panel title="Worth a look" note="What I’ve read for you, newest first" wide>
        {headlines.length ? <ul className="dashboard-data-list">{headlines.map((n, i) => <li key={`${n.url}-${i}`}><ExternalLink url={n.url}><strong>{n.title}</strong><small>{n.source} · {dateLabel(n.firstSeen)}</small></ExternalLink></li>)}</ul> : newsBody(6)}
      </Panel>
    </SectionPage>;
  }

  function CalendarPage() {
    const days = [...new Set(events.map(e => eventDay(e, timeZone)))].sort();
    return <SectionPage ctx={ctx}
      eyebrow="THE NEXT SEVEN DAYS" title="Calendar"
      blurb="Everything on your calendars, ongoing and upcoming, grouped by day."
      ask="Help me review my calendar for the week ahead."
      stats={<>
        <Stat label="Next 7 days" value={events.length} note="events in this window" />
        <Stat label="Today" value={todayEvents.length} note={todayEvents.length ? 'on your calendar' : 'clear'} />
        <Stat label="Next up" value={nextEvent ? eventTime(nextEvent, timeZone) : '—'} note={nextEvent?.title || 'Nothing scheduled'} />
        <Stat label="Time zone" value={<span className="stat-small">{timeZone || '—'}</span>} note="as your calendar reports it" />
      </>}
    >
      <Panel title="Your schedule" note={ready(summary?.calendar) ? `${events.length} events` : undefined} wide>
        {!ready(summary?.calendar) ? unavailable('calendar', 'Google Calendar')
          : !days.length ? <p className="dashboard-empty">No upcoming events in this window.</p>
            : days.map(day => <div className="day-group" key={day}>
              <h3>{dayHeading(day, today)}</h3>
              <ul className="dashboard-data-list calendar-events">{events.filter(e => eventDay(e, timeZone) === day).map((event, i) => <li key={`${event.id}-${i}`}><span className="event-dot" /><div><small>{eventTime(event, timeZone)}</small><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.shared && <small>{event.calendar}</small>}</div></li>)}</ul>
            </div>)}
      </Panel>
    </SectionPage>;
  }

  function HealthPage() {
    const recoveryWeek = week(summary?.recovery.data?.filter(r => r.state === 'SCORED'), r => r.recovery_score);
    const sleepWeek = week(summary?.sleep.data?.filter(s => !s.nap), s => s.hours_asleep ?? null);
    const strainWeek = week(summary?.strain.data, s => s.day_strain);
    const rhrWeek = week(summary?.recovery.data?.filter(r => r.state === 'SCORED'), r => r.resting_heart_rate ?? null);
    const hrvWeek = week(summary?.recovery.data?.filter(r => r.state === 'SCORED'), r => r.hrv_ms ?? null);
    const avgHrWeek = week(summary?.strain.data, s => s.average_heart_rate ?? null);
    return <SectionPage ctx={ctx}
      eyebrow="HOW YOUR BODY IS DOING" title="Health & Performance"
      blurb="A week of WHOOP recovery, sleep and strain — read against the fortnight behind it, so a number that moved says so."
      ask="Help me review my WHOOP recovery, heart rate, HRV and sleep. Am I trending the right way?"
      stats={<>
        <Stat label="Today" value={readiness ? readiness.label : '—'} note={readiness ? readiness.headline : 'No scored recovery to judge'} tone={readiness?.level === 'go' ? 'good' : readiness?.level === 'rest' ? 'ok' : readiness?.level === 'warning' ? 'low' : 'idle'} />
        <Stat label="Recovery" value={recovery?.recovery_score ?? '—'} note={recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'} tone={recovery?.recovery_score == null ? 'idle' : recovery.recovery_score >= 67 ? 'good' : recovery.recovery_score >= 34 ? 'ok' : 'low'} />
        <Stat label="Sleep" value={sleep ? hoursMinutes(sleep.hours_asleep) : '—'} note={sleep?.sleep_performance_percent != null ? `${sleep.sleep_performance_percent}% of need` : 'No sleep recorded'} />
        <Stat label="Day strain" value={strain?.day_strain != null ? strain.day_strain.toFixed(1) : '—'} note={strain ? dateLabel(`${strain.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No strain recorded'} />
      </>}
    >
      <Panel title="Heart" note={`goals · ${HEART_GOALS.restingHeartRate} bpm resting, ${HEART_GOALS.hrvMs} ms HRV`} wide>
        {ready(summary?.recovery) ? <div className="health-metrics health-metrics-wide">{heartMetrics(true)}</div>
          : unavailable('recovery', 'WHOOP recovery')}
      </Panel>
      <Panel title="Resting heart rate" note={`45–75 bpm · line is your ${HEART_GOALS.restingHeartRate} goal`}>
        {ready(summary?.recovery) ? <Trend rows={rhrWeek} min={45} max={75} goal={HEART_GOALS.restingHeartRate} unit="resting beats per minute" neutral /> : unavailable('recovery', 'WHOOP recovery')}
      </Panel>
      <Panel title="HRV" note={`20–90 ms · line is your ${HEART_GOALS.hrvMs} goal`}>
        {ready(summary?.recovery) ? <Trend rows={hrvWeek} min={20} max={90} goal={HEART_GOALS.hrvMs} unit="milliseconds of heart rate variability" neutral /> : unavailable('recovery', 'WHOOP recovery')}
      </Panel>
      <Panel title="Average heart rate" note="50–90 bpm · whole day">
        {ready(summary?.strain) ? <Trend rows={avgHrWeek} min={50} max={90} unit="average beats per minute" neutral /> : unavailable('strain', 'WHOOP strain')}
      </Panel>
      <Panel title="Recovery" note="last 7 days · %">
        {ready(summary?.recovery) ? <Trend rows={recoveryWeek} max={100} unit="percent recovered" /> : unavailable('recovery', 'WHOOP recovery')}
      </Panel>
      <Panel title="Sleep" note="last 7 days · hours asleep">
        {ready(summary?.sleep) ? <Trend rows={sleepWeek} max={9} unit="hours asleep" format={v => hoursMinutes(v)} /> : unavailable('sleep', 'WHOOP sleep')}
      </Panel>
      <Panel title="Day strain" note="last 7 days · 0–21">
        {ready(summary?.strain) ? <Trend rows={strainWeek} max={21} unit="day strain" format={v => v.toFixed(1)} neutral /> : unavailable('strain', 'WHOOP strain')}
      </Panel>
    </SectionPage>;
  }

  function FamilyPage() {
    return <SectionPage ctx={ctx}
      eyebrow="THE PEOPLE IN YOUR CORNER" title="Family"
      blurb="What Athena remembers about the people close to you, and how today’s chores are going."
      ask="Help me think about my family — what should I be paying attention to?"
      stats={<>
        <Stat label="People remembered" value={family.length} note="from your memories" />
        <Stat label="Chores today" value={chores.length ? `${choresDone}/${chores.length}` : '—'} note={chores.length ? `${chores.length - choresDone} still open` : 'Nothing for today'} tone={chores.length && choresDone === chores.length ? 'good' : undefined} />
        <Stat label="Household" value={<span className="stat-small">{summary?.familyChores.data?.name || '—'}</span>} note="Family Chores account" />
        <Stat label="Under the weather" value={sickFamily.length || '—'} note={sickFamily.length ? 'reported to Athena' : 'Nobody right now'} tone={sickFamily.length ? 'ok' : 'idle'} />
      </>}
    >
      <Panel title="Family health watch" note="Athena stays aware of this in chat" wide>
        {familyHealthPanel()}
      </Panel>
      <Panel title="Chores today" note={summary?.familyChores.data?.name} wide>
        {!ready(summary?.familyChores) ? unavailable('familyChores', 'Family Chores')
          : !chores.length ? <p className="dashboard-empty">No chores returned for today.</p>
            : <>
              <div className="progress-track" role="img" aria-label={`${choresDone} of ${chores.length} chores complete`}><span style={{ width: `${(choresDone / chores.length) * 100}%` }} /></div>
              <ul className="dashboard-data-list chore-list">{chores.map((c, i) => <li key={i} className={c.completed ? 'chore-done' : ''}><strong>{c.completed ? '✓' : '○'} {c.title}</strong><small>{c.completed ? 'Completed' : c.status || 'Open'}{c.dueDate ? ` · due ${dateLabel(c.dueDate)}` : ''}</small></li>)}</ul>
            </>}
      </Panel>
      <Panel title="People &amp; pets" note="from your memories" wide>
        {data.facts.error ? <EmptyCta text="Memories couldn’t load." action="Retry" onClick={retryData} />
          : data.facts.loading ? <p className="dashboard-empty">Loading memories…</p>
            : family.length ? <><FamilyPeopleList facts={family} children={familyPeople?.children || []} links={familyPeople?.links || []} onChange={next => data.setFamilyPeople({ data: next, loading: false, error: null })} onConnect={() => onPanel('integrations')} onFactsChanged={gone => { data.dropFact(gone); retryData(); }} /><button className="dashboard-chat-cta" onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button></>
              : <><p className="dashboard-empty">No family memories saved yet. Tell Athena about them and she will keep them.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Let me tell you about my family.')}>Tell her <span>↗</span></button></>}
      </Panel>
    </SectionPage>;
  }

  function CommunityPage() {
    const serious = nearbyCalls.filter(c => c.serious).length;
    const updated = agoLabel(data.nearby.data?.updatedAt);
    const places = community?.places || [];
    const upcoming = (community?.events || []).filter(e => !isPastEvent(e));
    const localNews = community?.localNews;
    const patch = data.patchCommunity;
    // One list read feeds the three panels below; while it is missing they all
    // say the same thing, and the retry is the same button.
    const waiting = data.community.error ? <EmptyCta text="Your community list couldn’t load." action="Retry" onClick={retryData} />
      : !community ? <p className="dashboard-empty">Loading…</p> : null;
    return <SectionPage ctx={ctx}
      eyebrow="THE PLACE AROUND YOU" title="Community"
      blurb="The places, people and goings-on that make up where you live. Everything on this page is in my mind whenever we talk."
      ask="What’s going on around my community that I should know about?"
      stats={<>
        <Stat label="Points of interest" value={community ? places.filter(p => p.enabled).length : '—'} note="watched day and night" />
        <Stat label="Neighbors" value={community ? community.neighbors.length : '—'} note="people you know nearby" />
        <Stat label="Coming up" value={community ? upcoming.length : '—'} note={upcoming[0] ? `${upcoming[0].title} · ${eventWhen(upcoming[0])}` : community?.events.length ? 'Nothing on the calendar yet' : 'No local events saved'} />
        <Stat label="Calls nearby" value={data.nearby.data ? nearbyCalls.length : '—'} note={serious ? `${serious} serious` : 'near your places'} tone={serious ? 'low' : nearbyCalls.length ? 'ok' : 'idle'} />
      </>}
    >
      <Panel id="community-places" title="Points of interest" note="watched day and night" wide>
        <p className="community-blurb">I keep watch around every place on this list, all the time. A 911 call or a severe-weather warning inside a ring reaches you straight away — here, on your phone, and by text — and I pick out news about these places from the pages I read for you. Home, your church, the kids’ school, the town square: the more you add, the more of your community I can look after.</p>
        {waiting || <><CommunityMap places={places} neighbors={community!.neighbors} onNeighbors={next => patch({ neighbors: next })} /><PointsOfInterest places={places} onPlaces={next => patch({ places: next })} /></>}
      </Panel>
      <Panel title="On your calendar" note={communityCal.length ? 'events that mention your community' : undefined} wide>
        {waiting || (!ready(summary?.calendar) ? unavailable('calendar', 'Google Calendar')
          : communityCal.length ? <ul className="dashboard-data-list calendar-events">{communityCal.map((c, i) => <li key={`${c.event.id}-${i}`}><span className="event-dot" /><div><strong>{c.what}</strong><small>{c.when}{c.who ? ` · ${c.who}` : ''}{c.event.location ? ` · ${c.event.location}` : ''}</small></div></li>)}</ul>
            : <p className="dashboard-empty">{places.some(p => p.enabled) ? 'Nothing on your calendar in the next 7 days mentions your community.' : 'Add a point of interest and I’ll look for it on your calendar.'}</p>)}
      </Panel>
      <Panel title="Near your places" note={updated ? `updated ${updated}` : undefined} wide>
        {data.nearby.loading ? <p className="dashboard-empty">Checking nearby…</p>
          : data.nearby.error ? <EmptyCta text="Nearby activity couldn’t load." action="Retry" onClick={retryData} />
            : <>
              {nearbyWeather.length > 0 && <ul className="dashboard-data-list">{nearbyWeather.map(weatherLine)}</ul>}
              {nearbyCalls.length ? <ul className="dashboard-data-list">{nearbyCalls.map(incidentLine)}</ul> : <p className="dashboard-empty">Quiet near your places.</p>}
            </>}
      </Panel>
      <Panel id="community-door-to-door" title="Check on your street" note="door to door, in an emergency" wide>
        {waiting || <DoorToDoor places={places} />}
      </Panel>
      <Panel title="Place reminders" note="when you get there" wide>
        <PlaceReminders onAsk={onAsk} />
      </Panel>
      <Panel title="Local events" note="church, school, town">
        {waiting || <LocalEvents events={community!.events} places={places} onEvents={next => patch({ events: next })} />}
      </Panel>
      <Panel title="Neighbors" note="who lives around you">
        {waiting || <Neighbors neighbors={community!.neighbors} places={places} onNeighbors={next => patch({ neighbors: next })} onConnectContacts={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Local news" note="from the pages I read for you" wide>
        {waiting || (localNews === null ? <EmptyCta text="News couldn’t load." action="Retry" onClick={retryData} />
          : localNews?.length ? <ul className="dashboard-data-list">{localNews.map((n, i) => <li key={`${n.url}-${i}`}><ExternalLink url={n.url}><strong>{n.title}</strong><small>{n.source} · mentions {n.matched} · {dateLabel(n.firstSeen)}</small></ExternalLink></li>)}</ul>
            : <EmptyCta text={newsSources.length ? 'Nothing this week mentions your towns or places. A local paper or your town’s page widens what I can catch.' : 'Give me a local paper or your town’s news page and I’ll pick out anything about your places.'} action="Add a local news page" onClick={() => setSourcesOpen(true)} />)}
      </Panel>
      <Panel title="Emergency alerts on this phone" note="911 calls · weather" wide>
        <EmergencyAlertSetup />
      </Panel>
      <Panel title="Places you’ve mentioned" note="from your memories" wide>
        {data.facts.error ? <EmptyCta text="Memories couldn’t load." action="Retry" onClick={retryData} />
          : data.facts.loading ? <p className="dashboard-empty">Loading memories…</p>
            : communityPlaces.length ? <Facts facts={communityPlaces} />
              : <><p className="dashboard-empty">Nothing yet — places you mention in conversation show up here.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Let me tell you about the places in my community.')}>Tell her <span>↗</span></button></>}
      </Panel>
    </SectionPage>;
  }

  function WorkPage() {
    const mentions = summary?.slack.data?.messages || [];
    const byStatus = [...new Set(issues.map(i => i.status))];
    return <SectionPage ctx={ctx}
      eyebrow="WHAT WORK IS ASKING FOR" title="Work"
      blurb="Assigned Jira issues and the Slack threads that named you."
      ask="Help me review my Jira issues and Slack mentions."
      stats={<>
        <Stat label="Open issues" value={ready(summary?.jira) ? issues.length : '—'} note="assigned to you" />
        <Stat label="Mentions" value={ready(summary?.slack) ? mentions.length : '—'} note={summary?.slack.data?.workspace || 'Slack not connected'} />
        <Stat label="Projects" value={ready(summary?.jira) ? new Set(issues.map(i => i.project)).size : '—'} note="in this snapshot" />
      </>}
    >
      <Panel title="Jira" note={summary?.jira.data?.partial ? 'Some sites could not be included' : 'assigned open issues'} wide>
        {!ready(summary?.jira) ? unavailable('jira', 'Jira')
          : !issues.length ? <p className="dashboard-empty">No assigned open issues returned.</p>
            : byStatus.map(status => <div className="day-group" key={status}>
              <h3>{status} <span className="card-count">{issues.filter(i => i.status === status).length}</span></h3>
              <Issues issues={issues.filter(i => i.status === status)} />
            </div>)}
      </Panel>
      <Panel title="Slack" note={summary?.slack.data?.workspace}>
        {!ready(summary?.slack) ? unavailable('slack', 'Slack')
          : !mentions.length ? <p className="dashboard-empty">No mentions returned in the last 7 days.</p>
            : <ul className="dashboard-data-list">{mentions.map(m => <li key={m.timestamp}><ExternalLink url={m.url}><strong>#{m.channel}</strong><small>{m.text}</small></ExternalLink></li>)}</ul>}
      </Panel>
      <Panel title="Saved work context" note="what Athena remembers" wide>
        {facts.filter(f => f.category === 'work').length ? <Facts facts={facts.filter(f => f.category === 'work')} /> : <><p className="dashboard-empty">Nothing saved about your work yet.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Let me tell you about my work.')}>Tell her <span>↗</span></button></>}
      </Panel>
    </SectionPage>;
  }

  function MailPage() {
    const grouped = new Map<string, TriageEmail[]>();
    const ungrouped: TriageEmail[] = [];
    for (const email of mailItems) {
      if (email.category === 'receipt' && email.group_key) {
        const list = grouped.get(email.group_key) || [];
        list.push(email);
        grouped.set(email.group_key, list);
      } else {
        ungrouped.push(email);
      }
    }
    const groupEntries = [...grouped.entries()];
    const bundles = summary?.emailTriage.data?.bundles;
    return <>
    <SectionPage ctx={ctx}
      eyebrow="SORTING YOUR INBOX" title="Mail"
      blurb="What Athena proposes for your inbox, and everything she has sorted. Nothing in Gmail changes until you approve it."
      ask="Help me get through my mail triage list."
      stats={<>
        <Stat label="Open" value={summary?.emailTriage.data?.newCount ?? '—'} note={summary?.emailTriage.data?.pendingCount ? `${summary.emailTriage.data.pendingCount} still sorting` : 'sorted and waiting'} />
        <Stat label="To archive" value={bundles?.archive.count ?? '—'} note="promos and updates" />
        <Stat label="Receipts" value={bundles?.receipts.count ?? '—'} note="ready to file and log" />
        <Stat label="Needs you" value={bundles?.replies.count ?? '—'} note="someone is asking" tone={bundles?.replies.count ? 'ok' : undefined} />
      </>}
    >
      {bundles && ready(summary?.emailTriage) && <Panel title="Athena proposes" note="one approval per bundle" wide>
        <MailBundles bundles={bundles} onOpenEmail={setSelectedEmail} onChanged={mailChanged} />
      </Panel>}
      <Panel title="Your inbox" note={mailLoading ? 'Loading…' : `${mailItems.length} to review`} wide>
        {!ready(summary?.emailTriage) ? unavailable('emailTriage', 'Gmail') : <>
          <button className="dashboard-chat-cta" onClick={() => void scanMoreMail()} disabled={mailScanning}>{mailScanning ? 'Scanning…' : 'Scan more'} <span>↗</span></button>
          {mailScanNote && <p className="source-note">{mailScanNote}</p>}
          {mailError && <p className="dashboard-notice" role="status">{mailError}</p>}
          {!mailLoading && !mailItems.length && <p className="dashboard-empty">Nothing new to sort. Scan more pulls the next batch from your inbox.</p>}
          {groupEntries.map(([key, group]) => <div className="day-group" key={key}>
            <h3>{group[0].from_name || group[0].from_address || 'Similar emails'} <span className="card-count">{group.length}</span></h3>
            <ul className="dashboard-data-list">{group.map(emailPreviewLine)}</ul>
          </div>)}
          {ungrouped.length > 0 && <div className="day-group">
            {groupEntries.length > 0 && <h3>Other emails <span className="card-count">{ungrouped.length}</span></h3>}
            <ul className="dashboard-data-list">{ungrouped.map(emailPreviewLine)}</ul>
          </div>}
        </>}
      </Panel>
    </SectionPage>
    {selectedEmail && <EmailPanel uuid={selectedEmail} onClose={() => setSelectedEmail(null)} onChanged={mailChanged} />}
    </>;
  }

  function ProjectsPage() {
    const names = [...new Set(issues.map(i => i.project))];
    return <SectionPage ctx={ctx}
      eyebrow="WHAT YOU ARE BUILDING" title="Projects"
      blurb="Your websites and Jira projects alongside the goals Athena is holding on to for you."
      ask="What do you remember about my projects? Help me choose a next step."
      stats={<>
        <Stat label="Projects" value={ready(summary?.jira) ? names.length : '—'} note="with issues assigned to you" />
        <Stat label="Open issues" value={ready(summary?.jira) ? issues.length : '—'} note="across all projects" />
        <Stat label="Saved goals" value={projects.length} note="held in memory" />
      </>}
    >
      <Panel title="Websites" note="Search Console and Analytics, last 7 days" wide id="websites">
        <Websites onConnect={() => onPanel('integrations')} />
      </Panel>
      <Panel title="Jira projects" note="your assigned issues" wide>
        {!ready(summary?.jira) ? unavailable('jira', 'Jira')
          : !names.length ? <p className="dashboard-empty">No assigned open issues returned.</p>
            : names.map(project => <div className="day-group" key={project}>
              <h3>{project} <span className="card-count">{issues.filter(i => i.project === project).length}</span></h3>
              <Issues issues={issues.filter(i => i.project === project)} />
            </div>)}
      </Panel>
      <Panel title="Goals" note="saved in memory" wide>
        {data.facts.error ? <EmptyCta text="Memories unavailable." action="Retry" onClick={retryData} />
          : projects.length ? <><Facts facts={projects} /><button className="dashboard-chat-cta" onClick={() => onAsk('Help me pick the next step on one of my goals.')}>Pick a next step <span>↗</span></button></>
            : <><p className="dashboard-empty">No saved goals yet. Tell Athena what you are working towards.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Here is what I am working towards right now.')}>Tell her <span>↗</span></button></>}
      </Panel>
    </SectionPage>;
  }

  function NewsPage() {
    const broken = newsSources.filter(s => s.lastError);
    const watching = newsSources.filter(s => s.enabled);
    const publishers = [...new Set(news.map(n => n.source))];
    // The fastest rhythm on the list, which is the honest answer to "how close
    // to live is this page?" — and the one she raises herself when it matters.
    const fastest = watching.reduce<typeof watching[number] | null>((best, s) => (!best || s.everyMinutes < best.everyMinutes ? s : best), null);
    return <SectionPage ctx={ctx}
      eyebrow="YOUR DAILY READING" title="News & Updates"
      blurb="Everything I’ve read on your pages, newest first. You choose the pages; I choose how often to go back."
      ask="Help me catch up on news relevant to my interests."
      stats={<>
        <Stat label="Headlines" value={news.length} note="read in the last 7 days" />
        <Stat label="Pages" value={watching.length || '—'} note={broken.length ? `${broken.length} not responding` : watching.length ? 'all responding' : 'none yet'} tone={broken.length ? 'low' : watching.length ? 'good' : 'idle'} />
        <Stat label="Checking" value={<span className="stat-small">{fastest ? fastest.rhythm : '—'}</span>} note={fastest ? `fastest: ${fastest.label}` : 'Nothing on the list'} tone={fastest && fastest.everyMinutes <= 60 ? 'ok' : 'idle'} />
      </>}
    >
      <Panel title="What I’m watching" note={`${newsSources.length} page${newsSources.length === 1 ? '' : 's'}`}>
        {data.news.loading ? <p className="dashboard-empty">Loading your list…</p>
          : data.news.error ? <EmptyCta text="News couldn’t load." action="Retry" onClick={retryData} />
            : <>
              <ul className="dashboard-data-list">{newsSources.map(s => <li key={s.uuid}>
                <strong>{s.label}{s.enabled ? '' : ' (paused)'}</strong>
                <small>{s.lastError ? `Couldn’t read it last time — ${s.lastError}` : `${s.rhythm}${s.setBy === 'athena' ? ' · my call' : ''} · ${s.headlines} headline${s.headlines === 1 ? '' : 's'} this week`}</small>
                {s.setBy === 'athena' && s.reason && !s.lastError && <small>“{s.reason}”</small>}
              </li>)}</ul>
              {!newsSources.length && <p className="dashboard-empty">Paste a news page and I’ll start reading it for you.</p>}
              <button className="dashboard-chat-cta" onClick={() => setSourcesOpen(true)}>Manage pages <span>↗</span></button>
            </>}
      </Panel>
      <Panel title="Headlines" note={news.length ? `${news.length} items` : undefined} wide>
        {!news.length ? newsBody(0) : publishers.map(source => <div className="day-group" key={source}>
          <h3>{source} <span className="card-count">{news.filter(n => n.source === source).length}</span></h3>
          <ul className="dashboard-data-list">{news.filter(n => n.source === source).slice(0, 25).map((n, i) => <li key={`${n.url}-${i}`}><ExternalLink url={n.url}><strong>{n.title}</strong><small>{dateLabel(n.firstSeen)}</small></ExternalLink></li>)}</ul>
        </div>)}
      </Panel>
    </SectionPage>;
  }

  // The briefing is what Home and the drawer show; every other nav entry has
  // a page of its own.
  if (!compact && section !== 'Home') {
    if (section === 'Today') return TodayPage();
    if (section === 'Calendar') return CalendarPage();
    if (section === 'Health') return HealthPage();
    if (section === 'Family') return FamilyPage();
    if (section === 'Community') return CommunityPage();
    if (section === 'Mail') return MailPage();
    if (section === 'Work') return WorkPage();
    if (section === 'Projects') return ProjectsPage();
    if (section === 'News') return NewsPage();
    if (section === 'Dreams') return <DreamsPage ctx={ctx} />;
    if (section === 'System') return <SystemPage ctx={ctx} />;
  }

  return <main className={`dashboard-content ${compact ? 'dashboard-compact' : ''}`}>
    <div className="dashboard-toolbar"><span className="dashboard-eyebrow">YOUR DAILY BRIEFING</span><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
    <section className="dashboard-greeting"><div><h1>{greeting}, {firstName}</h1><p>Here’s what’s on your radar today.</p></div></section>
    {data.summary.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {data.summary.error}</p>}
    {/* The emergency near home first, then the one thing on this page that
        answers a question rather than reporting a source — both above the
        cards because they are what people actually arrive with. The console
        leaves the banner out of its own header on this page so it shows once;
        the compact drawer skips it, the console's banner is already above it. */}
    {!compact && <EmergencyBanner onAsk={onAsk} onPlaces={onPlaces} inline />}
    <WorkBanner events={events} workingLocations={summary?.calendar.data?.workingLocations} timeZone={timeZone} now={now} jira={summary?.jira.status === 'ready' ? summary.jira.data : null} onOpen={go('Calendar')} onOpenWork={go('Work')} />
    <RightNowCard
      data={data.rightNow.data} loading={data.rightNow.loading} error={data.rightNow.error}
      onAsk={onAsk} onManage={() => setPlansOpen(true)}
    />
    <div className="dashboard-grid">{ranked.slice(0, PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    <div className="dashboard-secondary">{ranked.slice(PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    {/* Below the cards, not among them: the card order is fixed (Health
        first) and this isn't a source — it's her night, told as a dream. */}
    {!compact && <DreamCard onOpen={go('Dreams')} onAsk={onAsk} />}
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>Whatever’s on your mind,<br />you don’t have to carry it alone.</h2><button className="dashboard-chat-cta" onClick={() => onAsk('')}>Let’s talk <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button><button onClick={() => onPanel('photo')}>Share a moment <span>↗</span></button><button onClick={() => onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => setSourcesOpen(true)}>News sources <span>↗</span></button><button onClick={() => setPlansOpen(true)}>Places &amp; projects <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {compact && <button className="dashboard-chat-cta" onClick={onExpand}>Open full dashboard ↗</button>}
    {sourcesOpen && <NewsSourcesPanel onClose={() => setSourcesOpen(false)} onSaved={() => void data.refresh()} />}
    {plansOpen && <PlansPanel onClose={() => setPlansOpen(false)} onSaved={() => void data.refresh()} />}
    {selectedEmail && <EmailPanel uuid={selectedEmail} onClose={() => setSelectedEmail(null)} onChanged={() => { setMailRefresh(n => n + 1); void data.refresh(); }} />}
  </main>;
}
