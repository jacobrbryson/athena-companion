import type { CalendarEvent } from '../api/dashboard';

/**
 * Calendar events in the words a person would use: "Therapy tomorrow",
 * "Softball game tonight", "Games Saturday". Shared by the Family and
 * Community cards, which both pick calendar events out by name.
 */
const DAY = 86_400_000;
/** The event's own start as a local moment; a bare date means that day, not midnight UTC. */
export function startOf(e: CalendarEvent) {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.start);
  return bare ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3])) : new Date(e.start);
}

/** "tonight", "tomorrow", "Thursday": when an upcoming event is, in the words a person would use. */
export function whenWords(e: CalendarEvent, now: Date): string {
  const start = startOf(e);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(start) - day(now)) / DAY);
  const allDay = e.allDay || /^\d{4}-\d{2}-\d{2}$/.test(e.start);
  if (diff < 0) return 'earlier';
  const h = start.getHours();
  if (diff === 0) {
    if (allDay) return 'today';
    return h >= 17 ? 'tonight' : h < 12 ? 'this morning' : 'this afternoon';
  }
  // An evening event is worth saying so: "tomorrow night", "Saturday night".
  const night = !allDay && h >= 17 ? ' night' : '';
  if (diff === 1) return `tomorrow${night}`;
  return `${start.toLocaleDateString('en-US', { weekday: 'long' })}${night}`;
}

/** "Ashlynn therapy" for Ashlynn -> "Therapy": the row already says who. */
export function eventWhat(title: string, who: string[]): string {
  const words = [...new Set(who.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(w => w.length >= 3))];
  let out = title;
  for (const w of words) out = out.replace(new RegExp(`\\b${w}(?:['\u2019]s)?\\b`, 'ig'), ' ');
  out = out.replace(/\s+/g, ' ').replace(/^[\s:\u2013\u2014-]+|[\s:\u2013\u2014-]+$/g, '');
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : title;
}
