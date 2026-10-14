import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarEvent } from '../api/dashboard';
import { Icon, Ring } from './HealthPage';
import { untilLabel } from './workStatus';
import './health.css';
import './calendar.css';

/**
 * The Calendar page (redesigned 2026-10-14 from the owner's concept): four
 * numbers, the week as a strip of days, the chosen day's agenda, a month
 * beside it with what comes next, time away, and the bottom row — focus
 * areas, quick add and the calendars on this page.
 *
 * It reads only the week the dashboard summary already carries. The month
 * marks the days it knows about and no others; it does not pretend to have
 * read the rest of the month. Quick add hands the request to Athena, who
 * proposes the event like any other (create_calendar_event) — nothing here
 * writes to a calendar. The calendar switches only hide events on this page.
 */

/** What an event is about, read from its own words. Colours the bar, the dots and Focus areas. */
export type Area = 'work' | 'family' | 'health' | 'sports' | 'travel' | 'personal';
const AREAS: { id: Area; label: string; icon: string; color: string }[] = [
  { id: 'work', label: 'Work', icon: 'calendar', color: '#3aa6ff' },
  { id: 'family', label: 'Family', icon: 'people', color: '#33e0a1' },
  { id: 'health', label: 'Health', icon: 'heart', color: '#ff5d6c' },
  { id: 'sports', label: 'Sports', icon: 'ball', color: '#a77bff' },
  { id: 'travel', label: 'Travel', icon: 'plane', color: '#ff9a3c' },
  { id: 'personal', label: 'Personal', icon: 'user', color: '#5fd3e8' },
];
export const AREA = Object.fromEntries(AREAS.map(a => [a.id, a])) as Record<Area, typeof AREAS[number]>;
/** Calendars are coloured in the order they are listed: primary first. */
const CALENDAR_COLORS = ['#3aa6ff', '#33e0a1', '#a77bff', '#ff5d6c', '#ff9a3c', '#f6c33a', '#5fd3e8'];
const HIDDEN_KEY = 'athena.calendar.hidden';
const DAY = 86400000;

const TRAVEL = /\b(trip|travel|flight|fly(ing)?|hotel|vacation|airport|ooo|out of office|pto|time off)\b/i;
export const SPORTS = /\b(soccer|softball|baseball|basketball|football|volleyball|lacrosse|hockey|tennis|swim meet|practice|game|tournament|scrimmage|5k|10k|race)\b/i;
const HEALTH = /\b(therap\w*|doctor|dr\.?|dentist|orthodont\w*|clinic|check-?up|physio|pediatric\w*|appointment|gym|workout|run|yoga|lift(ing)?|pilates|massage)\b/i;
const FITNESS = /\b(gym|workout|lift(ing)?|pilates|yoga|run)\b/i;
const WORK = /\b(1:1|one on one|meeting|sync|stand-?up|review|sprint|interview|town hall|planning|retro|demo|introductions?|all hands|epics?|admin)\b/i;
const FAMILY = /\b(family|kids?|school|pick-?up|drop-?off|birthday|dinner|recital|church|date night|mom|dad)\b/i;
const MEETING_LINK = /zoom|meet\.google|teams\.microsoft|webex|https?:/i;

export function areaOf(e: CalendarEvent, familyNames: RegExp | null): Area {
  const t = e.title;
  if (e.eventType === 'outOfOffice' || TRAVEL.test(t)) return 'travel';
  if (SPORTS.test(t)) return 'sports';
  if (HEALTH.test(t)) return 'health';
  if ((e.attendees ?? 0) > 0 || e.eventType === 'focusTime' || WORK.test(t)) return 'work';
  if (e.shared || FAMILY.test(t) || familyNames?.test(t)) return 'family';
  return 'personal';
}
export function iconOf(e: CalendarEvent, area: Area) {
  if ((e.attendees ?? 0) > 0 || MEETING_LINK.test(e.location || '')) return 'video';
  if (area === 'health') return FITNESS.test(e.title) ? 'dumbbell' : 'heart';
  return AREA[area].icon;
}

// --- Days, in the calendar's own zone ---------------------------------------
export const zonedDay = (date: Date, timeZone?: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const noon = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, n: number) => new Date(noon(key).getTime() + n * DAY).toISOString().slice(0, 10);
const fmt = (key: string, options: Intl.DateTimeFormatOptions) => noon(key).toLocaleDateString(undefined, { timeZone: 'UTC', ...options });
export const clock = (iso: string, timeZone?: string) => new Date(iso).toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' });
/** Every day an event is on: an all-day run covers its dates (end is exclusive), a timed one its start. */
function daysOf(e: CalendarEvent, timeZone?: string): string[] {
  if (!e.allDay) return [zonedDay(new Date(e.start), timeZone)];
  const start = e.start.slice(0, 10), end = (e.end || '').slice(0, 10);
  const out = [start];
  for (let d = addDays(start, 1); end && d < end && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}
function rangeLabel(e: CalendarEvent, timeZone?: string) {
  const days = daysOf(e, timeZone);
  const first = fmt(days[0], { month: 'short', day: 'numeric' });
  return days.length > 1 ? `${first} – ${fmt(days[days.length - 1], { month: 'short', day: 'numeric' })}` : first;
}

function loadHidden(): string[] {
  try { const v = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

interface Props {
  events: CalendarEvent[];
  timeZone?: string;
  /** How many days the summary reads, from today. */
  days: number;
  now: number;
  /** Why the calendar can't be read, with its fix button; null when it can. */
  unavailable: ReactNode;
  /** Names of the people in their family, so "Skylar softball" reads as theirs. */
  familyNames: string[];
  onAsk: (text: string) => void;
  onManage: () => void;
}

export function CalendarOverview({ events: all, timeZone, days: span, now, unavailable, familyNames, onAsk, onManage }: Props) {
  const today = zonedDay(new Date(now), timeZone);
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState<string[]>(loadHidden);
  const [focus, setFocus] = useState<Area | null>(null);
  const [month, setMonth] = useState(() => today.slice(0, 7));

  const calendarName = (e: CalendarEvent) => e.calendar || 'Your calendar';
  // Primary (not shared) first, then the order they first appear.
  const calendars = useMemo(() => {
    const seen = new Map<string, { name: string; shared: boolean; count: number }>();
    for (const e of all) {
      const name = calendarName(e);
      const row = seen.get(name) || { name, shared: e.shared, count: 0 };
      row.count++;
      seen.set(name, row);
    }
    return [...seen.values()].sort((a, b) => Number(a.shared) - Number(b.shared)).map((c, i) => ({ ...c, color: CALENDAR_COLORS[i % CALENDAR_COLORS.length] }));
  }, [all]);
  const toggle = (name: string) => {
    const next = hidden.includes(name) ? hidden.filter(n => n !== name) : [...hidden, name];
    setHidden(next);
    try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* a per-browser view setting; the page works without it */ }
  };

  const namesPattern = useMemo(() => {
    const words = familyNames.map(n => n.split(/\s+/)[0]).filter(w => w && w.length > 2).map(w => w.replace(/[^\p{L}'-]/gu, ''));
    return words.length ? new RegExp(`\\b(${words.join('|')})\\b`, 'i') : null;
  }, [familyNames]);
  const rows = useMemo(() => all.filter(e => !hidden.includes(calendarName(e))).map(e => {
    const area = areaOf(e, namesPattern);
    return { e, area, days: daysOf(e, timeZone) };
  }), [all, hidden, namesPattern, timeZone]);

  const week = Array.from({ length: Math.max(1, span || 7) }, (_, i) => addDays(today, i));
  const onDay = (key: string) => rows.filter(r => r.days.includes(key));
  const sorted = (list: typeof rows) => [...list].sort((a, b) => Number(b.e.allDay) - Number(a.e.allDay) || a.e.start.localeCompare(b.e.start));
  const inWindow = rows.filter(r => r.days.some(d => d >= today && d <= week[week.length - 1]));
  const todayRows = onDay(today);
  const timedToday = todayRows.filter(r => !r.e.allDay);
  const doneToday = timedToday.filter(r => Date.parse(r.e.end) <= now).length;
  const next = sorted(inWindow).find(r => !r.e.allDay && Date.parse(r.e.end) > now);
  const nextIsNow = next && Date.parse(next.e.start) <= now;
  const selIndex = Math.max(0, week.indexOf(selected));
  const dayRows = sorted(onDay(selected)).filter(r => !focus || r.area === focus);
  const selLabel = selected === today ? 'Today' : selected === addDays(today, 1) ? 'Tomorrow' : fmt(selected, { weekday: 'long' });
  const counts = week.map(d => onDay(d).length);
  const peak = Math.max(1, ...counts);
  const away = inWindow.filter(r => r.area === 'travel');
  const areaDots = (list: typeof rows) => [...new Set(list.map(r => r.area))].slice(0, 4);

  const header = <header className="cp-head">
    <span className="hp-eyebrow">THE NEXT SEVEN DAYS</span>
    <h1>Calendar</h1>
    <p>Your time, your people, your priorities.</p>
  </header>;
  if (unavailable) return <div className="hp cp">{header}<div className="hp-panel cp-unavailable">{unavailable}</div></div>;

  // The month: weeks from the Sunday on or before the 1st, through the last day.
  const first = `${month}-01`;
  const lead = noon(first).getUTCDay();
  const nextMonth = addDays(first, 32).slice(0, 7);
  const monthDays = Math.round((noon(`${nextMonth}-01`).getTime() - noon(first).getTime()) / DAY);
  const cells = Array.from({ length: Math.ceil((lead + monthDays) / 7) * 7 }, (_, i) => addDays(first, i - lead));
  const shiftMonth = (n: number) => setMonth(addDays(`${month}-15`, n * 30).slice(0, 7));
  const pick = (key: string) => { setSelected(key); setFocus(null); };

  // What follows the chosen day: the next two days in the window.
  const upcoming = week.filter(d => d > selected).slice(0, 2);

  return <div className="hp cp">
    {header}

    <section className="cp-stats" aria-label="This week at a glance">
      <div className="hp-tile cp-stat">
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="calendar" /></span>
        {/* The bars sit under the label, in the same column, so a narrow tile wraps rather than overlaps. */}
        <div><strong>{inWindow.length}<small> events</small></strong><span>next {week.length} days</span>
          <span className="cp-mini-bars" aria-hidden="true">{counts.map((c, i) => <i key={i} className={i === selIndex ? 'cp-on' : ''} style={{ height: `${Math.max(12, (c / peak) * 100)}%` }} />)}</span></div>
      </div>
      <div className="hp-tile cp-stat">
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="clock" /></span>
        <div><strong>{todayRows.length}</strong><span>today</span><small>{timedToday.length ? `${doneToday} of ${timedToday.length} done` : 'on your calendar'}</small></div>
        <Ring value={timedToday.length ? doneToday : null} max={timedToday.length || 1} color="#3aa6ff" size={58} stroke={6} />
      </div>
      <div className="hp-tile cp-stat">
        <span className="hp-badge hp-badge-lg cp-slate"><Icon name="clock" /></span>
        <div><strong>{next ? clock(next.e.start, timeZone) : '—'}</strong><span>{next ? (nextIsNow ? 'on now' : next.days[0] === today ? 'next up' : fmt(next.days[0], { weekday: 'long' })) : 'next up'}</span><small>{next?.e.title || 'Nothing timed coming up'}</small></div>
      </div>
      <div className="hp-tile cp-stat">
        <span className="hp-badge hp-badge-lg hp-violet"><Icon name="people" /></span>
        <div><strong>{calendars.length}<small> calendar{calendars.length === 1 ? '' : 's'}</small></strong>
          <span className="cp-dots">{calendars.slice(0, 5).map(c => <i key={c.name} style={{ background: c.color }} />)}</span>
          <small>{calendars.slice(0, 3).map(c => c.name).join(', ')}{calendars.length > 3 ? ` +${calendars.length - 3}` : ''}</small></div>
      </div>
    </section>

    <nav className="cp-strip" aria-label="Choose a day">
      <button type="button" className="cp-arrow" aria-label="Previous day" disabled={selIndex === 0} onClick={() => pick(week[selIndex - 1])}><Icon name="chevronLeft" /></button>
      <div className="cp-days">{week.map(d => {
        const list = onDay(d);
        return <button key={d} type="button" className={`cp-day${d === selected ? ' cp-on' : ''}`} aria-pressed={d === selected} onClick={() => pick(d)}>
          <span>{fmt(d, { weekday: 'short' })}</span><span>{fmt(d, { month: 'short', day: 'numeric' })}</span>
          <small>{list.length} event{list.length === 1 ? '' : 's'}</small>
          <span className="cp-dots">{areaDots(list).map(a => <i key={a} style={{ background: AREA[a].color }} />)}</span>
        </button>;
      })}</div>
      <button type="button" className="cp-arrow" aria-label="Next day" disabled={selIndex >= week.length - 1} onClick={() => pick(week[selIndex + 1])}><Icon name="chevron" /></button>
    </nav>

    <div className="cp-grid">
      <section className="hp-panel cp-agenda">
        <header>
          <h2>{selLabel} <span>{fmt(selected, { weekday: selLabel === 'Today' || selLabel === 'Tomorrow' ? 'long' : undefined, month: 'short', day: 'numeric' })}</span></h2>
          {focus && <button type="button" className="cp-chip" onClick={() => setFocus(null)} style={{ borderColor: AREA[focus].color }}>{AREA[focus].label} only ✕</button>}
          <button type="button" className="cp-outline" onClick={() => onAsk(`Walk me through ${selLabel === 'Today' || selLabel === 'Tomorrow' ? selLabel.toLowerCase() : fmt(selected, { weekday: 'long', month: 'short', day: 'numeric' })} on my calendar.`)}>Talk through the day <Icon name="arrowRight" /></button>
        </header>
        {!dayRows.length ? <p className="hp-empty">{focus ? `Nothing in ${AREA[focus].label} on this day.` : 'Nothing on the calendar for this day.'}</p>
          : <ul className="cp-events">{dayRows.map(({ e, area }, i) => {
            const start = Date.parse(e.start), end = Date.parse(e.end);
            const live = !e.allDay && start <= now && end > now;
            const soon = !e.allDay && next?.e === e && !live && start - now < 6 * 3600000;
            const where = e.location && !MEETING_LINK.test(e.location) ? e.location : null;
            const sub = where || [(e.attendees ?? 0) > 0 ? `${e.attendees} people` : null, e.shared || calendars.length > 1 ? calendarName(e) : null].filter(Boolean).join(' · ');
            const past = !e.allDay && end <= now;
            // All-day entries lead the list; a rule sets them apart from the timed ones.
            const divider = !e.allDay && i > 0 && dayRows[i - 1].e.allDay;
            return <Fragment key={`${e.id}-${i}`}>{divider && <li className="cp-divider" role="separator"><hr /></li>}<li className={past ? 'cp-past' : undefined}>
              <time>{e.allDay ? <span>All day</span> : <><span>{clock(e.start, timeZone)}</span><span>{clock(e.end, timeZone)}</span></>}</time>
              <div className="cp-event" style={{ '--cp-tone': AREA[area].color } as CSSProperties}>
                <Icon name={iconOf(e, area)} className="cp-event-icon" />
                <div><strong>{e.title}</strong>{sub && <small>{where && <Icon name="pin" />}{sub}</small>}</div>
                {live ? <span className="cp-badge cp-badge-live">Now</span> : soon ? <span className="cp-badge">In {untilLabel(start - now)}</span> : null}
                <button type="button" className="cp-more" aria-label={`Ask Athena about ${e.title}`} title="Ask Athena about this"
                  onClick={() => onAsk(`About "${e.title}" (${e.allDay ? rangeLabel(e, timeZone) : `${fmt(selected, { weekday: 'short', month: 'short', day: 'numeric' })}, ${clock(e.start, timeZone)}`}): `)}><Icon name="dots" /></button>
              </div>
            </li></Fragment>;
          })}</ul>}
      </section>

      <div className="hp-stack">
        <section className="hp-panel cp-month">
          <header>
            <h2>Month</h2>
            <button type="button" className="cp-outline cp-small" onClick={() => { setMonth(today.slice(0, 7)); pick(today); }}>Today</button>
            <button type="button" className="cp-arrow cp-small" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Icon name="chevronLeft" /></button>
            <button type="button" className="cp-arrow cp-small" aria-label="Next month" onClick={() => shiftMonth(1)}><Icon name="chevron" /></button>
          </header>
          <p className="cp-month-name">{fmt(first, { month: 'long', year: 'numeric' })}</p>
          <div className="cp-cal" role="grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d} className="cp-cal-head">{d}</span>)}
            {cells.map(d => {
              const known = week.includes(d);
              const list = known ? onDay(d) : [];
              return <button key={d} type="button" disabled={!known}
                className={`cp-cal-day${d.slice(0, 7) !== month ? ' cp-out' : ''}${d === today ? ' cp-today' : ''}${d === selected ? ' cp-on' : ''}`}
                onClick={() => pick(d)} aria-label={fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}>
                {Number(d.slice(8))}
                <span className="cp-dots">{areaDots(list).slice(0, 3).map(a => <i key={a} style={{ background: AREA[a].color }} />)}</span>
              </button>;
            })}
          </div>
          <p className="hp-footnote">Dots mark the {week.length} days I’ve read.</p>
        </section>

        <section className="hp-panel cp-upcoming">
          <header><h2>Upcoming</h2></header>
          {!upcoming.length ? <p className="hp-empty">That’s the end of the week I’ve read.</p>
            : upcoming.map(d => {
              const list = sorted(onDay(d));
              return <div key={d} className="cp-up-day">
                <h3>{d === addDays(today, 1) ? 'Tomorrow' : fmt(d, { weekday: 'long' })} <span>· {fmt(d, { weekday: 'short', month: 'short', day: 'numeric' })} · {list.length} event{list.length === 1 ? '' : 's'}</span></h3>
                {!list.length ? <p className="hp-empty">Nothing on the calendar.</p>
                  : <ul>{list.slice(0, 4).map(({ e, area }, i) => <li key={`${e.id}-${i}`} style={{ '--cp-tone': AREA[area].color } as CSSProperties}>
                    <Icon name={iconOf(e, area)} /><span>{e.title}</span><small>{e.allDay ? 'All day' : clock(e.start, timeZone)}</small>
                  </li>)}</ul>}
                {list.length > 4 && <button type="button" className="hp-link" onClick={() => pick(d)}>+{list.length - 4} more <Icon name="arrowRight" /></button>}
              </div>;
            })}
        </section>

        <section className="hp-panel cp-away">
          <header><h2>Travel &amp; Time Away</h2></header>
          {!away.length ? <p className="hp-empty">No trips or time off on your calendar this week.</p>
            : away.slice(0, 3).map(({ e }, i) => <button key={`${e.id}-${i}`} type="button" className="cp-trip" onClick={() => pick(e.allDay ? (daysOf(e, timeZone).find(d => week.includes(d)) || today) : zonedDay(new Date(e.start), timeZone))}>
              <Icon name={e.eventType === 'outOfOffice' ? 'calendar' : 'plane'} />
              <div><strong>{e.title}</strong><small>{rangeLabel(e, timeZone)}</small></div>
              <Icon name="chevron" className="hp-chev" />
            </button>)}
        </section>
      </div>
    </div>

    <div className="cp-bottom">
      <section className="hp-panel cp-areas">
        <header><h2>Focus Areas</h2><span>this week</span></header>
        <ul>{AREAS.map(a => {
          const n = inWindow.filter(r => r.area === a.id).length;
          if (!n && a.id === 'personal') return null;
          return <li key={a.id}><button type="button" className={focus === a.id ? 'cp-on' : ''} aria-pressed={focus === a.id} onClick={() => setFocus(focus === a.id ? null : a.id)}>
            <span className="cp-area-dot" style={{ color: a.color, background: `${a.color}26` }}><Icon name={a.icon} /></span>
            <span>{a.label}</span><em>{n}</em><Icon name="chevron" className="hp-chev" />
          </button></li>;
        })}</ul>
        <p className="hp-footnote">Sorted by the words in each title. Tap one to filter the day.</p>
      </section>

      <section className="hp-panel cp-quick">
        <header><h2>Quick Add</h2><button type="button" className="cp-plus" aria-label="Add something to your calendar" onClick={() => onAsk('Add to my calendar: ')}><Icon name="plus" /></button></header>
        <ul>{[
          { icon: 'calendar', label: 'Time block', ask: 'Block time on my calendar for ', tone: 'hp-blue' },
          { icon: 'check', label: 'Task / Reminder', ask: 'Remind me to ', tone: 'hp-green' },
          { icon: 'dumbbell', label: 'Workout', ask: 'Add a workout to my calendar: ', tone: 'hp-violet' },
          { icon: 'people', label: 'Family event', ask: 'Add a family event to my calendar: ', tone: 'hp-amber' },
          { icon: 'plane', label: 'Travel', ask: 'Add a trip to my calendar: ', tone: 'hp-blue' },
        ].map(q => <li key={q.label}><button type="button" onClick={() => onAsk(q.ask)}><Icon name={q.icon} className={q.tone.replace('hp-', 'cp-text-')} />{q.label}</button></li>)}</ul>
        <p className="hp-footnote">I’ll write it up and ask you before anything is added.</p>
      </section>

      <section className="hp-panel cp-calendars">
        <header><h2>Calendars</h2><button type="button" className="hp-link" onClick={onManage}>Manage <Icon name="arrowRight" /></button></header>
        {!calendars.length ? <p className="hp-empty">No events this week, so no calendars to show.</p>
          : <ul>{calendars.map(c => {
            const on = !hidden.includes(c.name);
            return <li key={c.name}>
              <i style={{ background: c.color }} />
              <div><strong>{c.shared ? c.name : c.name.includes('@') ? 'Your calendar' : c.name}</strong><small>{c.shared ? 'shared with you' : c.name.includes('@') ? c.name : 'yours'} · {c.count} this week</small></div>
              <button type="button" role="switch" aria-checked={on} aria-label={`Show ${c.name} on this page`} className={`cp-switch${on ? ' cp-on' : ''}`} onClick={() => toggle(c.name)}><span /></button>
            </li>;
          })}</ul>}
        <p className="hp-footnote">Switches only hide events on this page.</p>
      </section>
    </div>
  </div>;
}
