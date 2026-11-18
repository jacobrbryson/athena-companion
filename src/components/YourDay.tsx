import type { ReactNode } from 'react';
import type { CalendarEvent } from '../api/dashboard';
import { DashboardIcon } from './icons';
import { untilLabel } from './workStatus';
import './dayTasks.css';

/**
 * Home's "Your Day" card (owner mockup, 2026-11-17): today's counts across the
 * top, then a timeline of what's left — all-day events, what's on now, and
 * what's next. Every number is read from a source; one that can't be read
 * shows "—" rather than a guess.
 */

/** A glowing line under the card header; decoration only. */
export function CardWave() {
  return <svg className="dt-wave" viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="dt-wave-grad" x1="0" x2="1"><stop offset="0" stopColor="#39dcf8" stopOpacity="0" /><stop offset=".55" stopColor="#39dcf8" /><stop offset="1" stopColor="#39dcf8" stopOpacity="0" /></linearGradient></defs>
    <path d="M0 22 C40 22 60 10 100 14 S150 34 180 28 S220 12 240 14" fill="none" stroke="url(#dt-wave-grad)" strokeWidth="2.2" />
  </svg>;
}

/** The big framed icon at the top-left of each card. */
export function CardBadge({ icon, glyph, tone }: { icon: string; glyph?: ReactNode; tone?: 'violet' | 'rose' | 'green' }) {
  return <span className={`dt-badge${tone ? ` dt-badge-${tone}` : ''}`}>{glyph
    ? <svg className="dashboard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph}</svg>
    : <DashboardIcon name={icon} bare />}</span>;
}

export function CardHeader({ icon, glyph, tone, title, subtitle, action, actionArrow = '↗', onAction }: { icon: string; glyph?: ReactNode; tone?: 'violet' | 'rose' | 'green'; title: string; subtitle: ReactNode; action: string; actionArrow?: string; onAction: () => void }) {
  return <header className="dt-head">
    <button type="button" className="dt-head-title" onClick={onAction} aria-label={`${action}`}>
      <CardBadge icon={icon} glyph={glyph} tone={tone} />
      <span><h2>{title}</h2><small>{subtitle}</small></span>
    </button>
    <button type="button" className="dt-head-action" onClick={onAction}>{action} <span aria-hidden="true">{actionArrow}</span></button>
    <CardWave />
  </header>;
}

// --- Event glyphs -----------------------------------------------------------
const GLYPHS: Record<string, ReactNode> = {
  lab: <><path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 19l-5.5-9.5v-6" /><path d="M7.6 15h8.8" /></>,
  run: <><circle cx="14.5" cy="4.5" r="1.7" /><path d="m8 21 3-6 3 2.5V22M6 11.5l3-3 4 .5 2.5 3.5 3 1" /><path d="m11 15 1.5-6" /></>,
  ball: <><circle cx="12" cy="12" r="8.5" /><path d="m12 8 3.3 2.4-1.3 3.9h-4l-1.3-3.9L12 8ZM12 8V3.6M15.3 10.4l4-1.5M14 14.3l2.6 3.4M10 14.3l-2.6 3.4M8.7 10.4l-4-1.5" /></>,
  people: <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c0-3.2 2.5-5.4 5.5-5.4s5.5 2.2 5.5 5.4M14.5 14c3 0 6 1.6 6 5" /></>,
  video: <><rect x="3" y="7" width="12.5" height="10" rx="2" /><path d="m15.5 10.5 5.5-3v9l-5.5-3" /></>,
  place: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  plane: <path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4.5a2 2 0 0 1 3 3l-4.5 4 1 8L15.5 22 13 14.5l-3.5 3v2.5L8 21.5l-1-3-3-1L5.5 16H8l3.5-3.5" />,
  food: <><path d="M7.25 3v5M9.25 3v5M11.25 3v5M7.25 8a2 2 0 0 0 4 0M9.25 10v11" /><path d="M16.75 21V3c-1.8 1.2-2.8 3.6-2.8 6.6 0 1.9.9 3.2 2.8 3.4" /></>,
  health: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  cake: <><path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7ZM4 15.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M12 11V8" /><path d="M12 4.5c.8.8.8 1.8 0 2.5-.8-.7-.8-1.7 0-2.5Z" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3v4M15.5 3v4" /><path d="M8 14h2M14 14h2M8 17h2" /></>,
};

const GAME = /\b(game|games|match|tournament|scrimmage|vs\.?)\b/i;

/** What kind of thing an event is, from its own words — never more than the title, place and guest list say. */
export function eventGlyph(e: CalendarEvent): string {
  const t = e.title;
  if (/\b(lab|trial|test|simulation|experiment|research)\b/i.test(t)) return 'lab';
  if (GAME.test(t) || /\b(soccer|football|basketball|baseball|softball|volleyball|hockey|lacrosse|tennis)\b/i.test(t) && !/\bpractice\b/i.test(t)) return 'ball';
  if (/\b(practice|training|run|gym|workout|swim|yoga|5k|10k|race|lift)\b/i.test(t)) return 'run';
  if (/\b(flight|fly|airport|trip|travel)\b/i.test(t)) return 'plane';
  if (/\b(lunch|dinner|breakfast|brunch|coffee)\b/i.test(t)) return 'food';
  if (/\b(doctor|dentist|therapy|appointment|clinic|checkup|vet)\b/i.test(t)) return 'health';
  if (/\b(birthday|party|anniversary)\b/i.test(t)) return 'cake';
  if (/\bzoom\b|google meet|meet\.google|\bteams\b|webex|https?:\/\//i.test(e.location || '')) return 'video';
  if (/\b1:1\b|\bone[- ]on[- ]one\b|\bmeeting\b|\bsync\b|\bstandup\b/i.test(t) || (e.attendees || 0) > 1) return 'people';
  if (e.location) return 'place';
  return 'calendar';
}

export function Glyph({ name, className = 'dt-glyph' }: { name: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[name] || GLYPHS.calendar}</svg>;
}

const STAT_ICONS: Record<string, ReactNode> = {
  events: GLYPHS.calendar,
  tasks: <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.6 2.6 4.9-5.3" /></>,
  games: GLYPHS.people,
  sun: <><circle cx="12" cy="12" r="3.8" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
};

function DayStat({ kind, children, onClick, title }: { kind: keyof typeof STAT_ICONS & string; children: ReactNode; onClick?: () => void; title?: string }) {
  return <button type="button" className={`dt-stat dt-stat-${kind}`} onClick={onClick} title={title}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{STAT_ICONS[kind]}</svg>
    <span>{children}</span>
  </button>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function YourDayCard({ events, today, dayOf, timeZone, now, sourceNote, caption, tasksDue, weather, onCalendar, onTasks, onWeather, onRemind }: {
  /** Every event the summary read, any day. */
  events: CalendarEvent[];
  today: string;
  dayOf: (e: CalendarEvent) => string;
  timeZone?: string;
  now: number;
  /** Shown in place of the timeline when Google Calendar can't be read. */
  sourceNote?: ReactNode;
  caption?: string;
  /** Google Tasks and Jira issues due today or overdue; null when neither can be read. */
  tasksDue: number | null;
  weather: { high: number; low: number } | null;
  onCalendar: () => void;
  onTasks: () => void;
  onWeather: () => void;
  /** Asks Athena to set a reminder; she proposes it and it waits for Approve. */
  onRemind?: (e: CalendarEvent) => void;
}) {
  const time = (at: string | number) => new Date(at).toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' });
  const dateWords = new Date(`${today}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

  const todays = events.filter(e => dayOf(e) === today);
  const games = todays.filter(e => GAME.test(e.title)).length;
  const allDay = todays.filter(e => e.allDay);
  // What's left: on now, then what's coming, soonest first. Ended events drop off.
  const coming = events.filter(e => !e.allDay && Date.parse(e.end) > now && dayOf(e) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const rows = [...allDay.slice(0, 2), ...coming].slice(0, 5);
  const lead = coming[0];
  const leadOngoing = !!lead && Date.parse(lead.start) <= now;

  return <section className="dh-section dt-card dt-card-day" id="dashboard-schedule">
    <CardHeader icon="StatCalendar" title="Your Day" subtitle={<>Today · {dateWords}</>} action="View Calendar" onAction={onCalendar} />
    <div className="dt-stats">
      <DayStat kind="events" onClick={onCalendar} title="Events on your calendar today">{sourceNote ? '—' : plural(todays.length, 'Event')}</DayStat>
      <DayStat kind="tasks" onClick={onTasks} title="Google Tasks and Jira issues due today or overdue">{tasksDue == null ? '— Tasks' : plural(tasksDue, 'Task')}</DayStat>
      <DayStat kind="games" onClick={onCalendar} title="Games on your calendar today">{sourceNote ? '— Games' : plural(games, 'Game')}</DayStat>
      <DayStat kind="sun" onClick={onWeather} title="Today's high and low at home">{weather ? `${weather.high}° / ${weather.low}°` : '—'}</DayStat>
    </div>
    <div className="dh-section-body dt-body">
      {caption && <p className="dt-caption">{caption}</p>}
      {sourceNote || (!rows.length ? <p className="dashboard-empty">Nothing left on the calendar.</p>
        : <ol className="dt-timeline">
          {rows.map((e, i) => {
            const isLead = e === lead;
            const ongoing = isLead && leadOngoing;
            const otherDay = !e.allDay && dayOf(e) !== today;
            const ms = Date.parse(e.start) - now;
            const sub = e.allDay ? e.location
              : ongoing ? [e.location, `until ${time(e.end)}`].filter(Boolean).join(' · ')
                : isLead ? [`in ${untilLabel(ms)}`, e.location].filter(Boolean).join(' · ')
                  : ms < 86_400_000 ? `in ${untilLabel(ms)}` : new Date(e.start).toLocaleDateString(undefined, { timeZone, weekday: 'long' });
            return <li key={`${e.id}-${i}`} className={['dt-event', e.allDay ? 'dt-event-allday' : '', isLead ? 'dt-event-lead' : ''].filter(Boolean).join(' ')}>
              <time>{e.allDay ? 'All day' : ongoing ? time(now) : time(e.start)}{otherDay && <small>{new Date(e.start).toLocaleDateString(undefined, { timeZone, weekday: 'short' })}</small>}</time>
              <i className="dt-node" aria-hidden="true" />
              <button type="button" className="dt-event-main" onClick={onCalendar}>
                <Glyph name={eventGlyph(e)} />
                <span><strong>{e.title}</strong>{sub && <small>{sub}</small>}</span>
              </button>
              {e.allDay ? <span className="dt-allday-bar" aria-hidden="true" />
                : isLead ? <span className="dt-pill">{ongoing ? 'Now' : 'Next'}</span>
                  : onRemind ? <button type="button" className="dt-bell" onClick={() => onRemind(e)} aria-label={`Ask Athena to remind you before ${e.title}`} title="Ask Athena for a reminder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.5 5.6-1.5 5.6h13.8s-1.5-1.4-1.5-5.6A5.4 5.4 0 0 0 12 3.6Z" /><path d="M10.4 18a1.8 1.8 0 0 0 3.2 0" /></svg>
                  </button> : <span />}
            </li>;
          })}
        </ol>)}
    </div>
  </section>;
}
