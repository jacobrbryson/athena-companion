import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEvent, Source, JiraIssue, RecoveryDay, DashboardSummary, TwilioBilling, TriageEmail } from '../api/dashboard';
import { dashboardApi } from '../api/dashboard';
import type { Fact } from '../api/companion';
import { useDashboardData } from './useDashboardData';
import { NewsSourcesPanel } from './NewsSourcesPanel';
import { PlansPanel } from './PlansPanel';
import { EmergencyBanner } from './EmergencyBanner';
import { RightNowCard } from './RightNowCard';
import { EmailPanel, CATEGORY_LABEL } from './EmailPanel';

export type DashboardSection = 'Home' | 'Today' | 'Calendar' | 'Health' | 'Family' | 'Mail' | 'Work' | 'Projects' | 'News' | 'System';
// Explicit sprite windows preserve the borders on this irregular sheet. Today
// uses the supplied calendar tile so it has the same framed treatment as the
// other navigation links; the page itself remains distinct from Calendar.
const icons: Record<string, number> = { Home: 24, Today: 130, Calendar: 130, Health: 235, Family: 339, Work: 444, Projects: 551, News: 658, 'Quick Actions': 761, Search: 862, Chat: 970, More: 1075, Settings: 1183 };
// Icons the supplied sheet has no window for, drawn to sit in the same box.
const drawn: Record<string, ReactNode> = {
  Notifications: <><path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.5 5.6-1.5 5.6h13.8s-1.5-1.4-1.5-5.6A5.4 5.4 0 0 0 12 3.6Z" /><path d="M10.4 18a1.8 1.8 0 0 0 3.2 0" /></>,
  Mail: <><rect x="3.6" y="6" width="16.8" height="12" rx="1.4" /><path d="m4.2 6.8 7.8 6 7.8-6" /></>,
};
export function DashboardIcon({ name }: { name: string }) {
  const art = drawn[name];
  if (art) {
    return <svg aria-hidden="true" className="dashboard-icon dashboard-icon-drawn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{art}</svg>;
  }
  return <span aria-hidden="true" className="dashboard-icon" style={{ backgroundPosition: `${-(icons[name] ?? icons.Home) * .4}px -16px` }} />;
}
// Left-hand navigation. "Home" is presented to people as Dashboard; it also
// replaces the old Quick Actions entry, which now lives on as the Notifications
// card and its bell in the top bar. Today remains an internal page for now but
// is not a left-navigation entry.
export const dashboardSections: DashboardSection[] = ['Home', 'Calendar', 'Health', 'Family', 'Mail', 'Work', 'Projects', 'News', 'System'];
// The card set and the order the dashboard falls back to when Athena has not
// ranked it. Ids are shared with services/dashboardPriority.js in core_api —
// changing one means changing both.
const DEFAULT_CARD_ORDER = ['calendar', 'health', 'family', 'mail', 'work', 'news', 'projects', 'notifications'];
// The first row holds three cards; whatever ranks below them drops to the second.
const PRIMARY_SLOTS = 3;
/**
 * The connectors each card is made of, for the cards that are made of nothing
 * else. When none of them is linked the card has no subject, so it leaves the
 * briefing rather than sitting there advertising three apps.
 *
 * Family, Projects and Notifications are deliberately absent: they still have
 * memories, saved goals and approvals to show when every connector is dark.
 */
const CARD_SOURCES: Partial<Record<string, (keyof DashboardSummary)[]>> = {
  calendar: ['calendar'],
  health: ['recovery', 'sleep', 'strain', 'activity'],
  mail: ['emailTriage'],
  work: ['jira', 'slack'],
};
const statusText = { not_connected: 'Not connected', needs_reauth: 'Reconnect to refresh', consent_required: 'Health consent required', error: 'Couldn’t load this source', ready: 'Connected' };
/**
 * Why a card is quiet about something.
 *
 * A source nobody has linked is not news: it says nothing about today and
 * there is nothing to do about it here, so a briefing stays silent on it. The
 * section page still names it, with the button that connects it. Everything
 * else — a link that expired, consent not given, a provider erroring — is a
 * fact about the data in front of the person and is still said out loud.
 */
function SourceNote({ source, name }: { source?: Source<unknown>; name: string }) {
  if (source?.status === 'not_connected') return null;
  return <><p className="source-note">{name} · {source ? statusText[source.status] : 'Loading…'}</p>
    {source?.detail && <p className="source-note source-detail">{source.detail}</p>}</>;
}
/** A labelled run of card rows that is simply absent when nothing is linked. */
function SourceBlock({ source, label, name, children }: { source?: Source<unknown>; label: string; name: string; children: ReactNode }) {
  if (source?.status === 'not_connected') return null;
  return <><p className="source-note">{label}</p>{source?.status === 'ready' ? children : <SourceNote source={source} name={name} />}</>;
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
function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'ok' | 'low' | 'idle' }) {
  return <div className={`stat-tile${tone ? ` stat-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function Panel({ title, note, children, wide }: { title: string; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <section className={`section-panel${wide ? ' section-panel-wide' : ''}`}><header><h2>{title}</h2>{note && <span>{note}</span>}</header>{children}</section>;
}
/**
 * A source that cannot be read is the whole answer for its panel, so it is
 * stated in the panel rather than whispered under it — and, where the person
 * can actually fix it, it comes with the button that does.
 */
function Unavailable({ source, name, onPanel }: { source?: Source<unknown>; name: string; onPanel?: () => void }) {
  const status = source?.status;
  const fixable = status === 'not_connected' || status === 'needs_reauth' || status === 'consent_required';
  return <div className="section-unavailable">
    <p className="dashboard-empty">{name} · {source ? statusText[status!] : 'Loading…'}</p>
    {/* What the provider actually said. A card that cannot be read is only
        actionable if it says why — "reconnect" is the wrong advice for an API
        that was never enabled, and the person has no way to tell them apart. */}
    {source?.detail && <p className="dashboard-empty source-detail">{source.detail}</p>}
    {fixable && onPanel && <button className="dashboard-chat-cta" onClick={onPanel}>{status === 'not_connected' ? 'Connect it' : 'Fix this'} <span>↗</span></button>}
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
interface SectionContext {
  onAsk: (text: string) => void;
  onPanel: (panel: 'integrations' | 'memory' | 'actions' | 'photo' | 'devices') => void;
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
function SectionPage({ eyebrow, title, blurb, stats, children, ask, ctx }: {
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

function SystemPage({ ctx }: { ctx: SectionContext }) {
  const [billing, setBilling] = useState<TwilioBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void dashboardApi.systemTwilio().then(value => {
      if (alive) { setBilling(value); setLoading(false); }
    }).catch(err => {
      if (alive) { setBilling(null); setError((err as Error).message || 'Unavailable'); setLoading(false); }
    });
    return () => { alive = false; };
  }, []);
  const unavailable = error || (billing && !billing.configured ? 'Twilio is not configured on this Athena system.' : null);
  const balance = billing?.balance?.amount && billing.balance.currency ? `${billing.balance.currency} ${billing.balance.amount}` : '—';
  return <SectionPage ctx={ctx}
    eyebrow="ATHENA SYSTEM" title="System" blurb="A small, live view of the Twilio service Athena uses to reach you."
    ask="What should I know about the Athena system right now?"
    stats={<>
      <Stat label="Twilio balance" value={loading ? '…' : balance} note={billing?.balance?.currency ? 'Current account balance' : 'No balance returned'} tone={billing?.balance?.amount ? 'good' : 'idle'} />
      <Stat label="SMS messages sent" value={loading ? '…' : billing?.smsMessagesSent ?? '—'} note="This month" />
      <Stat label="SMS cost" value={loading ? '…' : billing?.smsCostThisMonth != null && billing?.balance?.currency ? `${billing.balance.currency} ${billing.smsCostThisMonth.toFixed(2)}` : '—'} note="This month" />
    </>}
  >
    <Panel title="Twilio" note="live account read" wide>
      {unavailable ? <div className="section-unavailable"><p className="dashboard-empty">{unavailable}</p><p className="source-detail">The system owner can check the Twilio credentials and account permissions.</p></div> : <div className="system-summary-grid"><div><span>Balance</span><strong>{balance}</strong></div><div><span>SMS messages sent · this month</span><strong>{loading ? '…' : billing?.smsMessagesSent ?? '—'}</strong></div><div><span>SMS cost · this month</span><strong>{loading ? '…' : billing?.smsCostThisMonth != null && billing?.balance?.currency ? `${billing.balance.currency} ${billing.smsCostThisMonth.toFixed(2)}` : '—'}</strong></div></div>}
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
 */
function readinessOf(today: RecoveryDay | undefined, prior: RecoveryDay[], sleepPercent: number | null): Readiness | null {
  if (!today || today.state !== 'SCORED') return null;
  const score = today.recovery_score;
  const baseRhr = average(prior, r => r.resting_heart_rate);
  const baseHrv = average(prior, r => r.hrv_ms);
  const rhrUp = baseRhr !== null && today.resting_heart_rate != null ? today.resting_heart_rate - baseRhr : null;
  const hrvOff = baseHrv !== null && today.hrv_ms != null ? (today.hrv_ms - baseHrv) / baseHrv : null;
  const lowOxygen = today.spo2_percent != null && today.spo2_percent < 95;

  const notes: string[] = [];
  if (rhrUp !== null && rhrUp >= 3) notes.push(`resting HR ${rhrUp.toFixed(1)} bpm over baseline`);
  if (hrvOff !== null && hrvOff <= -.15) notes.push(`HRV ${Math.round(-hrvOff * 100)}% under baseline`);
  if (lowOxygen) notes.push(`blood oxygen ${today.spo2_percent!.toFixed(1)}%`);
  if (sleepPercent !== null && sleepPercent < 60) notes.push(`slept ${sleepPercent}% of need`);
  const said = notes.length ? `${notes.join(' · ')}.` : '';

  if ((rhrUp !== null && rhrUp >= 4 && hrvOff !== null && hrvOff <= -.2) || lowOxygen) {
    return { level: 'warning', label: 'WARNING', headline: lowOxygen ? 'Blood oxygen is low' : 'Resting HR up while HRV is down', reason: `${said} Two signals moving the wrong way at once — this is often how a bug starts. Worth an easy day and an early night.` };
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
/** Athena's reason for ranking a card first, in the marker on the card head. */
const CardWhy = ({ why }: { why: string }) =>
  <Hint label="Why Athena put this card first" title="ATHENA PUT THIS FIRST" lines={[why]}
    glyph={'★'} className="card-why" noteClassName="card-why-note" />;

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
  onPanel: (panel: 'integrations' | 'memory' | 'actions' | 'photo' | 'devices') => void;
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
  const facts = data.facts.data || [];
  const family = facts.filter(f => /^(person|family|pet)$/i.test(f.category));
  const projects = facts.filter(f => /^(goal|project)$/i.test(f.category));
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
  const today = zonedDay(new Date(), timeZone);
  const todayEvents = events.filter(e => eventDay(e, timeZone) === today);
  const nextEvent = events.find(e => !e.allDay && new Date(e.start).getTime() > Date.now()) || todayEvents[0];
  const chores = summary?.familyChores.data?.chores || [];
  const choresDone = chores.filter(c => c.completed).length;
  const activities = summary?.activity.data?.activities || [];
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
    if (!ready(source)) return <SourceNote source={source} name="Google Calendar" />;
    return <><p className="source-note">Next 7 days · {source?.data?.timeZone}</p>{!events.length && <p className="dashboard-empty">No upcoming events in this window.</p>}<ul className="dashboard-data-list calendar-events">{events.slice(0, limit).map((event, index) => <li key={`${event.id}-${index}`}><span className="event-dot" /><div><small>{event.allDay ? `${dateLabel(`${event.start}T12:00:00Z`, { timeZone: 'UTC' })} · All day` : `${dateLabel(event.start, { timeZone })} · ${eventTime(event, timeZone)}`}</small><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.shared && <small>{event.calendar}</small>}</div></li>)}</ul></>;
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
  function healthBody() {
    return <><div className="recovery-preview"><RecoveryRing score={recovery?.recovery_score} />
      <p>{readiness ? <span className={`readiness readiness-${readiness.level}`}>{readiness.label}</span> : 'Latest recovery'}<small>{recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'}</small></p></div>
      {readiness && <p className="readiness-reason">{readiness.reason}</p>}
      <div className="health-metrics">{heartMetrics()}</div>
      {(['recovery', 'sleep', 'strain'] as const).map(key => !ready(summary?.[key]) && <SourceNote key={key} source={summary?.[key]} name={`WHOOP ${key}`} />)}
      <SourceBlock source={summary?.activity} label="Strava · last 7 days" name="Strava">
        {activities.slice(0, 2).map((a, i) => <p className="activity-line" key={i}>{a.name} · {a.distance_mi} mi <small>{dateLabel(a.start)}</small></p>)}
        {!activities.length && <p className="dashboard-empty">No recent activities.</p>}
      </SourceBlock></>;
  }
  function workBody(limit: number) {
    return <>
      <SourceBlock source={summary?.jira} label="Jira · assigned open issues" name="Jira">
        {!issues.length && <p className="dashboard-empty">No assigned open issues returned.</p>}<Issues issues={issues.slice(0, limit)} />{summary?.jira.data?.partial && <p className="source-note">Some sites could not be included.</p>}
      </SourceBlock>
      <SourceBlock source={summary?.slack} label="Slack · recent mentions" name="Slack">
        <ul className="dashboard-data-list">{summary?.slack.data?.messages.slice(0, limit).map(m => <li key={m.timestamp}><ExternalLink url={m.url}><strong>#{m.channel}</strong><small>{m.text}</small></ExternalLink></li>)}</ul>{!summary?.slack.data?.messages.length && <p className="dashboard-empty">No mentions returned in the last 7 days.</p>}
      </SourceBlock></>;
  }
  function emailPreviewLine(email: TriageEmail) {
    const who = email.from_name || email.from_address || 'Unknown sender';
    return <li key={email.uuid}><button className="dashboard-link-row" onClick={() => setSelectedEmail(email.uuid)}><strong>{email.subject || '(no subject)'}</strong><small>{who} · {CATEGORY_LABEL[email.category]}</small></button></li>;
  }
  function mailBody(limit: number) {
    const source = summary?.emailTriage;
    if (!ready(source)) return <SourceNote source={source} name="Mail" />;
    const preview = source?.data?.preview || [];
    return <><p className="source-note">{source?.data?.newCount || 0} to review · receipts, travel, school</p>
      {!preview.length && <p className="dashboard-empty">Nothing new to sort — try Scan more from the Mail page.</p>}
      <ul className="dashboard-data-list">{preview.slice(0, limit).map(emailPreviewLine)}</ul></>;
  }
  function newsBody(limit: number) {
    const failing = newsSources.filter(s => s.lastError);
    return <>{data.news.loading && <p className="source-note">Loading what I’ve read…</p>}{data.news.error && <p className="source-note" role="status">News couldn’t load. Retry or check source setup.</p>}{data.news.data && !newsSources.length && <p className="dashboard-empty">Paste a news page and I’ll start reading it for you.</p>}{failing.map(s => <p key={s.uuid} className="source-note">Couldn’t read {s.host} last time. {s.lastError}</p>)}<ul className="dashboard-data-list">{news.slice(0, limit).map((n, i) => <li key={`${n.url}-${i}`}><ExternalLink url={n.url}><strong>{n.title}</strong><small>{n.source} · {dateLabel(n.firstSeen)}</small></ExternalLink></li>)}</ul>{data.news.data && newsSources.length > 0 && !news.length && <p className="dashboard-empty">Nothing new on these pages yet — I’ll keep looking.</p>}</>;
  }
  // A card built entirely from connectors nobody has linked yet.
  const unlinked = (id: string) => {
    const keys = CARD_SOURCES[id];
    return !!keys && !!summary && keys.every(key => summary[key]?.status === 'not_connected');
  };
  // Athena's ordering, made safe to render from: every card exactly once, in
  // her order where she gave one and the declared order where she did not.
  const ranked = (() => {
    const seen = new Set<string>();
    const out: { id: string; why: string | null }[] = [];
    for (const entry of data.priority?.source === 'athena' ? data.priority.order : []) {
      if (!DEFAULT_CARD_ORDER.includes(entry.id) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({ id: entry.id, why: entry.why });
    }
    for (const id of DEFAULT_CARD_ORDER) if (!seen.has(id)) out.push({ id, why: null });
    return out.filter(entry => !unlinked(entry.id));
  })();
  function card(id: string, name: string, title: string, body: ReactNode, action: string, click: () => void, count?: number) {
    const rank = ranked.findIndex(entry => entry.id === id);
    const why = ranked[rank]?.why || null;
    const lead = rank === 0 && !!why;
    return <article className={`dashboard-card card-${id}${lead ? ' card-lead' : ''}`} id={`dashboard-${name.toLowerCase()}`} key={id}>
      <div className="dashboard-card-head">
        <button className="dashboard-card-heading" onClick={click} title={why || undefined}><DashboardIcon name={name} /><h2>{title}</h2>{count !== undefined && <span className="card-count">{count}</span>}</button>
        {/* Only the card she put first says why. Seven explanations is not a
            ranking, it is a second dashboard on top of the one being read. */}
        {lead && why && <CardWhy why={why} />}
        <button className="dashboard-card-chevron" onClick={click} aria-label={`Open ${title}`}>›</button>
      </div>
      <div className="dashboard-card-body">{body}</div>
      <button className="dashboard-card-action" onClick={click}>{action}<span>↗</span></button>
    </article>;
  }
  const cards: Record<string, ReactNode> = {
    // Every card now opens its own page, including when its source is down:
    // the page says what is wrong and carries the button that fixes it, which
    // is more use than dropping someone straight into the settings panel.
    calendar: card('calendar', 'Calendar', 'Calendar', calendarBody(3), 'View schedule', go('Calendar'), summary?.calendar.data?.events.length),
    health: card('health', 'Health', 'Health & Performance', healthBody(), 'View health', go('Health')),
    family: card('family', 'Family', 'Family', <><p className="source-note">From your memories</p>{data.facts.error ? <p className="dashboard-empty">Memories couldn’t load.</p> : data.facts.loading ? <p className="dashboard-empty">Loading memories…</p> : family.length ? <Facts facts={family.slice(0, 3)} /> : <p className="dashboard-empty">No family memories saved yet.</p>}<SourceBlock source={summary?.familyChores} label="Family Chores · today" name="Family Chores"><ul className="dashboard-data-list">{chores.slice(0, 3).map((c, i) => <li key={i}><strong>{c.completed ? '✓' : '○'} {c.title}</strong><small>{c.completed ? 'Completed' : c.status || 'Open'}</small></li>)}</ul>{!chores.length && <p className="dashboard-empty">No chores returned for today.</p>}</SourceBlock></>, 'View family', go('Family')),
    mail: card('mail', 'Mail', 'Mail', mailBody(3), 'Review inbox', go('Mail'), summary?.emailTriage.data?.newCount),
    work: card('work', 'Work', 'Work', workBody(1), 'View work', go('Work')),
    news: card('news', 'News', 'News & Updates', newsBody(3), 'View news', go('News'), news.length || undefined),
    projects: card('projects', 'Projects', 'Projects', <><SourceBlock source={summary?.jira} label="Jira projects · your assigned issues" name="Jira">{issues.length ? <ul className="dashboard-data-list">{[...new Set(issues.map(i => i.project))].slice(0, 3).map(project => <li key={project}><strong>{project}</strong><small>{issues.filter(i => i.project === project).length} assigned issues in this snapshot</small></li>)}</ul> : <p className="dashboard-empty">No assigned issues in this snapshot.</p>}</SourceBlock><p className="source-note">Saved goals</p>{projects.length ? <Facts facts={projects.slice(0, 2)} /> : <p className="dashboard-empty">{data.facts.error ? 'Memories unavailable.' : 'No saved goals yet.'}</p>}</>, 'View projects', go('Projects')),
    notifications: card('notifications', 'Notifications', 'Notifications', <>{data.actions.loading ? <p className="dashboard-empty">Checking approvals…</p> : data.actions.error ? <p className="dashboard-empty">Approvals couldn’t load.</p> : pending.length ? <ul className="dashboard-data-list">{pending.slice(0, 3).map(a => <li key={a.uuid}><strong>{a.label}</strong><small>{a.summary}</small></li>)}</ul> : <p className="dashboard-empty">Nothing waiting for your approval.</p>}<p className="source-note">You decide what happens next.</p></>, 'Review actions', () => onPanel('actions'), data.actions.data ? pending.length : undefined),
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
        {!ready(summary?.calendar) ? <Unavailable source={summary?.calendar} name="Google Calendar" onPanel={() => onPanel('integrations')} />
          : !todayEvents.length ? <p className="dashboard-empty">Nothing on the calendar for today.</p>
            : <ul className="dashboard-data-list calendar-events">{todayEvents.map((event, i) => <li key={`${event.id}-${i}`}><span className="event-dot" /><div><small>{eventTime(event, timeZone)}</small><strong>{event.title}</strong>{event.location && <small>{event.location}</small>}{event.shared && <small>{event.calendar}</small>}</div></li>)}</ul>}
      </Panel>
      <Panel title="Waiting on you" note={pending.length ? `${pending.length} open` : undefined}>
        {data.actions.loading ? <p className="dashboard-empty">Checking approvals…</p>
          : data.actions.error ? <p className="dashboard-empty">Approvals couldn’t load.</p>
            : pending.length ? <><ul className="dashboard-data-list">{pending.map(a => <li key={a.uuid}><strong>{a.label}</strong><small>{a.summary}</small></li>)}</ul><button className="dashboard-chat-cta" onClick={() => onPanel('actions')}>Review them <span>↗</span></button></>
              : <p className="dashboard-empty">Nothing waiting for your approval.</p>}
      </Panel>
      <Panel title="Chores today" note={summary?.familyChores.data?.name}>
        {!ready(summary?.familyChores) ? <Unavailable source={summary?.familyChores} name="Family Chores" onPanel={() => onPanel('integrations')} />
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
        {!ready(summary?.calendar) ? <Unavailable source={summary?.calendar} name="Google Calendar" onPanel={() => onPanel('integrations')} />
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
      blurb="A week of WHOOP recovery, sleep and strain, and what you did with it — read against the fortnight behind it, so a number that moved says so."
      ask="Help me review my WHOOP recovery, heart rate, HRV and sleep. Am I trending the right way?"
      stats={<>
        <Stat label="Today" value={readiness ? readiness.label : '—'} note={readiness ? readiness.headline : 'No scored recovery to judge'} tone={readiness?.level === 'go' ? 'good' : readiness?.level === 'rest' ? 'ok' : readiness?.level === 'warning' ? 'low' : 'idle'} />
        <Stat label="Recovery" value={recovery?.recovery_score ?? '—'} note={recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'} tone={recovery?.recovery_score == null ? 'idle' : recovery.recovery_score >= 67 ? 'good' : recovery.recovery_score >= 34 ? 'ok' : 'low'} />
        <Stat label="Sleep" value={sleep ? hoursMinutes(sleep.hours_asleep) : '—'} note={sleep?.sleep_performance_percent != null ? `${sleep.sleep_performance_percent}% of need` : 'No sleep recorded'} />
        <Stat label="Day strain" value={strain?.day_strain != null ? strain.day_strain.toFixed(1) : '—'} note={strain ? dateLabel(`${strain.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No strain recorded'} />
        <Stat label="Activities" value={activities.length} note="logged in the last 7 days" />
      </>}
    >
      <Panel title="Heart" note={`goals · ${HEART_GOALS.restingHeartRate} bpm resting, ${HEART_GOALS.hrvMs} ms HRV`} wide>
        {ready(summary?.recovery) ? <div className="health-metrics health-metrics-wide">{heartMetrics(true)}</div>
          : <Unavailable source={summary?.recovery} name="WHOOP recovery" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Resting heart rate" note={`45–75 bpm · line is your ${HEART_GOALS.restingHeartRate} goal`}>
        {ready(summary?.recovery) ? <Trend rows={rhrWeek} min={45} max={75} goal={HEART_GOALS.restingHeartRate} unit="resting beats per minute" neutral /> : <Unavailable source={summary?.recovery} name="WHOOP recovery" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="HRV" note={`20–90 ms · line is your ${HEART_GOALS.hrvMs} goal`}>
        {ready(summary?.recovery) ? <Trend rows={hrvWeek} min={20} max={90} goal={HEART_GOALS.hrvMs} unit="milliseconds of heart rate variability" neutral /> : <Unavailable source={summary?.recovery} name="WHOOP recovery" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Average heart rate" note="50–90 bpm · whole day">
        {ready(summary?.strain) ? <Trend rows={avgHrWeek} min={50} max={90} unit="average beats per minute" neutral /> : <Unavailable source={summary?.strain} name="WHOOP strain" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Recovery" note="last 7 days · %">
        {ready(summary?.recovery) ? <Trend rows={recoveryWeek} max={100} unit="percent recovered" /> : <Unavailable source={summary?.recovery} name="WHOOP recovery" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Sleep" note="last 7 days · hours asleep">
        {ready(summary?.sleep) ? <Trend rows={sleepWeek} max={9} unit="hours asleep" format={v => hoursMinutes(v)} /> : <Unavailable source={summary?.sleep} name="WHOOP sleep" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Day strain" note="last 7 days · 0–21">
        {ready(summary?.strain) ? <Trend rows={strainWeek} max={21} unit="day strain" format={v => v.toFixed(1)} neutral /> : <Unavailable source={summary?.strain} name="WHOOP strain" onPanel={() => onPanel('integrations')} />}
      </Panel>
      <Panel title="Activities" note="Strava · last 7 days" wide>
        {!ready(summary?.activity) ? <Unavailable source={summary?.activity} name="Strava" onPanel={() => onPanel('integrations')} />
          : !activities.length ? <p className="dashboard-empty">No recent activities.</p>
            : <ul className="dashboard-data-list">{activities.map((a, i) => <li key={i}><strong>{a.name}</strong><small>{a.type} · {a.distance_mi} mi · {Math.round(a.moving_time_s / 60)} min · {dateLabel(a.start)}</small></li>)}</ul>}
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
      </>}
    >
      <Panel title="Chores today" note={summary?.familyChores.data?.name} wide>
        {!ready(summary?.familyChores) ? <Unavailable source={summary?.familyChores} name="Family Chores" onPanel={() => onPanel('integrations')} />
          : !chores.length ? <p className="dashboard-empty">No chores returned for today.</p>
            : <>
              <div className="progress-track" role="img" aria-label={`${choresDone} of ${chores.length} chores complete`}><span style={{ width: `${(choresDone / chores.length) * 100}%` }} /></div>
              <ul className="dashboard-data-list chore-list">{chores.map((c, i) => <li key={i} className={c.completed ? 'chore-done' : ''}><strong>{c.completed ? '✓' : '○'} {c.title}</strong><small>{c.completed ? 'Completed' : c.status || 'Open'}{c.dueDate ? ` · due ${dateLabel(c.dueDate)}` : ''}</small></li>)}</ul>
            </>}
      </Panel>
      <Panel title="People &amp; pets" note="from your memories" wide>
        {data.facts.error ? <p className="dashboard-empty">Memories couldn’t load.</p>
          : data.facts.loading ? <p className="dashboard-empty">Loading memories…</p>
            : family.length ? <><Facts facts={family} /><button className="dashboard-chat-cta" onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button></>
              : <><p className="dashboard-empty">No family memories saved yet. Tell Athena about them and she will keep them.</p><button className="dashboard-chat-cta" onClick={() => onAsk('Let me tell you about my family.')}>Tell her <span>↗</span></button></>}
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
        {!ready(summary?.jira) ? <Unavailable source={summary?.jira} name="Jira" onPanel={() => onPanel('integrations')} />
          : !issues.length ? <p className="dashboard-empty">No assigned open issues returned.</p>
            : byStatus.map(status => <div className="day-group" key={status}>
              <h3>{status} <span className="card-count">{issues.filter(i => i.status === status).length}</span></h3>
              <Issues issues={issues.filter(i => i.status === status)} />
            </div>)}
      </Panel>
      <Panel title="Slack" note={summary?.slack.data?.workspace}>
        {!ready(summary?.slack) ? <Unavailable source={summary?.slack} name="Slack" onPanel={() => onPanel('integrations')} />
          : !mentions.length ? <p className="dashboard-empty">No mentions returned in the last 7 days.</p>
            : <ul className="dashboard-data-list">{mentions.map(m => <li key={m.timestamp}><ExternalLink url={m.url}><strong>#{m.channel}</strong><small>{m.text}</small></ExternalLink></li>)}</ul>}
      </Panel>
      <Panel title="Saved work context" note="what Athena remembers" wide>
        {facts.filter(f => f.category === 'work').length ? <Facts facts={facts.filter(f => f.category === 'work')} /> : <p className="dashboard-empty">Nothing saved about your work yet.</p>}
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
    return <>
    <SectionPage ctx={ctx}
      eyebrow="SORTING YOUR INBOX" title="Mail"
      blurb="Receipts, travel and school emails Athena has sorted out of your inbox. Nothing moves, gets labeled or logged until you approve it."
      ask="Help me get through my mail triage list."
      stats={<>
        <Stat label="New to review" value={summary?.emailTriage.data?.newCount ?? '—'} note="waiting for you" />
        <Stat label="Receipts" value={summary?.emailTriage.data?.receiptCount ?? '—'} note="ready to file and log" />
        <Stat label="Travel" value={summary?.emailTriage.data?.travelCount ?? '—'} note="may need a calendar event" />
        <Stat label="School" value={summary?.emailTriage.data?.schoolCount ?? '—'} note="may need a calendar event" />
      </>}
    >
      <Panel title="Your inbox" note={mailLoading ? 'Loading…' : `${mailItems.length} to review`} wide>
        {!ready(summary?.emailTriage) ? <Unavailable source={summary?.emailTriage} name="Gmail" onPanel={() => onPanel('integrations')} /> : <>
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
    {selectedEmail && <EmailPanel uuid={selectedEmail} onClose={() => setSelectedEmail(null)} onChanged={() => { setMailRefresh(n => n + 1); void data.refresh(); }} />}
    </>;
  }

  function ProjectsPage() {
    const names = [...new Set(issues.map(i => i.project))];
    return <SectionPage ctx={ctx}
      eyebrow="WHAT YOU ARE BUILDING" title="Projects"
      blurb="Your Jira projects alongside the goals Athena is holding on to for you."
      ask="What do you remember about my projects? Help me choose a next step."
      stats={<>
        <Stat label="Projects" value={ready(summary?.jira) ? names.length : '—'} note="with issues assigned to you" />
        <Stat label="Open issues" value={ready(summary?.jira) ? issues.length : '—'} note="across all projects" />
        <Stat label="Saved goals" value={projects.length} note="held in memory" />
      </>}
    >
      <Panel title="Jira projects" note="your assigned issues" wide>
        {!ready(summary?.jira) ? <Unavailable source={summary?.jira} name="Jira" onPanel={() => onPanel('integrations')} />
          : !names.length ? <p className="dashboard-empty">No assigned open issues returned.</p>
            : names.map(project => <div className="day-group" key={project}>
              <h3>{project} <span className="card-count">{issues.filter(i => i.project === project).length}</span></h3>
              <Issues issues={issues.filter(i => i.project === project)} />
            </div>)}
      </Panel>
      <Panel title="Goals" note="saved in memory" wide>
        {data.facts.error ? <p className="dashboard-empty">Memories unavailable.</p>
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
          : data.news.error ? <p className="dashboard-empty" role="status">News couldn’t load. Retry or check source setup.</p>
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
    if (section === 'Mail') return MailPage();
    if (section === 'Work') return WorkPage();
    if (section === 'Projects') return ProjectsPage();
    if (section === 'News') return NewsPage();
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
    <RightNowCard
      data={data.rightNow.data} loading={data.rightNow.loading} error={data.rightNow.error}
      onAsk={onAsk} onManage={() => setPlansOpen(true)}
    />
    <div className="dashboard-grid">{ranked.slice(0, PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    <div className="dashboard-secondary">{ranked.slice(PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>Whatever’s on your mind,<br />you don’t have to carry it alone.</h2><button className="dashboard-chat-cta" onClick={() => onAsk('')}>Let’s talk <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button><button onClick={() => onPanel('photo')}>Share a moment <span>↗</span></button><button onClick={() => onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => setSourcesOpen(true)}>News sources <span>↗</span></button><button onClick={() => setPlansOpen(true)}>Places &amp; projects <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {compact && <button className="dashboard-chat-cta" onClick={onExpand}>Open full dashboard ↗</button>}
    {sourcesOpen && <NewsSourcesPanel onClose={() => setSourcesOpen(false)} onSaved={() => void data.refresh()} />}
    {plansOpen && <PlansPanel onClose={() => setPlansOpen(false)} onSaved={() => void data.refresh()} />}
    {selectedEmail && <EmailPanel uuid={selectedEmail} onClose={() => setSelectedEmail(null)} onChanged={() => { setMailRefresh(n => n + 1); void data.refresh(); }} />}
  </main>;
}
