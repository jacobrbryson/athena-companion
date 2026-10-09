import type { CalendarEvent, JiraIssue } from '../api/dashboard';

/**
 * Are they working right now, and what is the next thing the day asks of them?
 *
 * "Working" is whatever the person's own calendar says it is: a Working
 * Location event (Google's "Home 7am–4pm") covering this moment. Nothing is
 * assumed from the clock, so a holiday or a day off — where nobody set a
 * location, or an Out of office event sits over it — shows no banner at all.
 * It flips on its own at the start and end of the event, because the events
 * are already on the page and only `now` moves.
 */
export type WorkMoment =
  /** In a meeting now; `then` is the next one, if any, before the workday ends. */
  | { kind: 'meeting'; event: CalendarEvent; endsInMs: number; then: CalendarEvent | null }
  /** Between meetings; the next one starts in `inMs`. */
  | { kind: 'free'; next: CalendarEvent; inMs: number }
  /** Nothing else on before the workday ends. */
  | { kind: 'clear' };

export interface WorkStatus {
  /** "Home", "Office", or what the person called the place. */
  where: string;
  /** When this working block ends; null for an all-day location. */
  until: Date | null;
  moment: WorkMoment;
}

/** YYYY-MM-DD in a named zone, so "today" means the person's today. */
function dayIn(ms: number, timeZone?: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Is this timed or all-day event on at `now`? All-day ends are exclusive dates. */
function covers(event: CalendarEvent, now: number, timeZone?: string) {
  if (event.allDay) {
    const today = dayIn(now, timeZone);
    return event.start <= today && (event.end ? today < event.end : today === event.start);
  }
  const start = Date.parse(event.start), end = Date.parse(event.end);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
}

/** Things that take their time: not a place, not a day-long marker, not a focus block. */
const isMeeting = (e: CalendarEvent) =>
  !e.allDay && e.eventType !== 'workingLocation' && e.eventType !== 'focusTime' && e.eventType !== 'outOfOffice';

export function workStatus(
  events: CalendarEvent[],
  workingLocations: CalendarEvent[] | undefined,
  now: number,
  timeZone?: string,
): WorkStatus | null {
  // Out of office wins over a location that was left in place.
  if (events.some(e => e.eventType === 'outOfOffice' && covers(e, now, timeZone))) return null;
  const here = (workingLocations || []).find(e => covers(e, now, timeZone));
  if (!here) return null;

  const until = here.allDay ? null : new Date(here.end);
  // Only what falls inside the working block counts: a 5pm dinner is not the
  // next meeting of a workday that ends at 4. An all-day location bounds the
  // day itself.
  const dayEnd = until ? until.getTime() : Infinity;
  const today = dayIn(now, timeZone);
  // The working location lives on the work calendar — Google only makes them on
  // Workspace calendars — so that calendar is what "the workday" means. A family
  // or shared calendar's 2pm is not the next work meeting. A server too old to
  // say which calendar an event came from leaves every calendar in.
  const workCalendar = here.calendar ?? null;
  const onWorkCalendar = (e: CalendarEvent) => !workCalendar || !e.calendar || e.calendar === workCalendar;
  const inBlock = (e: CalendarEvent) => isMeeting(e) && onWorkCalendar(e) && (until ? Date.parse(e.start) < dayEnd : dayIn(Date.parse(e.start), timeZone) === today);
  const meetings = events.filter(inBlock).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const current = meetings.find(e => Date.parse(e.start) <= now && now < Date.parse(e.end));
  if (current) {
    const then = meetings.find(e => Date.parse(e.start) >= Date.parse(current.end)) ?? null;
    return { where: here.workingLocation || here.title, until, moment: { kind: 'meeting', event: current, endsInMs: Date.parse(current.end) - now, then } };
  }
  const next = meetings.find(e => Date.parse(e.start) > now);
  return {
    where: here.workingLocation || here.title, until,
    moment: next ? { kind: 'free', next, inMs: Date.parse(next.start) - now } : { kind: 'clear' },
  };
}

/** "40 min", "2 h 10 min" — the way a person would say how long until something. */
export function untilLabel(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Older servers don't say whether Jira had more; this is what they read per site. */
const LEGACY_READ_LIMIT = 10;

/** In progress by Jira's own grouping; by the status name only when the server didn't send one. */
export const isInProgress = (issue: JiraIssue) =>
  issue.statusCategory ? issue.statusCategory === 'indeterminate' : /progress/i.test(issue.status || '');

/** An https link with no embedded credentials, or nothing. */
export function safeHttpsUrl(url?: string | null) {
  try { const u = new URL(url || ''); return u.protocol === 'https:' && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}

export interface JiraGlance {
  /** How many open issues are assigned to you; `atLeast` when Jira has more than was read. */
  count: number;
  atLeast: boolean;
  /** The one you touched last — the read comes newest-first. */
  latest: JiraIssue | null;
  /** What you're working on, most recently touched first. */
  inProgress: JiraIssue[];
  overdue: number;
  dueToday: number;
}

/**
 * What the banner says about Jira: how many, what's in progress, and whether
 * anything is due. A missing due date is not "due", and a date is read as a
 * calendar day in the person's own zone.
 */
export function jiraGlance(data: { issues: JiraIssue[]; partial?: boolean; capped?: boolean } | null | undefined, now: number, timeZone?: string): JiraGlance | null {
  if (!data) return null;
  const today = dayIn(now, timeZone);
  const due = data.issues.map(i => (i.due || '').slice(0, 10)).filter(Boolean);
  return {
    count: data.issues.length,
    atLeast: !!data.partial || (data.capped ?? data.issues.length >= LEGACY_READ_LIMIT),
    latest: data.issues[0] ?? null,
    inProgress: data.issues.filter(isInProgress),
    overdue: due.filter(d => d < today).length,
    dueToday: due.filter(d => d === today).length,
  };
}
