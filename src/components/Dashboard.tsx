import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEvent, Source, JiraIssue, RecoveryDay, WeighIn, DashboardSummary, GcpBilling, TimeSaved, TriageEmail, NearbyIncident, WeatherAlert, WorkplacesOverview } from '../api/dashboard';
import { dashboardApi } from '../api/dashboard';
import { localDay } from '../api/healthPlan';
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
import { familyHealthSummary } from './familyHealthSummary';
import { DoorToDoor } from './DoorToDoor';
import { communityEvents } from './communityCalendar.ts';
import { WorkBanner } from './WorkBanner';
import { untilLabel, workStatus } from './workStatus';
import { EmailPanel, CATEGORY_LABEL } from './EmailPanel';
import { MailBundles } from './MailBundles';
import { DreamCard, DreamsPage, DreamImage, STATUS_LINE, nightLabel } from './Dreams';
import { DashboardIcon } from './icons';
import { PointsOfInterest, Neighbors, LocalEvents, PlaceReminders, ContactAvatar, eventWhen, isPastEvent } from './Community';
import { EmergencyAlertSetup } from './EmergencyAlertSetup';
import { Websites } from './Websites';
import { Workplaces } from './Workplaces';
import { WorkoutsPanel } from './Workouts';
import { HealthOverview } from './HealthPage';
import { PageHeader } from './PageHeader';
import { CalendarOverview } from './CalendarPage';
import { FamilyOverview } from './FamilyPage';
import { CommunityOverview } from './CommunityPage';
import { WorkOverview } from './WorkPage';
import { NavigationLink, DrawerButton } from './ActionControls';
import { plannedToday } from './ProjectData';
import { useProjects, openProjects, ProjectList, ProjectBoard, ProjectsDrawers, ConcernList, CharterView, StateChip, type ProjectsDrawer } from './Projects';
import type { Area } from '../api/projects';
import { useProperty, PropertyOverview, PropertyWeather, PropertyNavigation, propertyHealth, PROPERTY_TAB_IDS, type PropertyTab } from './Property';
import { usePropertyIssues, reportedWhen, ReportIssueDrawer, IssueDetailsDrawer, ActiveIssueBanner, IssueList, troubleshootPrompt, findProPrompt } from './PropertyIssues';
import type { PropertyIssue } from '../api/propertyIssues';
import { useVehicles, VehicleList, VehicleDrawer, VehicleDetailsDrawer, vehiclePrompt } from './PropertyVehicles';
import { useThermostats, ThermostatList } from './PropertyThermostats';
import { SystemOverview, SystemTabs, SYSTEM_TAB_IDS, type SystemTab, type SystemTile } from './SystemPage';
import { HomeHero, HomeChanges, HomeSection, HomeStat, HomeTabs, Spark, useHomeExtras, type HeroNode, type Tone } from './DashboardHome';
import { freshness, homeUpdates, recoveryChange } from './livingHome';
import { AREA_LABEL, STATE_LABEL } from '../api/projects';

/** Enough for a household, so nobody sorted late in the alphabet is cut off the card. */
const FAMILY_CARD_ROWS = 7;

/** Open a console panel; `consentFor` opens Connected apps on that provider's consent prompt. */
export type OpenPanel = (panel: 'integrations' | 'memory' | 'actions' | 'notifications' | 'knows' | 'photo' | 'devices', options?: { consentFor?: string }) => void;
export type DashboardSection = 'Dashboard' | 'Property' | 'Today' | 'Calendar' | 'Health' | 'Family' | 'Community' | 'Mail' | 'Work' | 'Projects' | 'News' | 'Dreams' | 'System' | 'Finance' | 'Workouts';
// Icons live in ./icons — one registry, so a drawn icon looks the same in
// the nav, on its card and in the phone's bottom bar.
export { DashboardIcon } from './icons';
// Left-hand navigation. "Dashboard" is the briefing (it was keyed 'Home' until
// 2026-10-13, when Home became the house section); it also replaces the old
// Quick Actions entry, which now lives on as the bell in the
// top bar (the Notifications card was removed by the owner, 2026-09-27).
// Today remains an internal page for now but is not a left-navigation entry.
// Calendar, Mail, Projects, News and Dreams moved under System as its tabs
// (owner, 2026-10-16), beside Finance; their pages are unchanged.
export const dashboardSections: DashboardSection[] = ['Dashboard', 'Health', 'Family', 'Community', 'Property', 'Work', 'System'];
/** The nav entry a page lights up: a System tab lights System, a workout lights Health. */
export const navSectionOf = (section: DashboardSection): DashboardSection =>
  section === 'Workouts' ? 'Health' : SYSTEM_TAB_IDS.includes(section) ? 'System' : section;
// The card set, in the one order the dashboard uses. Fixed by the owner
// (2026-09-26): Health & Performance first, and Athena no longer re-sorts it.
// The first row is the owner's hierarchy (2026-09-27): take care of yourself,
// so you can take care of your family, so your family can take care of the
// community. Home (the house) follows them (2026-10-13; placement is the
// owner's call). Ids are shared with services/dashboardPriority.js in core_api —
// changing one means changing both.
const DEFAULT_CARD_ORDER = ['health', 'family', 'community', 'home', 'calendar', 'mail', 'work', 'news', 'projects'];
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
interface SourceFix { reconnect?: () => void; panel: () => void; retry: () => void; busy?: boolean }
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
export function Stat({ label, value, note, tone, icon }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'ok' | 'low' | 'alert' | 'idle'; icon?: string }) {
  const reading = <><span>{label}</span><strong className={icon && typeof value === 'string' && value.length > 8 ? 'stat-small' : undefined}>{value}</strong></>;
  return <div className={`stat-tile${tone ? ` stat-${tone}` : ''}${icon ? ' stat-with-icon' : ''}`} data-icon={icon}>{icon ? <div className="stat-main"><div className="stat-icon"><DashboardIcon name={icon} bare /></div><div className="stat-reading">{reading}</div></div> : reading}{note && <small>{note}</small>}</div>;
}
export function Panel({ title, note, children, wide, id, scroll }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean; id?: string; scroll?: boolean }) {
  return <section id={id} className={`section-panel${wide ? ' section-panel-wide' : ''}`}><header><h2>{title}</h2>{note && <span>{note}</span>}</header>{scroll ? <div className="section-panel-body">{children}</div> : children}</section>;
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
function Trend({ rows, max, min = 0, goal, unit, format, neutral, label, span = 'days' }: { rows: { date: string; value: number | null }[]; max: number; min?: number; goal?: number; unit: string; format?: (value: number) => string; neutral?: boolean; label?: (date: string) => string; span?: string }) {
  if (!rows.some(row => row.value !== null)) return <p className="dashboard-empty">No scored days in this window.</p>;
  const place = (value: number) => Math.max(4, Math.min(100, ((value - min) / (max - min)) * 100));
  return <ul className="trend-bars" aria-label={`Last ${rows.length} ${span}, ${unit}`}>{rows.map(row => {
    const pct = row.value === null ? 0 : place(row.value);
    const share = row.value === null ? 0 : (row.value - min) / (max - min);
    const tone = row.value === null ? 'idle' : neutral ? 'plain' : share >= .66 ? 'good' : share >= .34 ? 'ok' : 'low';
    return <li key={row.date}>
      <b>{row.value === null ? '—' : format ? format(row.value) : Math.round(row.value)}</b>
      <span className="trend-track">{goal !== undefined && <span className="trend-goal" style={{ bottom: `${place(goal)}%` }} title={`Goal ${goal}`} />}<span className={`trend-bar trend-${tone}`} style={{ height: `${pct}%` }} /></span>
      <small>{label ? label(row.date) : new Date(`${row.date}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'narrow' })}</small>
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
export function SectionPage({ eyebrow, title, blurb, stats, children, ask, ctx, headerAside, hero, tabs, backdrop }: {
  eyebrow: string; title: string; blurb: string; stats?: ReactNode; children: ReactNode; ask: string; ctx: SectionContext; headerAside?: ReactNode;
  /** A banner the head dissolves out of (PageHeader's backdrop) — Property's house. */
  backdrop?: string;
  /** The tab strip of the section this page belongs to (System's), above everything else on it. */
  tabs?: ReactNode;
  /** A page that draws its own head (Health) passes it here — built on PageHeader too — and it replaces the title, blurb and stat row. */
  hero?: ReactNode;
}) {
  return <main className="dashboard-content dashboard-section">
    <div id={headerAside ? 'property-overview' : undefined}>
    <div className="dashboard-toolbar"><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => ctx.onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
    {tabs && <div className="section-page-tabs">{tabs}</div>}
    {hero ?? <PageHeader eyebrow={eyebrow} title={title} blurb={blurb} aside={headerAside} backdrop={backdrop} />}
    {ctx.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {ctx.error}</p>}
    {!hero && stats && <div className="stat-row">{stats}</div>}
    </div>
    <div className="section-panels">{children}</div>
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>She has read all of this.<br />Ask her what she makes of it.</h2><button className="dashboard-chat-cta" onClick={() => ctx.onAsk(ask)}>Talk it through <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={ctx.onHome}>Back to your briefing <span>↗</span></button><button onClick={() => ctx.onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => ctx.onPanel('memory')}>Explore memories <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {ctx.sourcesOpen && <NewsSourcesPanel onClose={() => ctx.setSourcesOpen(false)} onSaved={ctx.refresh} />}
  </main>;
}

/** One provider read for the System page. Each loads on its own, so one failing never blanks the others. */
export function useSystemRead<T>(load: () => Promise<T>) {
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

/**
 * The System page's Finance tab: what Athena has saved and what she costs.
 * This was the whole System page until 2026-10-16; her health moved to the
 * System Overview, which reads the same check.
 */
function FinancePage({ ctx, tabs }: { ctx: SectionContext; tabs: ReactNode }) {
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
  const lifetime = combined([
    { name: 'Twilio', currency: billing?.balance?.currency, value: billing?.configured ? billing.costAllTime : null },
    { name: 'OpenAI', currency: ai?.currency, value: ai?.costAllTime },
    { name: 'Google Cloud', currency: cloud?.currency, value: cloud?.costAllTime },
  ]);
  const llmCost = combined([
    { name: 'OpenAI', currency: ai?.currency, value: ai?.costThisMonth },
    { name: 'Gemini', currency: cloud?.currency, value: cloud?.llmThisMonth },
  ]);
  return <SectionPage ctx={ctx} tabs={tabs}
    eyebrow="ATHENA SYSTEM" title="Finance" blurb="The time Athena has saved you, and what the services she runs on are costing."
    ask="How much is Athena costing me, and is it worth it for the time she saves?"
    stats={<>
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
const lbOf = (kg: number) => kg * 2.20462;
/** The last weigh-in of each local day, newest first. */
function weighInDays(weighIns?: WeighIn[] | null) {
  const byDay = new Map<string, WeighIn>();
  for (const w of [...(weighIns || [])].sort((a, b) => b.at.localeCompare(a.at))) {
    const day = new Date(w.at).toLocaleDateString('en-CA');
    if (!byDay.has(day)) byDay.set(day, w);
  }
  return [...byDay.values()];
}
/**
 * Eight weeks, oldest first, each the average of that week's weigh-ins (null
 * for a week with none). `date` is the week's Monday, YYYY-MM-DD.
 */
function weeklyAverage(days: WeighIn[], pick: (w: WeighIn) => number | null) {
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 8 }, (_, i) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - (7 - i) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const values = days
      .filter(w => { const t = Date.parse(w.at); return t >= start.getTime() && t < end.getTime(); })
      .flatMap(w => { const v = pick(w); return v === null ? [] : [v]; });
    return { date: start.toLocaleDateString('en-CA'), value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  });
}
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
function HeartMetric({ label, value, display, unit, goal, better, trend, decimals = 0, note, spark }: {
  label: string; value?: number | null; display?: ReactNode; unit: string;
  goal?: number; better: Better; trend?: Trending | null; decimals?: number; note?: string | null;
  /** The briefing draws the recent run of the number under it. */
  spark?: ReactNode;
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
    {spark}
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

export function Dashboard({ section = 'Dashboard', firstName, onAsk, onPanel, onPlaces, onNavigate, compact = false, onExpand }: {
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
  const [addingWorkplace, setAddingWorkplace] = useState(false);
  // What the Workplaces panel last loaded, so the Work overview above it stays in step.
  const [workOverview, setWorkOverview] = useState<WorkplacesOverview | null>(null);
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
  const [healthError, setHealthError] = useState('');
  const [healthResolving, setHealthResolving] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  // Projects: one load shared by the cards, the pages and the editors.
  const proj = useProjects();
  const property = useProperty();
  const propertyIssues = usePropertyIssues();
  const vehicles = useVehicles();
  // Add, view or edit a vehicle at the property; the uuid names which.
  const [vehicleDrawer, setVehicleDrawer] = useState<{ kind: 'add' } | { kind: 'view' | 'edit'; uuid: string } | null>(null);
  // Report, view or edit a property issue; the uuid names which.
  const [issueDrawer, setIssueDrawer] = useState<{ kind: 'report' } | { kind: 'view' | 'edit'; uuid: string } | null>(null);
  const [propertyTab, setPropertyTab] = useState<PropertyTab>(() => {
    const id = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
    return (PROPERTY_TAB_IDS as readonly string[]).includes(id) ? id as PropertyTab : 'property-overview';
  });
  // Only while the Overview is on screen: a page load may cost a Google read.
  const thermostats = useThermostats(section === 'Property' && !compact && propertyTab === 'property-utilities');
  const [drawer, setDrawer] = useState<ProjectsDrawer>(null);
  const openProject = (uuid: string) => setDrawer({ kind: 'project', uuid });
  const newProject = (area?: Area) => setDrawer({ kind: 'project', uuid: null, area: area ?? 'home' });
  const drawers = <ProjectsDrawers state={proj} drawer={drawer} setDrawer={setDrawer} />;
  // A Health project reading the scale draws its plan on the Weight panel (in lb, the panel's unit).
  const weightGoal = (() => {
    const p = openProjects(proj.snap, 'health', { anyArea: true }).find(x => x.bindings?.some(b => b.sourceType === 'health_metric') && x.metric?.target != null);
    const plan = p && plannedToday(p);
    if (!p || !plan) return null;
    return { project: p, value: plan.unit === 'kg' ? Math.round((plan.value / 0.45359237) * 10) / 10 : plan.value };
  })();
  /** A section page's own projects, primary or not — the overlap, made visible. */
  const areaStrip = (area: Area, label: string) => {
    const list = openProjects(proj.snap, area, { anyArea: true });
    if (!list.length) return null;
    return <Panel title="Projects" note={`${list.length} touching ${label}`} wide>
      <ProjectList projects={list.slice(0, 6)} snap={proj.snap} onOpen={openProject} compact />
      {list.length > 6 && <p className="source-note">+{list.length - 6} more on the Projects page</p>}
    </Panel>;
  };
  const now = useNow(30000);
  // The briefing's own reads and filters; nothing is fetched on the section pages.
  const home = useHomeExtras(section === 'Dashboard' && !compact);
  const [workSite, setWorkSite] = useState('');
  const [projectArea, setProjectArea] = useState<Area | 'all'>('all');
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
  // WHOOP lists today's cycle before scoring it; an unscored newest row would
  // blank the tile while yesterday's strain sits right behind it.
  const strain = strainDays.find(s => s.day_strain != null) ?? strainDays[0];
  const readiness = readinessOf(recovery, scoredDays.slice(1), sleep?.sleep_performance_percent ?? null);
  // The scale: one reading per day (the last of the day), newest first. A
  // second step-on is a correction, not a second data point.
  const weighDays = weighInDays(summary?.body?.data?.weighIns);
  const weighIn = weighDays[0];
  const lastMonth = weighDays.filter(w => Date.now() - Date.parse(w.at) < 30 * 86400000);
  // Half a pound either way is water and breakfast, not a direction.
  const weightTrend = trendOf(lastMonth, w => lbOf(w.weight_kg), .5);
  const fatTrend = trendOf(lastMonth, w => w.body_fat_percent, .3);
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const ready = (source?: Source<unknown>) => source?.status === 'ready';
  const go = (target: DashboardSection) => () => onNavigate?.(target);

  // Shared derivations the section pages read from.
  const timeZone = summary?.calendar.data?.timeZone;
  const events = summary?.calendar.data?.events || [];
  // The same test WorkBanner draws itself on.
  const working = !!workStatus(events, summary?.calendar.data?.workingLocations, now, timeZone);
  // What on the calendar mentions where they live: soccer practice, the games, the 5K.
  const today = zonedDay(new Date(now), timeZone);
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
      {weighIn && <div className="health-metrics">{bodyMetrics(false)}</div>}
      </>;
  }
  /**
   * The scale's tiles. Weight and body fat carry no goal and no good/bad
   * colour: which way someone wants them to move is theirs to say, not ours.
   */
  function bodyMetrics(wide: boolean) {
    if (!weighIn) return null;
    const on = dateLabel(weighIn.at, { timeZone });
    // Where a number came from, said on the tile: the scale's own reading,
    // Athena's estimate from impedance, or either corrected to a lab result.
    const origin = (field: string) => weighIn.calibrated?.includes(field) ? ' · cal.' : weighIn.estimated?.includes(field) ? ' · est.' : '';
    const howCome = (field: string) => weighIn.calibrated?.includes(field) ? ' Corrected to your lab reference.'
      : weighIn.estimated?.includes(field) ? " Athena's estimate from the scale's impedance reading, using published equations — not the VeSync app's number." : '';
    const tiles: ReactNode[] = [
      <HeartMetric key="weight" label="Weight" value={lbOf(weighIn.weight_kg)} unit="lb" better="flat" trend={weightTrend} decimals={1}
        note={`${weighIn.weight_kg.toFixed(1)} kg, weighed ${on}${weighIn.manual ? ' (entered by hand)' : ''}.`} />,
      <HeartMetric key="fat" label={`Body fat${origin('body_fat_percent')}`} value={weighIn.body_fat_percent} unit="%" better="flat" trend={fatTrend} decimals={1}
        note={weighIn.body_fat_percent == null ? 'Not measured on the last weigh-in. Body fat needs bare feet on the scale.' : `From your scale, ${on}. Scales estimate this from a small current, so the trend is more trustworthy than any one reading.${howCome('body_fat_percent')}`} />,
    ];
    if (wide) {
      const lbOrNull = (kg: number | null) => (kg === null ? null : lbOf(kg));
      const extra: [string, number | null, string, number, string, string?][] = [
        ['Muscle mass', lbOrNull(weighIn.muscle_mass_kg), 'lb', 1, 'Everything that is muscle, including the heart and gut.'],
        ['Skeletal muscle', lbOrNull(weighIn.skeletal_muscle_kg ?? null), 'lb', 1, `The muscle you move with${weighIn.skeletal_muscle_percent != null ? `, ${weighIn.skeletal_muscle_percent}% of body weight` : ''}.`, 'skeletal_muscle_kg'],
        ['Fat-free mass', lbOrNull(weighIn.fat_free_mass_kg), 'lb', 1, 'Everything that is not fat.', 'fat_free_mass_kg'],
        ['BMI', weighIn.bmi, '', 1, 'Weight against height. It cannot tell muscle from fat.'],
        ['Body water', weighIn.body_water_percent, '%', 1, 'Swings with what you drank and when you weighed.', 'body_water_percent'],
        ['Visceral fat', weighIn.visceral_fat, '', 0, "The scale's index for fat around the organs."],
        ['Subcutaneous fat', weighIn.subcutaneous_fat_percent, '%', 1, 'Fat under the skin.'],
        ['Bone mass', lbOrNull(weighIn.bone_mass_kg), 'lb', 1, 'An estimate; it barely moves.'],
        ['Protein', weighIn.protein_percent, '%', 1, 'Estimated protein share of body weight.'],
        ['BMR', weighIn.bmr_kcal, 'kcal', 0, 'Calories your body burns at rest in a day.', 'bmr_kcal'],
        ['Metabolic age', weighIn.metabolic_age, 'yr', 0, "The scale's comparison of your BMR with typical ages."],
        ['Heart rate', weighIn.heart_rate ?? null, 'bpm', 0, 'Measured through your feet while you stood on the scale.'],
      ];
      for (const [label, value, unit, decimals, note, field] of extra) {
        if (value !== null) tiles.push(<HeartMetric key={label} label={`${label}${field ? origin(field) : ''}`} value={value} unit={unit} better="flat" decimals={decimals} note={`${note} From ${on}.${field ? howCome(field) : ''}`} />);
      }
    }
    return tiles;
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
      {r.signal.kind !== 'calendar' && <button type="button" className="roster-action" disabled={!!resolving} onClick={press}>{resolving ? 'Updating…' : r.signal.action}</button>}
    </li>;
  }
  /** One row per person, most pressing first; the card never goes quiet — thin or stale knowledge is itself the prompt. */
  function familyCardBody() {
    if (data.facts.error && !roster.length) return <EmptyCta text="Memories couldn’t load." action="Retry" onClick={retryData} />;
    if (data.facts.loading && !roster.length) return <p className="dashboard-empty">Loading…</p>;
    if (!roster.length) return <EmptyCta text="Athena doesn’t know your people yet." action="Tell her about your family" onClick={() => onAsk('Let me tell you about my family. Ask me about each person — who they are, birthdays, what is going on in their lives.')} />;
    return <>
      <ul className="dashboard-data-list roster-list">{roster.slice(0, FAMILY_CARD_ROWS).map(rosterRow)}</ul>
      {healthError && <p className="dashboard-notice" role="status">{healthError}</p>}
      {roster.length > FAMILY_CARD_ROWS && <p className="source-note">+{roster.length - FAMILY_CARD_ROWS} more on the Family page</p>}
      <button type="button" className="source-fix" onClick={() => onAsk('I want to add someone to my family. Ask me who they are and what you should know.')}>Add someone <span>↗</span></button>
    </>;
  }
  function communityEventList(list: ReturnType<typeof communityEvents>) {
    return <ul className="dashboard-data-list calendar-events">{list.map((c, i) => <li key={`${c.event.id}-${i}`}><span className="event-dot" /><div><strong>{c.what}</strong><small>{c.when}{c.who ? ` · ${c.who}` : ''}</small></div></li>)}</ul>;
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
  const dashProjects = openProjects(proj.snap, undefined, { includeWork: false });
  const homeOpen = openProjects(proj.snap, 'home');
  const homeConcerns = proj.snap.concerns.filter(c => c.area === 'home' && c.status === 'open').sort((a, b) => b.severity - a.severity);
  const projectsCardBody = () => proj.error && !proj.snap.projects.length ? <EmptyCta text="Projects couldn’t load." action="Retry" onClick={proj.reload} />
    : dashProjects.length ? <ul className="dashboard-data-list">{dashProjects.slice(0, 3).map(p => <li key={p.uuid}><button type="button" className="w-full text-left" onClick={() => openProject(p.uuid)}><strong>{p.title}</strong><small>{[p.effectiveStatus, ...p.rankWhy].join(' · ')}</small></button></li>)}</ul>
      : <EmptyCta text="No projects yet." action="Start one" onClick={() => newProject()} />;
  const homeCardBody = () => proj.error && !proj.snap.projects.length ? <EmptyCta text="Projects couldn’t load." action="Retry" onClick={proj.reload} />
    : <>
      {homeConcerns.length > 0 && <><p className="source-note">Open concerns</p><ul className="dashboard-data-list">{homeConcerns.slice(0, 2).map(c => <li key={c.uuid}><strong>{c.title}</strong><small>{c.frequency || 'open'}</small></li>)}</ul></>}
      <p className="source-note">Up next</p>
      {homeOpen.length ? <ul className="dashboard-data-list">{homeOpen.filter(p => p.kind !== 'program').slice(0, 3).map(p => <li key={p.uuid}><button type="button" className="w-full text-left" onClick={() => openProject(p.uuid)}><strong>{p.title}</strong><small>{[p.effectiveStatus, ...p.rankWhy].join(' · ')}</small></button></li>)}</ul>
        : <EmptyCta text="No house projects yet." action="Add one" onClick={() => newProject('home')} />}
    </>;
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
    projects: proj.loading && !proj.snap.projects.length ? say('Loading…')
      : dashProjects.length ? say(dashProjects[0].title, dashProjects[0].rankWhy[0] || `${dashProjects.length} open`) : say('Nothing open', 'start a project'),
    home: proj.loading && !proj.snap.projects.length ? say('Loading…')
      : homeConcerns.length ? say(homeConcerns[0].title, `${homeConcerns.length} open concern${homeConcerns.length === 1 ? '' : 's'}`)
        : homeOpen.length ? say(homeOpen[0].title, `${homeOpen.length} open`) : say('All quiet', 'no open house projects'),
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
    // Work projects never appear here (owner, 2026-10-13) — they live on Work.
    projects: card('projects', 'Projects', 'Projects', projectsCardBody(), 'View projects', go('Projects'), dashProjects.length || undefined, headlines.projects),
    home: card('home', 'Home', 'Property', homeCardBody(), 'View property', go('Property'), homeOpen.length || undefined, headlines.home),
  };

  // --- The section pages ---------------------------------------------------
  // Invoked as plain functions below, not as <TodayPage />, for the same
  // reason SectionPage lives outside this component: a type created during
  // render remounts its subtree on every render.
  const ctx: SectionContext = {
    onAsk, onPanel, onHome: go('Dashboard'), error: data.summary.error,
    sourcesOpen, setSourcesOpen, refresh: () => void data.refresh(),
  };

  /** System's tab strip, on each page that is one of its tabs. */
  const systemTabs = (active: SystemTab) => <SystemTabs active={active} onChange={tab => onNavigate?.(tab)} />;

  /**
   * System's Overview: a tile per tab, read from the same data each tab
   * shows. A source that can't be read leaves its tile at "—" and says why.
   */
  function SystemPage() {
    const DAY = 86_400_000;
    const calendarDays = summary?.calendar.data?.days ?? 7;
    const calendarBars = Array.from({ length: calendarDays }, (_, i) => {
      const day = zonedDay(new Date(Date.now() + i * DAY), timeZone);
      const count = events.filter(e => eventDay(e, timeZone) === day).length;
      return { key: day, value: count, title: `${dateLabel(`${day}T12:00:00`, { weekday: 'short' })}: ${count} event${count === 1 ? '' : 's'}` };
    });
    const triage = summary?.emailTriage.data;
    const openList = proj.snap.projects.filter(p => !['done', 'dropped'].includes(p.status));
    const projectCount = (states: string[]) => openList.filter(p => states.includes(p.effectiveStatus)).length;
    const newsBars = Array.from({ length: 7 }, (_, i) => {
      const day = localDay(new Date(Date.now() - (6 - i) * DAY));
      const count = news.filter(n => localDay(new Date(n.firstSeen)) === day).length;
      return { key: day, value: count, title: `${dateLabel(`${day}T12:00:00`, { weekday: 'short' })}: ${count} headline${count === 1 ? '' : 's'}` };
    });
    const notReady = (source?: Source<unknown>) => source ? statusText[source.status] : 'Loading…';
    const calendarOk = ready(summary?.calendar);
    const mailOk = ready(summary?.emailTriage) && !!triage;
    const tiles: SystemTile[] = [
      { id: 'Calendar', title: 'Calendar', icon: 'calendar', tone: 'blue', unit: 'events',
        value: calendarOk ? events.length : '—',
        sub: calendarOk ? `Next ${calendarDays} days` : notReady(summary?.calendar),
        bars: calendarOk ? calendarBars : undefined },
      { id: 'Mail', title: 'Mail', icon: 'mail', tone: 'red', unit: 'to review',
        value: mailOk ? triage!.newCount : '—',
        sub: !mailOk ? notReady(summary?.emailTriage) : triage!.pendingCount ? `${triage!.pendingCount} sorting` : 'all sorted',
        bars: mailOk ? [
          { key: 'receipts', value: triage!.receiptCount, title: `Receipts: ${triage!.receiptCount}` },
          { key: 'travel', value: triage!.travelCount, title: `Travel: ${triage!.travelCount}` },
          { key: 'school', value: triage!.schoolCount, title: `School: ${triage!.schoolCount}` },
          { key: 'other', value: triage!.otherCount, title: `Other: ${triage!.otherCount}` },
        ] : undefined },
      { id: 'Projects', title: 'Projects', icon: 'list', tone: 'green', unit: 'open',
        value: proj.loading && !proj.snap.projects.length ? '—' : openList.length,
        sub: proj.error ? 'Couldn’t load projects' : `${projectCount(['active'])} active · ${projectCount(['blocked'])} blocked`,
        segments: [
          { key: 'active', value: projectCount(['active']), tone: 'green', title: `Active: ${projectCount(['active'])}` },
          { key: 'ready', value: projectCount(['ready', 'planning', 'idea']), tone: 'blue', title: `Ready, planning or idea: ${projectCount(['ready', 'planning', 'idea'])}` },
          { key: 'waiting', value: projectCount(['waiting']), tone: 'idle', title: `Waiting: ${projectCount(['waiting'])}` },
          { key: 'blocked', value: projectCount(['blocked']), tone: 'amber', title: `Blocked: ${projectCount(['blocked'])}` },
        ] },
      { id: 'News', title: 'News', icon: 'news', tone: 'violet', unit: 'headlines',
        value: data.news.loading && !news.length ? '—' : news.length,
        sub: data.news.error ? 'News couldn’t load' : 'Read this week', bars: newsBars },
    ];
    // One entry per provider (WHOOP feeds three sources), plus the scale.
    const providers = new Map<string, Source<unknown>[]>();
    for (const [key, provider] of Object.entries(SOURCE_PROVIDER)) {
      const source = summary?.[key as keyof DashboardSummary] as Source<unknown> | undefined;
      if (source && provider) providers.set(provider, [...(providers.get(provider) || []), source]);
    }
    if (summary?.body) providers.set('vesync', [summary.body]);
    const linked = [...providers.entries()].filter(([, list]) => list.some(x => x.status !== 'not_connected'));
    const NAMES: Record<string, string> = { google_calendar: 'Google Calendar', gmail: 'Gmail', whoop: 'WHOOP', jira: 'Jira', slack: 'Slack', family_chores: 'Family Chores', vesync: 'VeSync scale' };
    const attention = linked.filter(([, list]) => list.some(x => x.status !== 'ready' && x.status !== 'not_connected')).map(([p]) => NAMES[p] || p);
    return <main className="dashboard-content dashboard-section">
      <div className="dashboard-toolbar"><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
      {data.summary.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {data.summary.error}</p>}
      <SystemOverview tiles={tiles} integrations={{ connected: linked.length, attention }}
        onTab={tab => onNavigate?.(tab)} onAsk={onAsk} onPanel={onPanel} onNewTask={() => setDrawer({ kind: 'project', uuid: null, area: 'work' })} />
      <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
      {drawers}
    </main>;
  }

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
    // The concept's page (CalendarPage.tsx): the week, the chosen day, the month and the calendars.
    return <SectionPage ctx={ctx} tabs={systemTabs('Calendar')}
      eyebrow="" title="Calendar" blurb=""
      ask="Help me review my calendar for the week ahead."
      hero={<CalendarOverview events={events} timeZone={timeZone} days={summary?.calendar.data?.days ?? 7} now={now}
        unavailable={ready(summary?.calendar) ? null : unavailable('calendar', 'Google Calendar')}
        familyNames={roster.filter(r => r.relation !== 'Pet').map(r => r.name)}
        onAsk={onAsk} onManage={() => onPanel('integrations')} />}
    >
      {null}
    </SectionPage>;
  }

  function HealthPage() {
    const body = summary?.body;
    // VeSync has no Connect button in the app (the owner links it), so a
    // missing link is said, not offered.
    const bodyFix: SourceFix = { panel: () => onPanel('integrations'), retry: retryData };
    const bodyUnavailable = <Unavailable source={body ?? { status: 'not_connected', data: null, detail: null, checkedAt: '' }} name="VeSync scale" fix={bodyFix} />;
    // The concept's page (HealthPage.tsx) is the whole page; the full workout history has its own page.
    return <SectionPage ctx={ctx}
      eyebrow="" title="Health & Performance" blurb=""
      ask="Help me review my WHOOP recovery, heart rate, HRV, sleep, training and nutrition. Am I trending the right way?"
      hero={<HealthOverview recovery={scoredDays} sleep={sleepDays} strain={strainDays} weighIns={weighDays} readiness={readiness}
        whoopNote={whoopNotes()} bodyNote={ready(body) ? null : bodyUnavailable}
        weightPlan={weightGoal ? { value: weightGoal.value, title: weightGoal.project.title } : null} onAsk={onAsk} onWorkouts={go('Workouts')} />}
    >
      {null}
    </SectionPage>;
  }

  function WorkoutsPage() {
    // Every recorded workout, reached from the program card's "View all activities".
    return <SectionPage ctx={ctx}
      eyebrow="HEALTH & PERFORMANCE" title="Workouts" blurb="Every workout WHOOP has recorded, kept by Athena."
      ask="Look at my workouts. How consistent have I been, and what stands out?"
    >
      <button type="button" className="source-fix section-panel-wide" onClick={go('Health')}><span>←</span> Back to Health &amp; Performance</button>
      <WorkoutsPanel onAsk={onAsk} />
    </SectionPage>;
  }

  function FamilyPage() {
    const health = familyHealthSummary(summary?.familyHealth);
    const toDetails = () => document.getElementById('family-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // The concept's page up top (FamilyPage.tsx); the editable list of people stays below it.
    return <SectionPage ctx={ctx}
      eyebrow="" title="Family" blurb=""
      ask="Help me think about my family — what should I be paying attention to?"
      hero={<FamilyOverview roster={roster} children={familyPeople?.children || []} events={events} timeZone={timeZone} now={now}
        chores={chores} household={summary?.familyChores.data?.name} choresUrl={summary?.familyChores.data?.appUrl}
        canCompleteChores={!!summary?.familyChores.data?.canComplete} choresReconnectUrl={summary?.familyChores.data?.reconnectUrl}
        choresNote={ready(summary?.familyChores) ? null : unavailable('familyChores', 'Family Chores')}
        calendarNote={ready(summary?.calendar) ? null : unavailable('calendar', 'Google Calendar')}
        health={!summary && data.summary.loading ? { label: 'Loading…', tone: 'idle', note: 'Reading health reports' } : health}
        sick={sickFamily} onAsk={onAsk} onCalendar={go('Calendar')} onDetails={toDetails} />}
    >
      <h2 className="fp-details-head section-panel-wide">THE DETAIL</h2>
      <Panel id="family-details" title="People &amp; pets" note="from your memories" wide>
        {data.facts.error ? <EmptyCta text="Memories couldn’t load." action="Retry" onClick={retryData} />
          : data.facts.loading ? <p className="dashboard-empty">Loading memories…</p>
            : family.length ? <><FamilyPeopleList facts={family} children={familyPeople?.children || []} links={familyPeople?.links || []} names={new Map(roster.map(r => [r.id, r.name]))} relations={new Map(roster.map(r => [r.id, r.relation]))} watches={sickFamily} watchOf={new Map(roster.flatMap(r => { const w = sickFamily.find(h => h.uuid === r.signal.healthUuid); return w ? [[r.id, w] as const] : []; }))} onHealthChanged={retryData} onFactEdited={retryData} neighbors={community?.neighbors} onNeighbors={next => data.patchCommunity({ neighbors: next })} onChange={next => data.setFamilyPeople({ data: next, loading: false, error: null })} onConnect={() => onPanel('integrations')} onFactsChanged={gone => { data.dropFact(gone); retryData(); }} /><button className="dashboard-chat-cta" onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button></>
              : <><p className="dashboard-empty">No family memories saved yet. Tell Athena about them and she will keep them.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Let me tell you about my family.')}>Tell her <span>↗</span></button></>}
      </Panel>
      {areaStrip('family', 'Family')}
      {drawers}
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
    const toSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // The concept's page up top (CommunityPage.tsx); the editable lists stay below it.
    return <SectionPage ctx={ctx}
      eyebrow="" title="Community" blurb=""
      ask="What’s going on around my community that I should know about?"
      hero={<CommunityOverview community={community ?? null} waiting={waiting} calls={nearbyCalls} weatherAlerts={nearbyWeather}
        nearbyReady={!!data.nearby.data} calendar={communityCal} onAsk={onAsk} onNeighbors={next => patch({ neighbors: next })}
        onSection={toSection} onAddNews={() => setSourcesOpen(true)} />}
    >
      <h2 className="fp-details-head section-panel-wide">THE DETAIL</h2>
      <Panel id="community-places" title="Points of interest" note="watched day and night" wide>
        <p className="community-blurb">I keep watch around every place on this list, all the time. A 911 call or a severe-weather warning inside a ring reaches you straight away — here, on your phone, and by text — and I pick out news about these places from the pages I read for you. Home, your church, the kids’ school, the town square: the more you add, the more of your community I can look after.</p>
        {waiting || <PointsOfInterest places={places} onPlaces={next => patch({ places: next })} />}
      </Panel>
      <Panel title="On your calendar" note={communityCal.length ? 'events that mention your community' : undefined} wide>
        {waiting || (!ready(summary?.calendar) ? unavailable('calendar', 'Google Calendar')
          : communityCal.length ? <ul className="dashboard-data-list calendar-events">{communityCal.map((c, i) => <li key={`${c.event.id}-${i}`}><span className="event-dot" /><div><strong>{c.what}</strong><small>{c.when}{c.who ? ` · ${c.who}` : ''}{c.event.location ? ` · ${c.event.location}` : ''}</small></div></li>)}</ul>
            : <p className="dashboard-empty">{places.some(p => p.enabled) ? 'Nothing on your calendar in the next 7 days mentions your community.' : 'Add a point of interest and I’ll look for it on your calendar.'}</p>)}
      </Panel>
      <Panel id="community-nearby" title="Near your places" note={updated ? `updated ${updated}` : undefined} wide>
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
      <Panel title="Reminders" note="at a place or a time" wide>
        <PlaceReminders onAsk={onAsk} />
      </Panel>
      <Panel id="community-events" title="Local events" note="church, school, town">
        {waiting || <LocalEvents events={community!.events} places={places} onEvents={next => patch({ events: next })} />}
      </Panel>
      <Panel id="community-neighbors" title="Neighbors" note="who lives around you">
        {waiting || <Neighbors neighbors={community!.neighbors} places={places} onNeighbors={next => patch({ neighbors: next })} onConnectContacts={() => onPanel('integrations')} />}
      </Panel>
      <Panel id="community-news" title="Local news" note="from the pages I read for you" wide>
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
      {areaStrip('community', 'Community')}
      {drawers}
    </SectionPage>;
  }

  function WorkPage() {
    const mentions = summary?.slack.data?.messages || [];
    const byStatus = [...new Set(issues.map(i => i.status))];
    const toSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // The concept's page up top (WorkPage.tsx); the editable lists stay below it.
    return <SectionPage ctx={ctx}
      eyebrow="" title="Work" blurb=""
      ask="Help me review my Jira issues and Slack mentions."
      hero={<WorkOverview issues={issues} jiraNote={ready(summary?.jira) ? null : unavailable('jira', 'Jira')}
        slack={ready(summary?.slack) ? summary?.slack.data ?? null : null} slackNote={ready(summary?.slack) ? null : unavailable('slack', 'Slack')}
        projects={proj.loading && !proj.snap.projects.length ? null : proj.snap.projects.filter(p => p.areas.some(a => a.area === 'work'))}
        events={events} timeZone={timeZone} now={now} workplaces={workOverview} onWorkplaces={setWorkOverview}
        onAsk={onAsk} onOpenProject={openProject} onNewProject={() => newProject('work')} onConnect={() => onPanel('integrations')}
        onMemory={() => onPanel('memory')} onSection={toSection} />}
    >
      <h2 className="fp-details-head section-panel-wide">THE DETAIL</h2>
      <Panel id="work-workplaces" title="Workspaces" wide note={<>where you work and your role <button type="button" className="workplace-add" onClick={() => setAddingWorkplace(true)} disabled={addingWorkplace}>＋ Add</button></>}>
        <Workplaces adding={addingWorkplace} onAdding={setAddingWorkplace} onChanged={setWorkOverview} health={{ jira: summary?.jira, slack: summary?.slack, gmail: summary?.emailTriage, google_calendar: summary?.calendar }} />
      </Panel>
      <Panel id="work-jira" title="Jira" note={summary?.jira.data?.partial ? 'Some sites could not be included' : 'assigned open issues'} wide>
        {!ready(summary?.jira) ? unavailable('jira', 'Jira')
          : !issues.length ? <p className="dashboard-empty">No assigned open issues returned.</p>
            : byStatus.map(status => <div className="day-group" key={status}>
              <h3>{status} <span className="card-count">{issues.filter(i => i.status === status).length}</span></h3>
              <Issues issues={issues.filter(i => i.status === status)} />
            </div>)}
      </Panel>
      <Panel id="work-slack" title="Slack" note={summary?.slack.data?.workspace}>
        {!ready(summary?.slack) ? unavailable('slack', 'Slack')
          : !mentions.length ? <p className="dashboard-empty">No mentions returned in the last 7 days.</p>
            : <ul className="dashboard-data-list">{mentions.map(m => <li key={m.timestamp}><ExternalLink url={m.url}><strong>#{m.channel}</strong><small>{m.text}</small></ExternalLink></li>)}</ul>}
      </Panel>
      <Panel title="Saved work context" note="what Athena remembers" wide>
        {facts.filter(f => f.category === 'work').length ? <Facts facts={facts.filter(f => f.category === 'work')} /> : <><p className="dashboard-empty">Nothing saved about your work yet.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Let me tell you about my work.')}>Tell her <span>↗</span></button></>}
      </Panel>
      <Panel id="work-projects" title="Work projects" note="kept here, off the Dashboard" wide>
        <ProjectBoard state={proj} onOpen={openProject} onNew={newProject} area="work" />
      </Panel>
      <Panel id="work-sites" title="Sites" note="up, how fast, and their Google numbers" wide>
        <Websites onConnect={() => onPanel('integrations')} />
      </Panel>
      {drawers}
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
    <SectionPage ctx={ctx} tabs={systemTabs('Mail')}
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
    const all = proj.snap.projects;
    const open = all.filter(p => !['done', 'dropped'].includes(p.status));
    const deadlines = open.filter(p => p.hardDeadline).sort((x, y) => (x.hardDeadline! < y.hardDeadline! ? -1 : 1));
    const names = [...new Set(issues.map(i => i.project))];
    return <SectionPage ctx={ctx} tabs={systemTabs('Projects')}
      eyebrow="WHAT YOU ARE BUILDING" title="Projects"
      blurb="Everything you’re working on, across every part of your life — ordered by what matters most, editable here."
      ask="Look at my projects. What should I focus on next, and how can you help?"
      stats={<>
        <Stat label="Open" value={proj.loading && !all.length ? '—' : open.length} note={`${open.filter(p => p.effectiveStatus === 'active').length} active`} />
        <Stat label="Blocked" value={open.filter(p => p.effectiveStatus === 'blocked').length} note="waiting on other projects" tone={open.some(p => p.effectiveStatus === 'blocked') ? 'ok' : undefined} />
        <Stat label="Next deadline" value={<span className="stat-small">{deadlines[0]?.title || '—'}</span>} note={deadlines[0]?.hardDeadline || 'none set'} tone={deadlines[0] ? 'alert' : 'idle'} />
      </>}
    >
      <Panel title="Your projects" note="ordered by priority, open concerns, your charter and deadlines" wide>
        <ProjectBoard state={proj} onOpen={openProject} onNew={newProject} />
      </Panel>
      <Panel title="Goals" note="saved in memory" wide>
        {data.facts.error ? <EmptyCta text="Memories unavailable." action="Retry" onClick={retryData} />
          : projects.length ? <><Facts facts={projects} /><button className="dashboard-chat-cta" onClick={() => onAsk('Help me turn one of my saved goals into a project.')}>Make one a project <span>↗</span></button></>
            : <><p className="dashboard-empty">No saved goals yet. Tell Athena what you are working towards.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Here is what I am working towards right now.')}>Tell her <span>↗</span></button></>}
      </Panel>
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
      {drawers}
    </SectionPage>;
  }

  /** The house: its projects and programs, the concerns behind them, and the charter they are decided by. */
  function HomePage() {
    const home = proj.snap.projects.filter(p => p.primaryArea === 'home');
    const open = openProjects(proj.snap, 'home');
    const programs = open.filter(p => p.kind === 'program');
    const concerns = proj.snap.concerns.filter(c => c.area === 'home' && c.status === 'open');
    const critical = concerns.filter(c => c.severity >= 5).length;
    const doneRecently = home.filter(p => p.status === 'done' && p.completedAt && Date.now() - Date.parse(p.completedAt) < 30 * 86_400_000).length;
    const issueList = propertyIssues.issues;
    const openIssues = issueList.filter(i => i.status === 'open');
    const health = propertyHealth(issueList);
    const seriousIssues = openIssues.filter(i => i.severity === 'high' || i.severity === 'emergency').length;
    const troubleshoot = (i: PropertyIssue) => onAsk(troubleshootPrompt(i));
    const findPro = (i: PropertyIssue) => onAsk(findProPrompt(i, property.property?.address || ''));
    const shownIssue = issueDrawer && issueDrawer.kind !== 'report' ? issueList.find(i => i.uuid === issueDrawer.uuid) : null;
    const shownVehicle = vehicleDrawer && vehicleDrawer.kind !== 'add' ? vehicles.vehicles.find(v => v.uuid === vehicleDrawer.uuid) : null;
    // Recent activity: project updates beside issues reported and resolved, newest first.
    const activity = [
      ...home.map(p => ({ key: p.uuid, at: p.updatedAt, label: `${p.title} · ${p.status}`, open: () => openProject(p.uuid) })),
      ...issueList.flatMap(i => [
        { key: `${i.uuid}:r`, at: i.createdAt, label: `Issue reported · ${i.location}`, open: () => setIssueDrawer({ kind: 'view', uuid: i.uuid }) },
        ...(i.resolvedAt ? [{ key: `${i.uuid}:x`, at: i.resolvedAt, label: `Issue resolved · ${i.location}`, open: () => setIssueDrawer({ kind: 'view', uuid: i.uuid }) }] : []),
      ]),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
    const contributorsOf = (uuid: string) => proj.snap.links.filter(l => l.relation === 'contributes_to' && l.to === uuid)
      .map(l => proj.snap.projects.find(p => p.uuid === l.from)).filter((p): p is NonNullable<typeof p> => !!p && p.status !== 'dropped');
    return <SectionPage ctx={ctx}
      eyebrow="HOUSE & LAND" title={property.property?.name || 'Our Property'} backdrop="/assets/e9e9086f-a18a-43d4-8b99-789f10dcc7cf.png"
      headerAside={<PropertyWeather address={property.property?.address || ''} />}
      blurb={property.property?.description || 'The house and the land around it: what needs doing, what’s worrying you, and the rules you decide by.'}
      ask="Look at my home projects, concerns and open property issues. What should I do next, and how can you help?"
      stats={<>
        <Stat label="Property health" icon="Home" value={propertyIssues.loading ? '—' : propertyIssues.error ? 'Unavailable' : health.label} note={propertyIssues.loading || propertyIssues.error ? 'from active issues' : health.note} tone={propertyIssues.loading || propertyIssues.error ? undefined : health.tone} />
        <Stat label="Active issues" icon="Issues" value={propertyIssues.loading ? '—' : propertyIssues.error ? 'Unavailable' : openIssues.length} note={seriousIssues ? `${seriousIssues} high or emergency` : openIssues.length ? 'none serious' : 'nothing reported'} tone={seriousIssues ? 'alert' : openIssues.length ? 'ok' : 'good'} />
        <Stat label="Open projects" icon="ProjectList" value={proj.loading && !home.length ? '—' : open.filter(p => p.kind !== 'program').length} note={`${open.filter(p => p.effectiveStatus === 'active').length} active`} />
        <Stat label="Open concerns" icon="Concerns" value={concerns.length} note={critical ? `${critical} critical` : 'none critical'} tone={critical ? 'alert' : concerns.length ? 'ok' : 'good'} />
        <Stat label="Done this month" icon="Completed" value={doneRecently} note="last 30 days" tone={doneRecently ? 'good' : 'idle'} />
      </>}
    >
      <PropertyNavigation active={propertyTab} onChange={setPropertyTab} />
      <div className="property-tab-content" role="tabpanel" id="property-tab-panel" aria-labelledby={`tab-${propertyTab}`} tabIndex={0}>
      {(propertyTab === 'property-overview' || propertyTab === 'property-issues') && <ActiveIssueBanner issues={issueList} onOpen={uuid => setIssueDrawer({ kind: 'view', uuid })} onTroubleshoot={troubleshoot} onFindPro={findPro} onShowAll={() => setPropertyTab('property-issues')} />}
      {(propertyTab === 'property-overview' || propertyTab === 'property-map') && <PropertyOverview state={property} snap={proj.snap} issues={issueList} projectsLoading={proj.loading || !!proj.error} mapOnly={propertyTab === 'property-map'}
        charter={close => <CharterView state={proj} area="home" onEdit={() => { close(); setDrawer({ kind: 'charter', area: 'home' }); }} />} />}
      {propertyTab === 'property-overview' && <Panel title="Issues" note="open, most serious first" id="property-issues-summary" scroll>
        <IssueList state={propertyIssues} limit={4} onOpen={uuid => setIssueDrawer({ kind: 'view', uuid })} onReport={() => setIssueDrawer({ kind: 'report' })} />
        {issueList.length > 0 && <NavigationLink href="#property-issues" onNavigate={() => setPropertyTab('property-issues')}>See all issues ({issueList.length})</NavigationLink>}
      </Panel>}
      {propertyTab === 'property-utilities' && <Panel title="Thermostats" note="Google Nest" id="property-thermostats" wide>
        <ThermostatList state={thermostats} onConnect={() => void reconnect('nest')} connecting={reconnecting === 'nest'} />
      </Panel>}
      {propertyTab === 'property-issues' && <Panel title="Issues" note="everything reported, open first" wide>
        <IssueList state={propertyIssues} onOpen={uuid => setIssueDrawer({ kind: 'view', uuid })} onReport={() => setIssueDrawer({ kind: 'report' })} />
      </Panel>}
      {propertyTab === 'property-vehicles' && <Panel title="Vehicles" note={property.property?.name ? `kept at ${property.property.name}` : 'kept at this property'} wide>
        <VehicleList state={vehicles} propertyName={property.property?.name || ''} hasProperty={!!property.property} onOpen={uuid => setVehicleDrawer({ kind: 'view', uuid })} onAdd={() => setVehicleDrawer({ kind: 'add' })} />
      </Panel>}
      {propertyTab === 'property-overview' && <Panel title="Up next" note="highest first" id="property-projects">
        {proj.error && <p role="alert">{proj.error} <button onClick={proj.reload}>Retry</button></p>}
        {proj.loading ? <p>Loading projects…</p> : <ProjectList projects={open.slice(0, 3)} snap={proj.snap} onOpen={openProject} />}
        <div className="property-next-actions">
          <NavigationLink href="#property-projects" onNavigate={() => setPropertyTab('property-projects')}>See all projects ({home.length})</NavigationLink>
          <DrawerButton primary onClick={() => newProject('home')}><span aria-hidden="true">＋</span>New project</DrawerButton>
        </div>
      </Panel>}
      {propertyTab === 'property-projects' && <Panel title="Projects" note="all property projects" wide><ProjectBoard state={proj} onOpen={openProject} onNew={newProject} area="home" /></Panel>}
      {propertyTab === 'property-overview' && <Panel title="Recent activity" note="project updates and issues" id="property-activity" scroll>
        <div className="property-activity">{activity.map(a => <button key={a.key} onClick={a.open}><span>{a.label}</span><time>{new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></button>)}{!activity.length && <p>No property activity yet.</p>}</div>
      </Panel>}
      {(propertyTab === 'property-overview' || propertyTab === 'property-season') && <Panel title="Seasonal focus" note={new Date().toLocaleDateString(undefined, { month: 'long' })} id="property-season" wide={propertyTab === 'property-season'} scroll>
        <ProjectList snap={proj.snap} projects={open.filter(p => p.seasonMonths?.includes(new Date().getMonth() + 1))} onOpen={openProject} />
        {!open.some(p => p.seasonMonths?.includes(new Date().getMonth() + 1)) && <p>No open projects scheduled for this month. Set seasonal months in a project to include it here.</p>}
      </Panel>}
      {propertyTab === 'property-projects' && programs.length > 0 && <Panel title="Programs" note="the bigger efforts, and their parts" wide>
        <ul className="flex flex-col gap-3">{programs.map(pg => {
          const parts = contributorsOf(pg.uuid).sort((x, y) => (y.rank ?? -1e9) - (x.rank ?? -1e9));
          return <li key={pg.uuid} className="rounded-lg border border-slate-800 p-3">
            <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => openProject(pg.uuid)}>
              <strong className="text-sm text-slate-100">{pg.title}</strong>
              <span className="text-xs text-slate-400">{parts.filter(p => p.status === 'done').length}/{parts.length} done</span>
            </button>
            <ul className="mt-2 flex flex-wrap gap-1">{parts.map(p => <li key={p.uuid}>
              <button type="button" onClick={() => openProject(p.uuid)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${p.status === 'done' ? 'border-slate-800 text-slate-500 line-through' : 'border-slate-700 text-slate-300 hover:border-cyan-600'}`}>
                {p.title}{p.status !== 'done' && p.effectiveStatus !== 'ready' && <StateChip state={p.effectiveStatus} />}
              </button>
            </li>)}</ul>
          </li>;
        })}</ul>
      </Panel>}
      {propertyTab === 'property-concerns' && <Panel title="Concerns" note="the problems your projects answer" wide id="property-concerns">
        <ConcernList state={proj} area="home" onOpen={uuid => setDrawer({ kind: 'concern', uuid, area: 'home' })} onNew={() => setDrawer({ kind: 'concern', uuid: null, area: 'home' })} />
      </Panel>}
      </div>
      {drawers}
      {issueDrawer?.kind === 'report' && <ReportIssueDrawer state={propertyIssues} areas={property.property?.areas.map(a => a.name) || []} onClose={() => setIssueDrawer(null)} />}
      {issueDrawer?.kind === 'edit' && shownIssue && <ReportIssueDrawer state={propertyIssues} issue={shownIssue} areas={property.property?.areas.map(a => a.name) || []} onClose={() => setIssueDrawer({ kind: 'view', uuid: shownIssue.uuid })} />}
      {vehicleDrawer?.kind === 'add' && <VehicleDrawer state={vehicles} propertyUuid={property.property?.uuid || null} onClose={() => setVehicleDrawer(null)} />}
      {vehicleDrawer?.kind === 'edit' && shownVehicle && <VehicleDrawer state={vehicles} vehicle={shownVehicle} propertyUuid={shownVehicle.propertyUuid} onClose={() => setVehicleDrawer({ kind: 'view', uuid: shownVehicle.uuid })} />}
      {vehicleDrawer?.kind === 'view' && shownVehicle && <VehicleDetailsDrawer state={vehicles} vehicle={shownVehicle} propertyName={shownVehicle.propertyUuid === property.property?.uuid ? property.property?.name || '' : ''} onClose={() => setVehicleDrawer(null)} onEdit={() => setVehicleDrawer({ kind: 'edit', uuid: shownVehicle.uuid })} onAsk={v => onAsk(vehiclePrompt(v))} />}
      {issueDrawer?.kind === 'view' && shownIssue && <IssueDetailsDrawer state={propertyIssues} issue={shownIssue} onClose={() => setIssueDrawer(null)} onEdit={() => setIssueDrawer({ kind: 'edit', uuid: shownIssue.uuid })} onTroubleshoot={troubleshoot} onFindPro={findPro} />}
    </SectionPage>;
  }

  function NewsPage() {
    const broken = newsSources.filter(s => s.lastError);
    const watching = newsSources.filter(s => s.enabled);
    const publishers = [...new Set(news.map(n => n.source))];
    // The fastest rhythm on the list, which is the honest answer to "how close
    // to live is this page?" — and the one she raises herself when it matters.
    const fastest = watching.reduce<typeof watching[number] | null>((best, s) => (!best || s.everyMinutes < best.everyMinutes ? s : best), null);
    return <SectionPage ctx={ctx} tabs={systemTabs('News')}
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

  /**
   * The briefing, full width: Athena at the centre of the areas of a life,
   * the six numbers people glance at, then a card per area. Every value is
   * read from the same derivations the section pages use; a source that is
   * down shows its own status and the button that fixes it, never a guess.
   */
  function homeBriefing() {
    const updates = homeUpdates(summary, home.dreams.data, now);
    const recoveryDelta = ready(summary?.recovery) ? recoveryChange(summary?.recovery.data ?? []) : null;
    const checked = (key: keyof DashboardSummary) => ready(summary?.[key]) ? `Checked ${freshness(summary?.[key]?.checkedAt, now)}` : undefined;
    const calendarLead = ready(summary?.calendar) ? lead : null;
    const openIssues = propertyIssues.issues.filter(i => i.status === 'open');
    const dreams = [...(home.dreams.data || [])].sort((a, b) => b.date.localeCompare(a.date));
    const monthAgo = zonedDay(new Date(Date.now() - 30 * 86400000), timeZone);
    const dreamt = dreams.filter(d => d.date > monthAgo && (d.status === 'ok' || d.status === 'partial'));
    const lastDream = dreams.find(d => d.status !== 'running');
    const readinessTone: Tone = readiness?.level === 'warning' ? 'alert' : readiness?.level === 'rest' ? 'warn' : readiness ? 'good' : 'idle';
    const loadingWord = '…';

    // --- Hero -------------------------------------------------------------
    const nodes: HeroNode[] = [
      { id: 'health', label: 'Health', icon: 'Health', onOpen: go('Health'), tone: whoopDown ? 'idle' : readinessTone,
        status: whoopDown ? 'Connect WHOOP' : recovery?.recovery_score != null ? `${readiness ? `${readiness.label} · ` : ''}${recovery.recovery_score}%` : data.summary.loading ? loadingWord : 'No score yet' },
      { id: 'family', label: 'Family', icon: 'Family', onOpen: go('Family'),
        tone: sickFamily.length ? 'alert' : roster[0]?.signal.kind === 'birthday' ? 'warn' : roster.length ? 'good' : 'idle',
        status: sickFamily.length ? `${sickFamily.length} unwell` : roster[0]?.signal.kind === 'birthday' ? `${roster[0].name} · ${roster[0].signal.label}` : roster.length ? `${roster.length} in your corner` : data.facts.loading ? loadingWord : 'Tell her' },
      { id: 'work', label: 'Work', icon: 'Work', onOpen: go('Work'),
        tone: !ready(summary?.jira) ? 'idle' : issues.length ? 'warn' : 'good',
        status: ready(summary?.jira) ? `${issues.length} open` : summary ? statusText[summary.jira.status] : loadingWord },
      { id: 'property', label: 'Property', icon: 'Home', onOpen: go('Property'),
        tone: openIssues.some(i => i.severity === 'high' || i.severity === 'emergency') ? 'alert' : openIssues.length || homeConcerns.length ? 'warn' : 'good',
        status: propertyIssues.loading ? loadingWord : propertyIssues.error || proj.error ? 'Unavailable' : openIssues.length ? `${openIssues.length} issue${openIssues.length === 1 ? '' : 's'}` : homeConcerns.length ? `${homeConcerns.length} concern${homeConcerns.length === 1 ? '' : 's'}` : 'No open issues' },
      { id: 'dreams', label: 'Dreams', icon: 'Dreams', onOpen: go('Dreams'), tone: dreamt.length ? 'good' : 'idle',
        status: home.dreams.loading ? loadingWord : !home.dreams.data ? 'Unavailable' : `${dreamt.length} night${dreamt.length === 1 ? '' : 's'}` },
      { id: 'community', label: 'Community', icon: 'Community', onOpen: go('Community'),
        tone: nearbyWeather.length ? 'alert' : nearbyCalls.length ? 'warn' : 'good',
        status: nearbyWeather.length ? nearbyWeather[0].event : nearbyCalls.length ? `${nearbyCalls.length} call${nearbyCalls.length === 1 ? '' : 's'} nearby`
          : communityCal.length ? `${communityCal.length} coming up` : data.nearby.loading ? loadingWord : 'Quiet' },
    ];
    const blurb = 'Here’s what matters and what’s next.';

    // --- Stat strip -------------------------------------------------------
    const program = home.plan.data?.program;
    const activeProgram = program && !program.ended && !program.before_start ? program : null;
    const session = activeProgram?.sessions.find(s => s.date === localDay());
    const restDay = !session || session.kind === 'rest';
    const sky = home.weather.data?.weather;
    const temps = (sky?.hours || []).map(h => h.temperatureF).filter((t): t is number => t !== null);

    const inProgress = issues.filter(i => i.statusCategory === 'indeterminate').length;
    const dayWord = (event: CalendarEvent) => {
      const day = eventDay(event, timeZone);
      const tomorrow = zonedDay(new Date(Date.now() + 86400000), timeZone);
      return day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : dateLabel(`${day}T12:00:00Z`, { timeZone: 'UTC', weekday: 'short' });
    };
    const statStrip = <div className="dh-stats">
      {!working && <RightNowCard data={data.rightNow.data} loading={data.rightNow.loading} error={data.rightNow.error} onAsk={onAsk} onManage={() => setPlansOpen(true)} />}
      <HomeStat icon="Health" label="Recovery" onClick={go('Health')} tone={whoopDown ? 'idle' : readinessTone}
        value={recovery?.recovery_score != null && !whoopDown ? `${recovery.recovery_score}%` : '—'}
        chip={readiness && !whoopDown ? <span className={`readiness readiness-${readiness.level}`}>{readiness.label}</span> : undefined}
        note={!ready(summary?.recovery) ? (summary ? statusText[summary.recovery.status] : 'Loading…') : recoveryDelta ? `${recoveryDelta.delta > 0 ? '+' : ''}${recoveryDelta.delta} points vs ${recoveryDelta.previous.date}` : readiness?.headline || 'No scored result'}
        freshness={ready(summary?.recovery) && recovery ? `Reading ${recovery.date}` : undefined}
        spark={ready(summary?.recovery) && <Spark tone="green" values={week(scoredDays, r => r.recovery_score).map(d => d.value)} label="Recovery over the last seven calendar days" />} />
      <HomeStat icon="Gym" label="Gym" onClick={go('Health')} tone={session?.status === 'done' ? 'good' : 'idle'}
        value={home.plan.loading ? '—' : !home.plan.data ? 'Unavailable' : !activeProgram ? 'No plan' : restDay ? 'Rest day' : session!.title}
        note={home.plan.loading ? 'Loading…' : !home.plan.data ? 'Training plan couldn’t load' : !activeProgram ? 'Set one on Health' : restDay ? activeProgram.name
          : session!.status === 'done' ? 'Done' : session!.status === 'skipped' ? 'Skipped' : session!.focus || 'Today'} />
      <HomeStat icon="Calendar" label={lead ? `Next event · ${lead.ongoing ? 'on now' : dayWord(lead.event)}` : 'Next event'} onClick={go('Calendar')} tone={lead?.ongoing ? 'warn' : 'idle'}
        value={lead ? eventTime(lead.event, timeZone) : ready(summary?.calendar) ? 'Clear' : '—'}
        note={lead ? `${lead.event.title} · ${lead.ongoing ? 'on now' : `in ${untilLabel(lead.ms)}`}` : ready(summary?.calendar) ? 'Nothing timed coming up' : summary ? statusText[summary.calendar.status] : 'Loading…'} freshness={checked('calendar')} />
      <HomeStat icon="Tasks" label="Open tasks" onClick={go('Work')} tone={ready(summary?.jira) && issues.length ? 'warn' : 'idle'}
        value={ready(summary?.jira) ? `${issues.length}${summary?.jira.data?.capped || summary?.jira.data?.partial ? '+' : ''}` : '—'}
        note={ready(summary?.jira) ? (inProgress ? `Jira · ${inProgress} in progress` : 'Jira issues') : summary ? statusText[summary.jira.status] : 'Loading…'} freshness={checked('jira')} />
      <HomeStat icon="Weather" label={sky?.town || 'Weather'} onClick={go('Community')}
        value={sky?.now.temperatureF != null ? `${Math.round(sky.now.temperatureF)}°` : '—'}
        note={sky ? `${sky.now.shortForecast || ''}${temps.length ? ` · H ${Math.round(Math.max(...temps))}° L ${Math.round(Math.min(...temps))}°` : ''}`
          : home.weather.loading ? 'Loading…' : home.weather.data?.status === 'no_place' ? 'Add a home place' : 'Unavailable'} freshness={sky ? `Forecast checked ${freshness(sky.checkedAt, now)}` : undefined} />
    </div>;

    // --- Today's schedule ---------------------------------------------------
    const CAL_TONES = ['#f5a524', '#2fd4a7', '#a77bff', '#39c2ff', '#ff7a90'];
    const calTone = (event: CalendarEvent) => CAL_TONES[[...(event.calendar || 'primary')].reduce((n, c) => n + c.charCodeAt(0), 0) % CAL_TONES.length];
    const upcoming = events.filter(e => eventDay(e, timeZone) >= today)
      .sort((a, b) => eventDay(a, timeZone).localeCompare(eventDay(b, timeZone)) || Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
    const scheduleDays = [...new Set(upcoming.map(e => eventDay(e, timeZone)))].slice(0, 3);
    let budget = 7;
    const schedule = <HomeSection id="schedule" icon="Calendar" title="Your day" action="View calendar" onAction={go('Calendar')}>
      {ready(summary?.calendar) && <p className="dh-section-caption">Google Calendar · {checked('calendar')}</p>}
      {!ready(summary?.calendar) ? <SourceNote source={summary?.calendar} name="Google Calendar" fix={fixFor('calendar')} />
        : !scheduleDays.length ? <p className="dashboard-empty">Nothing on the calendar for the next few days.</p>
          : scheduleDays.map(day => {
            const dayEvents = upcoming.filter(e => eventDay(e, timeZone) === day);
            const allDay = dayEvents.filter(e => e.allDay);
            const timed = dayEvents.filter(e => !e.allDay);
            const past = timed.filter(e => Date.parse(e.end) <= now);
            const remaining = timed.filter(e => !(Date.parse(e.end) <= now));
            const list = [...past.slice(-2), ...remaining].slice(0, Math.max(0, budget));
            budget -= list.length;
            if (!list.length && !allDay.length) return null;
            const nowIndex = list.findIndex(e => !(Date.parse(e.end) <= now));
            const marker = <li className="dh-now"><time>{new Date(now).toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' })}</time><i /><span>Now</span></li>;
            const d = new Date(`${day}T12:00:00Z`);
            return <div className="dh-day" key={day}>
              <div className="dh-day-label"><small>{d.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' }).toUpperCase()}</small><strong>{d.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).toUpperCase()}</strong></div>
              <div className="dh-day-events">
                {!!allDay.length && <details className="dh-allday"><summary>All day · {allDay.length === 1 ? allDay[0].title : `${allDay.length} events`}</summary>
                  {allDay.map((e, i) => <button key={`${e.id}-${i}`} type="button" onClick={go('Calendar')}>{e.title}</button>)}</details>}
                <ul>{list.map((e, i) => <Fragment key={`${e.id}-${i}`}>
                  {day === today && i === nowIndex && marker}
                  <li className={Date.parse(e.end) <= now ? 'dh-event-past' : e === calendarLead?.event ? 'dh-event-next' : undefined}>
                    <time>{eventTime(e, timeZone)}</time><i style={{ background: calTone(e) }} />
                    <button type="button" className="dh-event" onClick={go('Calendar')}><strong>{e.title}</strong>
                      {e.location && <small>{e.location}</small>}
                      {e === calendarLead?.event && <em>{calendarLead.ongoing ? 'On your calendar now' : `In ${untilLabel(calendarLead.ms)}`}</em>}
                      {Date.parse(e.end) <= now && <small>Ended on calendar</small>}
                    </button>
                  </li>
                </Fragment>)}{day === today && nowIndex === -1 && marker}</ul>
                {timed.length > list.length && <button type="button" className="dh-more" onClick={go('Calendar')}>View all {timed.length} timed events →</button>}
              </div>
            </div>;
          })}
    </HomeSection>;

    // --- Work ---------------------------------------------------------------
    const sites = [...new Set(issues.map(i => i.site))];
    const siteName = (site: string) => site.replace(/^https?:\/\//, '').replace(/\.atlassian\.net.*$/, '').split(/[-_.]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const activeSite = sites.includes(workSite) ? workSite : sites[0];
    const siteIssues = issues.filter(i => i.site === activeSite);
    const pill = (i: JiraIssue) => i.statusCategory === 'indeterminate' ? 'progress' : i.statusCategory === 'done' ? 'done' : /review/i.test(i.status) ? 'review' : 'todo';
    const work = <HomeSection id="work" icon="Work" title="Work" onAction={go('Work')}
      tabs={ready(summary?.jira) && <HomeTabs label="Jira sites" tabs={sites.map(s => ({ id: s, label: siteName(s), count: issues.filter(i => i.site === s).length }))} active={activeSite} onChange={setWorkSite} />}>
      {!ready(summary?.jira) ? <SourceNote source={summary?.jira} name="Jira" fix={fixFor('jira')} />
        : !issues.length ? <p className="dashboard-empty">No assigned open issues.</p>
          : <>
            <ul className="dh-issues">{siteIssues.slice(0, 3).map(i => <li key={i.key}><ExternalLink url={i.url}>
              <b className="dh-issue-badge">{i.project.charAt(0)}</b><code>{i.key}</code><span>{i.title}</span><em className={`dh-pill dh-pill-${pill(i)}`}>{i.status}</em>
            </ExternalLink></li>)}</ul>
          </>}
    </HomeSection>;

    // --- Projects (never work ones: those live on Work, owner 2026-10-13) ----
    const projectAreas = [...new Set(dashProjects.map(p => p.primaryArea))];
    const areaFilter = projectArea !== 'all' && projectAreas.includes(projectArea) ? projectArea : 'all';
    const shownProjects = dashProjects.filter(p => areaFilter === 'all' || p.primaryArea === areaFilter);
    const projects = <HomeSection id="projects" icon="Projects" title="Projects" onAction={go('Projects')}
      tabs={<HomeTabs<Area | 'all'> label="Project areas" tabs={[{ id: 'all', label: 'All' }, ...projectAreas.map(a => ({ id: a, label: AREA_LABEL[a] }))]} active={areaFilter} onChange={setProjectArea} />}>
      {proj.error && !proj.snap.projects.length ? <EmptyCta text="Projects couldn’t load." action="Retry" onClick={proj.reload} />
        : proj.loading && !proj.snap.projects.length ? <p className="dashboard-empty">Loading…</p>
          : !shownProjects.length ? <EmptyCta text="No projects yet." action="Start one" onClick={() => newProject()} />
            : <ul className="dh-projects">{shownProjects.slice(0, 3).map(p => {
              const { done, total } = p.progress.steps;
              return <li key={p.uuid}><button type="button" onClick={() => openProject(p.uuid)}>
                <i className={`dh-area dh-area-${p.primaryArea}`} />
                <span><strong title={p.title}>{p.title}</strong><small>{AREA_LABEL[p.primaryArea]} · {STATE_LABEL[p.effectiveStatus]}</small></span>
                {total ? <><span className="dh-progress" aria-label={`${done} of ${total} steps done`}><span style={{ width: `${(done / total) * 100}%` }} /></span><em>{done}/{total}</em></>
                  : <small className="dh-no-steps">No steps set</small>}
              </button></li>;
            })}</ul>}
    </HomeSection>;

    // --- Health -------------------------------------------------------------
    const run = <T,>(rows: T[], pick: (row: T) => number | null | undefined) => rows.slice(0, 14).reverse().map(r => pick(r) ?? null);
    const whoopUnlinked = (['recovery', 'sleep', 'strain'] as const).every(key => summary?.[key]?.status === 'not_connected');
    const health = <HomeSection id="health" icon="Health" title="Health & Performance" action="View details" onAction={go('Health')}>
      {!whoopUnlinked && <div className="dh-readiness"><RecoveryRing score={recovery?.recovery_score} />
        <div className="dh-readiness-label">{readiness && <span className={`readiness readiness-${readiness.level}`}>{readiness.label}</span>}<small>{recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'}</small></div>
        {readiness && <p>{readiness.reason}</p>}</div>}
      {whoopNotes()}
      <div className="dh-metrics">
        {!whoopUnlinked && <>
          <HeartMetric label="Resting HR" value={recovery?.resting_heart_rate} unit="bpm" goal={HEART_GOALS.restingHeartRate} better="lower" trend={rhrTrend}
            spark={<Spark tone="green" values={run(scoredDays, r => r.resting_heart_rate)} />} />
          <HeartMetric label="HRV" value={recovery?.hrv_ms} unit="ms" goal={HEART_GOALS.hrvMs} better="higher" trend={hrvTrend}
            spark={<Spark tone="green" values={run(scoredDays, r => r.hrv_ms)} />} />
          <HeartMetric label="Sleep" value={sleep?.hours_asleep} display={sleep ? hoursMinutes(sleep.hours_asleep) : undefined} unit="h" better="higher" trend={sleepTrend} decimals={1}
            spark={<Spark tone="violet" values={run(sleepDays, s => s.hours_asleep)} />} />
        </>}
        {weighIn && <HeartMetric label="Weight" value={lbOf(weighIn.weight_kg)} unit="lb" better="flat" trend={weightTrend} decimals={1}
          spark={<Spark tone="green" values={run(weighDays, w => lbOf(w.weight_kg))} />} />}
      </div>
    </HomeSection>;

    // --- Property -----------------------------------------------------------
    const banner = property.property?.headerImage;
    const propertyCard = <HomeSection id="property" icon="Home" title="Property" onAction={go('Property')}>
      {banner && <div className="dh-property-banner" style={{ backgroundImage: `url("${banner}")` }} role="img" aria-label={property.property?.name || 'The property'} />}
      {propertyIssues.loading ? <p className="dashboard-empty">Loading…</p>
        : propertyIssues.error ? <EmptyCta text="Issues couldn’t load." action="Retry" onClick={propertyIssues.retry} />
          : <ul className="dh-status-list">
            {openIssues.slice(0, 2).map(i => <li key={i.uuid} className={`dh-status-${i.severity === 'high' || i.severity === 'emergency' ? 'alert' : 'warn'}`}>
              <button type="button" onClick={go('Property')}><i>!</i><span><strong>{i.description}</strong><small>{i.location} · reported {reportedWhen(i.createdAt)}</small></span></button>
            </li>)}
            {homeConcerns.slice(0, openIssues.length ? 1 : 2).map(c => <li key={c.uuid} className="dh-status-warn">
              <button type="button" onClick={go('Property')}><i>?</i><span><strong>{c.title}</strong><small>Open concern{c.frequency ? ` · ${c.frequency}` : ''}</small></span></button>
            </li>)}
            {!openIssues.length && <li className="dh-status-good"><button type="button" onClick={go('Property')}><i>✓</i><span><strong>No open issues</strong><small>{homeOpen.length ? `${homeOpen.length} house project${homeOpen.length === 1 ? '' : 's'} open` : 'Nothing reported'}</small></span></button></li>}
          </ul>}
    </HomeSection>;

    // --- Dreams -------------------------------------------------------------
    const nights = Array.from({ length: 30 }, (_, i) => zonedDay(new Date(Date.now() - (29 - i) * 86400000), timeZone));
    const byNight = new Map(dreams.map(d => [d.date, d]));
    const excerpt = (text: string) => { const plain = text.replace(/`/g, '').replace(/\s+/g, ' ').trim(); return plain.length > 150 ? `${plain.slice(0, 150).replace(/\s+\S*$/, '')}…` : plain; };
    const dreamsCard = <HomeSection id="dreams" icon="Dreams" title="Dreams" onAction={go('Dreams')}>
      {home.dreams.loading ? <p className="dashboard-empty">Loading…</p>
        : !home.dreams.data ? <p className="dashboard-empty">Dreams couldn’t load.</p>
          : <>
            <div className="dh-dream-count"><p><strong>{dreamt.length}</strong> night{dreamt.length === 1 ? '' : 's'}<small>in the last 30 days</small></p>
              <Spark tone="violet" values={nights.map(n => { const d = byNight.get(n); if (!d || d.status === 'skipped') return null; const s = d.stats || {}; return Math.max(1, (s.steps_ok ?? 0) + (s.steps_failed ?? 0)); })} label={`${dreamt.length} nights dreamt in the last 30 days`} /></div>
            {!lastDream ? <p className="dashboard-empty">I haven’t dreamed yet. Once I do, I’ll tell you about it here.</p>
              : <div className="dh-dream">
                <header><strong>Most recent dream</strong><span>{STATUS_LINE[lastDream.status]}</span></header>
                <small>{nightLabel(lastDream.date)}</small>
                {lastDream.hasImage && <DreamImage uuid={lastDream.uuid} className="dh-dream-image" />}
                <p>{excerpt(lastDream.narrative || lastDream.summary || 'I looked things over and left them as they were.')}</p>
                <button type="button" className="source-fix" onClick={() => onAsk('Tell me about what you dreamed last night.')}>Ask her about it <span>↗</span></button>
              </div>}
          </>}
    </HomeSection>;

    return <>
      <HomeHero greeting={greeting} firstName={firstName} blurb={blurb} nodes={nodes} />
      {data.summary.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {data.summary.error}</p>}
      <EmergencyBanner onAsk={onAsk} onPlaces={onPlaces} inline />
      <HomeChanges updates={updates} now={now} onOpen={area => onNavigate?.(area)} compact />
      {statStrip}
      <WorkBanner events={events} workingLocations={summary?.calendar.data?.workingLocations} timeZone={timeZone} now={now} jira={summary?.jira.status === 'ready' ? summary.jira.data : null} onOpen={go('Calendar')} onOpenWork={go('Work')} />

      <div className="dh-row dh-row-three">{schedule}{work}{projects}</div>
      {/* Health, then Family: the owner's order for the areas of a life. */}
      <div className="dh-row dh-row-four">{health}
        <HomeSection id="family" icon="Family" title="Family" onAction={go('Family')}>{familyCardBody()}</HomeSection>
        {propertyCard}{dreamsCard}</div>
    </>;
  }

  // The briefing is what Home and the drawer show; every other nav entry has
  // a page of its own.
  if (!compact && section !== 'Dashboard') {
    if (section === 'Today') return TodayPage();
    if (section === 'Calendar') return CalendarPage();
    if (section === 'Health') return HealthPage();
    if (section === 'Workouts') return WorkoutsPage();
    if (section === 'Family') return FamilyPage();
    if (section === 'Community') return CommunityPage();
    if (section === 'Mail') return MailPage();
    if (section === 'Work') return WorkPage();
    if (section === 'Projects') return ProjectsPage();
    if (section === 'Property') return HomePage();
    if (section === 'News') return NewsPage();
    if (section === 'Dreams') return <DreamsPage ctx={ctx} tabs={systemTabs('Dreams')} />;
    if (section === 'Finance') return <FinancePage ctx={ctx} tabs={systemTabs('Finance')} />;
    if (section === 'System') return SystemPage();
  }

  if (!compact) return <main className="dashboard-content dashboard-home">
    <div className="dashboard-toolbar"><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
    {homeBriefing()}
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>Whatever’s on your mind,<br />you don’t have to carry it alone.</h2><button className="dashboard-chat-cta" onClick={() => onAsk('')}>Let’s talk <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button><button onClick={() => onPanel('photo')}>Share a moment <span>↗</span></button><button onClick={() => onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => setSourcesOpen(true)}>News sources <span>↗</span></button><button onClick={() => setPlansOpen(true)}>Places <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {sourcesOpen && <NewsSourcesPanel onClose={() => setSourcesOpen(false)} onSaved={() => void data.refresh()} />}
    {plansOpen && <PlansPanel onClose={() => setPlansOpen(false)} onSaved={() => void data.refresh()} />}
    {drawers}
    {selectedEmail && <EmailPanel uuid={selectedEmail} onClose={() => setSelectedEmail(null)} onChanged={() => { setMailRefresh(n => n + 1); void data.refresh(); }} />}
  </main>;

  // The compact drawer keeps the folded cards: one headline each, in the fixed order.
  return <main className={`dashboard-content ${compact ? 'dashboard-compact' : ''}`}>
    <div className="dashboard-toolbar"><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
    <PageHeader eyebrow="YOUR DAILY BRIEFING" title={`${greeting}, ${firstName}`} blurb="Here’s what’s on your radar today." />
    {data.summary.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {data.summary.error}</p>}
    {/* The emergency near home first, then the one thing on this page that
        answers a question rather than reporting a source — both above the
        cards because they are what people actually arrive with. The console
        leaves the banner out of its own header on this page so it shows once;
        the compact drawer skips it, the console's banner is already above it. */}
    {!compact && <EmergencyBanner onAsk={onAsk} onPlaces={onPlaces} inline />}
    <WorkBanner events={events} workingLocations={summary?.calendar.data?.workingLocations} timeZone={timeZone} now={now} jira={summary?.jira.status === 'ready' ? summary.jira.data : null} onOpen={go('Calendar')} onOpenWork={go('Work')} />
    {/* While the work banner is up it already answers "what now" — the next
        meeting, the ticket in progress — so Right Now stays out of its way. */}
    {!working && <RightNowCard
      data={data.rightNow.data} loading={data.rightNow.loading} error={data.rightNow.error}
      onAsk={onAsk} onManage={() => setPlansOpen(true)}
    />}
    <div className="dashboard-grid">{ranked.slice(0, PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    <div className="dashboard-secondary">{ranked.slice(PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    {/* Below the cards, not among them: the card order is fixed (Health
        first) and this isn't a source — it's her night, told as a dream. */}
    {!compact && <DreamCard onOpen={go('Dreams')} onAsk={onAsk} />}
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>Whatever’s on your mind,<br />you don’t have to carry it alone.</h2><button className="dashboard-chat-cta" onClick={() => onAsk('')}>Let’s talk <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button><button onClick={() => onPanel('photo')}>Share a moment <span>↗</span></button><button onClick={() => onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => setSourcesOpen(true)}>News sources <span>↗</span></button><button onClick={() => setPlansOpen(true)}>Places <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {compact && <button className="dashboard-chat-cta" onClick={onExpand}>Open full dashboard ↗</button>}
    {sourcesOpen && <NewsSourcesPanel onClose={() => setSourcesOpen(false)} onSaved={() => void data.refresh()} />}
    {plansOpen && <PlansPanel onClose={() => setPlansOpen(false)} onSaved={() => void data.refresh()} />}
    {drawers}
    {selectedEmail && <EmailPanel uuid={selectedEmail} onClose={() => setSelectedEmail(null)} onChanged={() => { setMailRefresh(n => n + 1); void data.refresh(); }} />}
  </main>;
}
