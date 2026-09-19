import { useState, type ReactNode } from 'react';
import type { CalendarEvent, Source, JiraIssue } from '../api/dashboard';
import type { Fact } from '../api/companion';
import { useDashboardData } from './useDashboardData';
import { NewsSourcesPanel } from './NewsSourcesPanel';

export type DashboardSection = 'Home' | 'Today' | 'Calendar' | 'Health' | 'Family' | 'Work' | 'Projects' | 'News';
// Explicit sprite windows preserve the borders on this irregular sheet. Today
// uses the supplied calendar tile so it has the same framed treatment as the
// other navigation links; the page itself remains distinct from Calendar.
const icons: Record<string, number> = { Home: 24, Today: 130, Calendar: 130, Health: 235, Family: 339, Work: 444, Projects: 551, News: 658, 'Quick Actions': 761, Search: 862, Chat: 970, More: 1075, Settings: 1183 };
// Icons the supplied sheet has no window for, drawn to sit in the same box.
const drawn: Record<string, ReactNode> = {
  Notifications: <><path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.5 5.6-1.5 5.6h13.8s-1.5-1.4-1.5-5.6A5.4 5.4 0 0 0 12 3.6Z" /><path d="M10.4 18a1.8 1.8 0 0 0 3.2 0" /></>,
};
export function DashboardIcon({ name }: { name: string }) {
  const art = drawn[name];
  if (art) {
    return <svg aria-hidden="true" className="dashboard-icon dashboard-icon-drawn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{art}</svg>;
  }
  return <span aria-hidden="true" className="dashboard-icon" style={{ backgroundPosition: `${-(icons[name] ?? icons.Home) * .4}px -16px` }} />;
}
// Left-hand navigation. "Home" replaces the old Quick Actions entry, which
// now lives on as the Notifications card and its bell in the top bar.
export const dashboardSections: DashboardSection[] = ['Home', 'Today', 'Calendar', 'Health', 'Family', 'Work', 'Projects', 'News'];
// The card set and the order the dashboard falls back to when Athena has not
// ranked it. Ids are shared with services/dashboardPriority.js in core_api —
// changing one means changing both.
const DEFAULT_CARD_ORDER = ['calendar', 'health', 'family', 'work', 'news', 'projects', 'notifications'];
// The first row holds four cards; whatever ranks below them drops to the second.
const PRIMARY_SLOTS = 4;
const statusText = { not_connected: 'Not connected', needs_reauth: 'Reconnect to refresh', consent_required: 'Health consent required', error: 'Couldn’t load this source', ready: 'Connected' };
function SourceNote({ source, name }: { source?: Source<unknown>; name: string }) {
  return <><p className="source-note">{name} · {source ? statusText[source.status] : 'Loading…'}</p>
    {source?.detail && <p className="source-note source-detail">{source.detail}</p>}</>;
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
function Trend({ rows, max, unit, format, neutral }: { rows: { date: string; value: number | null }[]; max: number; unit: string; format?: (value: number) => string; neutral?: boolean }) {
  if (!rows.some(row => row.value !== null)) return <p className="dashboard-empty">No scored days in this window.</p>;
  return <ul className="trend-bars" aria-label={`Last ${rows.length} days, ${unit}`}>{rows.map(row => {
    const pct = row.value === null ? 0 : Math.max(4, Math.min(100, (row.value / max) * 100));
    const tone = row.value === null ? 'idle' : neutral ? 'plain' : row.value / max >= .66 ? 'good' : row.value / max >= .34 ? 'ok' : 'low';
    return <li key={row.date}>
      <b>{row.value === null ? '—' : format ? format(row.value) : Math.round(row.value)}</b>
      <span className="trend-track"><span className={`trend-bar trend-${tone}`} style={{ height: `${pct}%` }} /></span>
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

export function Dashboard({ section = 'Home', firstName, onAsk, onPanel, onNavigate, compact = false, onExpand }: {
  section?: DashboardSection;
  firstName: string; onAsk: (text: string) => void;
  onPanel: (panel: 'integrations' | 'memory' | 'actions' | 'photo' | 'devices') => void;
  onNavigate?: (section: DashboardSection) => void;
  compact?: boolean; onExpand?: () => void;
}) {
  const data = useDashboardData();
  const summary = data.summary.data;
  const [sourcesOpen, setSourcesOpen] = useState(false);
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
  const recovery = latest(summary?.recovery.data?.filter(r => r.state === 'SCORED'));
  const sleep = latest(summary?.sleep.data?.filter(s => !s.nap));
  const strain = latest(summary?.strain.data);
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
  function healthBody() {
    return <><div className="recovery-preview"><div className={`recovery-ring ${recovery?.recovery_score != null ? 'has-score' : ''}`}><span>{recovery?.recovery_score ?? '—'}</span><small>RECOVERY %</small></div><p>Latest recovery<small>{recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'}</small></p></div>
      <div className="health-metrics"><div><span>Sleep</span><strong>{sleep && sleep.sleep_performance_percent !== null ? hoursMinutes(sleep.hours_asleep) : '—'}</strong><small>{sleep?.date}</small></div><div><span>Day strain</span><strong>{strain?.day_strain ?? '—'}</strong><small>{strain?.date}</small></div></div>
      {(['recovery', 'sleep', 'strain'] as const).map(key => !ready(summary?.[key]) && <SourceNote key={key} source={summary?.[key]} name={`WHOOP ${key}`} />)}
      {ready(summary?.activity) ? <><p className="source-note">Strava · last 7 days</p>{activities.slice(0, 2).map((a, i) => <p className="activity-line" key={i}>{a.name} · {a.distance_mi} mi <small>{dateLabel(a.start)}</small></p>)}{!activities.length && <p className="dashboard-empty">No recent activities.</p>}</> : <SourceNote source={summary?.activity} name="Strava" />}</>;
  }
  function workBody(limit: number) {
    return <><p className="source-note">Jira · assigned open issues</p>{ready(summary?.jira) ? <>{!issues.length && <p className="dashboard-empty">No assigned open issues returned.</p>}<Issues issues={issues.slice(0, limit)} />{summary?.jira.data?.partial && <p className="source-note">Some sites could not be included.</p>}</> : <SourceNote source={summary?.jira} name="Jira" />}
      <p className="source-note">Gmail · {summary?.gmail.data?.account || 'work inbox'}</p>{ready(summary?.gmail) ? <><ul className="dashboard-data-list">{summary?.gmail.data?.messages.slice(0, limit).map(m => <li key={m.id}><ExternalLink url={m.url}><strong>{m.title}</strong><small>{m.from}</small></ExternalLink></li>)}</ul>{!summary?.gmail.data?.messages.length && <p className="dashboard-empty">No unread inbox messages.</p>}</> : <SourceNote source={summary?.gmail} name="Gmail" />}
      <p className="source-note">Slack · recent mentions</p>{ready(summary?.slack) ? <><ul className="dashboard-data-list">{summary?.slack.data?.messages.slice(0, limit).map(m => <li key={m.timestamp}><ExternalLink url={m.url}><strong>#{m.channel}</strong><small>{m.text}</small></ExternalLink></li>)}</ul>{!summary?.slack.data?.messages.length && <p className="dashboard-empty">No mentions returned in the last 7 days.</p>}</> : <SourceNote source={summary?.slack} name="Slack" />}</>;
  }
  function newsBody(limit: number) {
    const failing = newsSources.filter(s => s.lastError);
    return <>{data.news.loading && <p className="source-note">Loading what I’ve read…</p>}{data.news.error && <p className="source-note" role="status">News couldn’t load. Retry or check source setup.</p>}{data.news.data && !newsSources.length && <p className="dashboard-empty">Paste a news page and I’ll start reading it for you.</p>}{failing.map(s => <p key={s.uuid} className="source-note">Couldn’t read {s.host} last time. {s.lastError}</p>)}<ul className="dashboard-data-list">{news.slice(0, limit).map((n, i) => <li key={`${n.url}-${i}`}><ExternalLink url={n.url}><strong>{n.title}</strong><small>{n.source} · {dateLabel(n.firstSeen)}</small></ExternalLink></li>)}</ul>{data.news.data && newsSources.length > 0 && !news.length && <p className="dashboard-empty">Nothing new on these pages yet — I’ll keep looking.</p>}</>;
  }
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
    return out;
  })();
  function card(id: string, name: string, title: string, body: ReactNode, action: string, click: () => void, count?: number) {
    const rank = ranked.findIndex(entry => entry.id === id);
    const why = ranked[rank]?.why || null;
    const lead = rank === 0 && !!why;
    return <article className={`dashboard-card card-${id}${lead ? ' card-lead' : ''}`} id={`dashboard-${name.toLowerCase()}`} key={id}>
      <button className="dashboard-card-heading" onClick={click} title={why || undefined}><DashboardIcon name={name} /><h2>{title}</h2>{count !== undefined && <span className="card-count">{count}</span>}<span>›</span></button>
      {/* Only the card she put first says why. Seven explanations is not a
          ranking, it is a second dashboard on top of the one being read. */}
      {lead && <p className="card-why"><span className="dashboard-eyebrow">ATHENA PUT THIS FIRST</span>{why}</p>}
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
    family: card('family', 'Family', 'Family', <><p className="source-note">From your memories</p>{data.facts.error ? <p className="dashboard-empty">Memories couldn’t load.</p> : data.facts.loading ? <p className="dashboard-empty">Loading memories…</p> : family.length ? <Facts facts={family.slice(0, 3)} /> : <p className="dashboard-empty">No family memories saved yet.</p>}<p className="source-note">Family Chores · today</p>{ready(summary?.familyChores) ? <><ul className="dashboard-data-list">{chores.slice(0, 3).map((c, i) => <li key={i}><strong>{c.completed ? '✓' : '○'} {c.title}</strong><small>{c.completed ? 'Completed' : c.status || 'Open'}</small></li>)}</ul>{!chores.length && <p className="dashboard-empty">No chores returned for today.</p>}</> : <SourceNote source={summary?.familyChores} name="Family Chores" />}</>, 'View family', go('Family')),
    work: card('work', 'Work', 'Work', workBody(1), 'View work', go('Work')),
    news: card('news', 'News', 'News & Updates', newsBody(3), 'View news', go('News'), news.length || undefined),
    projects: card('projects', 'Projects', 'Projects', <><p className="source-note">Jira projects · your assigned issues</p>{issues.length ? <ul className="dashboard-data-list">{[...new Set(issues.map(i => i.project))].slice(0, 3).map(project => <li key={project}><strong>{project}</strong><small>{issues.filter(i => i.project === project).length} assigned issues in this snapshot</small></li>)}</ul> : <SourceNote source={summary?.jira} name="Jira" />}<p className="source-note">Saved goals</p>{projects.length ? <Facts facts={projects.slice(0, 2)} /> : <p className="dashboard-empty">{data.facts.error ? 'Memories unavailable.' : 'No saved goals yet.'}</p>}</>, 'View projects', go('Projects')),
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
        <Stat label="Recovery" value={recovery?.recovery_score ?? '—'} note={recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'} tone={recovery?.recovery_score == null ? 'idle' : recovery.recovery_score >= 67 ? 'good' : recovery.recovery_score >= 34 ? 'ok' : 'low'} />
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
    return <SectionPage ctx={ctx}
      eyebrow="HOW YOUR BODY IS DOING" title="Health & Performance"
      blurb="A week of WHOOP recovery, sleep and strain, and what you did with it."
      ask="Help me review my WHOOP recovery, sleep and Strava activities."
      stats={<>
        <Stat label="Recovery" value={recovery?.recovery_score ?? '—'} note={recovery ? dateLabel(`${recovery.date}T12:00:00Z`, { timeZone: 'UTC' }) : 'No scored result'} tone={recovery?.recovery_score == null ? 'idle' : recovery.recovery_score >= 67 ? 'good' : recovery.recovery_score >= 34 ? 'ok' : 'low'} />
        <Stat label="Sleep" value={sleep ? hoursMinutes(sleep.hours_asleep) : '—'} note={sleep?.sleep_performance_percent != null ? `${sleep.sleep_performance_percent}% of need` : 'No sleep recorded'} />
        <Stat label="Day strain" value={strain?.day_strain ?? '—'} note={strain?.date || 'No strain recorded'} />
        <Stat label="Activities" value={activities.length} note="logged in the last 7 days" />
      </>}
    >
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
    const mail = summary?.gmail.data?.messages || [];
    const mentions = summary?.slack.data?.messages || [];
    const byStatus = [...new Set(issues.map(i => i.status))];
    return <SectionPage ctx={ctx}
      eyebrow="WHAT WORK IS ASKING FOR" title="Work"
      blurb="Assigned Jira issues, unread mail and the Slack threads that named you."
      ask="Help me review my Jira issues, Slack mentions and Gmail inbox."
      stats={<>
        <Stat label="Open issues" value={ready(summary?.jira) ? issues.length : '—'} note="assigned to you" />
        <Stat label="Unread mail" value={ready(summary?.gmail) ? mail.length : '—'} note={summary?.gmail.data?.account || 'Gmail not connected'} />
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
      <Panel title="Inbox" note={summary?.gmail.data?.account}>
        {!ready(summary?.gmail) ? <Unavailable source={summary?.gmail} name="Gmail" onPanel={() => onPanel('integrations')} />
          : !mail.length ? <p className="dashboard-empty">No unread inbox messages.</p>
            : <ul className="dashboard-data-list">{mail.map(m => <li key={m.id}><ExternalLink url={m.url}><strong>{m.title}</strong><small>{m.from} · {dateLabel(m.date)}</small></ExternalLink></li>)}</ul>}
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
    if (section === 'Work') return WorkPage();
    if (section === 'Projects') return ProjectsPage();
    if (section === 'News') return NewsPage();
  }

  return <main className={`dashboard-content ${compact ? 'dashboard-compact' : ''}`}>
    <div className="dashboard-toolbar"><span className="dashboard-eyebrow">YOUR DAILY BRIEFING</span><time dateTime={new Date().toISOString()}>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time><button onClick={() => onAsk('')} className="ask-athena">ϟ <span>Ask Athena…</span> ↗</button></div>
    <section className="dashboard-greeting"><div><p className="dashboard-eyebrow">A NEW PERSPECTIVE, EVERY DAY</p><h1>{greeting}, {firstName}</h1><p>Here’s what’s on your radar today.</p></div><span className="dashboard-mantra">DISCIPLINE TODAY.<br />A WILDER TOMORROW.</span></section>
    {data.summary.error && <p className="dashboard-notice" role="status">Connected data is unavailable. {data.summary.error}</p>}
    <div className="dashboard-grid">{ranked.slice(0, PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    <div className="dashboard-secondary">{ranked.slice(PRIMARY_SLOTS).map(entry => cards[entry.id])}</div>
    <section className="dashboard-bottom"><div><span className="dashboard-eyebrow">A MOMENT WITH ATHENA</span><h2>Whatever’s on your mind,<br />you don’t have to carry it alone.</h2><button className="dashboard-chat-cta" onClick={() => onAsk('')}>Let’s talk <span>↗</span></button></div><div className="dashboard-utilities"><button onClick={() => onPanel('memory')}>Explore memories <span>↗</span></button><button onClick={() => onPanel('photo')}>Share a moment <span>↗</span></button><button onClick={() => onPanel('integrations')}>Connected apps <span>↗</span></button><button onClick={() => setSourcesOpen(true)}>News sources <span>↗</span></button></div></section>
    <footer className="dashboard-footer"><span><i /> YOUR SPACE. YOUR PACE.</span><span>LIVE · UPDATES ARRIVE ON THEIR OWN</span></footer>
    {compact && <button className="dashboard-chat-cta" onClick={onExpand}>Open full dashboard ↗</button>}
    {sourcesOpen && <NewsSourcesPanel onClose={() => setSourcesOpen(false)} onSaved={() => void data.refresh()} />}
  </main>;
}
