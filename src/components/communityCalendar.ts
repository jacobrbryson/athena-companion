import type { CalendarEvent, WatchPlace } from '../api/dashboard';
import { eventWhat, startOf, whenWords } from './eventWords.ts';

/**
 * What on the calendar belongs to the person's community.
 *
 * Nothing here knows a town's name. The terms come from the person's own
 * points of interest — each place's town (read off its address) and the
 * place's own name when it is distinctive — the same rule the server uses to
 * pick local headlines (core_api services/community.js `localTerms`). Add a
 * point of interest in another town and its calendar follows.
 */

/** Names too ordinary to search a calendar for. Mirrors the server's list. */
const GENERIC = new Set(['home', 'work', 'school', 'church', 'the park', 'park', 'office', "mom's", "dad's"]);

/** "148 RUSHING WATER LN, TROUTMAN, NC, 28166" -> "Troutman". */
export function townOf(address: string | null | undefined): string | null {
  const parts = String(address || '').split(',').map(p => p.trim()).filter(Boolean);
  const state = parts.findIndex((p, i) => i > 0 && /^[A-Za-z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
  const town = state > 0 ? parts[state - 1] : null;
  if (!town || /\d/.test(town)) return null;
  return town.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
}

/** What to look for in an event: each place's town, and distinctive place names. */
export function communityTerms(places: Pick<WatchPlace, 'name' | 'address'>[]): string[] {
  const terms = new Map<string, string>();
  for (const place of places) {
    const town = townOf(place.address);
    if (town && !terms.has(town.toLowerCase())) terms.set(town.toLowerCase(), town);
    const name = String(place.name || '').trim();
    if (name.length >= 5 && !GENERIC.has(name.toLowerCase()) && !terms.has(name.toLowerCase())) terms.set(name.toLowerCase(), name);
  }
  return [...terms.values()];
}

/**
 * Things people go to together: a game, a recital, a 5K. A kid's "softball game"
 * never names the town, so an outing counts as community when it involves
 * someone in the family. Mirrors OUTING in core_api services/community.js.
 */
const OUTING = /\b(games?|practices?|tournaments?|scrimmages?|tryouts?|recitals?|concerts?|performances?|rehearsals?|fairs?|festivals?|parades?|5k|10k|races?|fundraisers?|suppers?|banquets?|ceremon(?:y|ies))\b/i;

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface CommunityEvent {
  event: CalendarEvent;
  /** The term that matched, e.g. "Troutman". */
  term: string;
  /** "Soccer practice": the title without the community's name. */
  what: string;
  /** "tomorrow night", "Saturday". */
  when: string;
  /** The family member an outing was matched to ("Skylar"); absent when it matched the community itself. */
  who?: string;
}

/** Upcoming calendar events that mention the community, soonest first. */
export function communityEvents(events: CalendarEvent[], places: Pick<WatchPlace, 'name' | 'address'>[], now: Date, people: string[] = []): CommunityEvent[] {
  const terms = communityTerms(places).map(term => ({ term, re: new RegExp(`\\b${escapeRe(term)}\\b`, 'i') }));
  const family = [...new Set(people.map(p => p.trim()).filter(p => p.length >= 3))].map(name => ({ name, re: new RegExp(`\\b${escapeRe(name)}(?:['’]s)?\\b`, 'i') }));
  if (!terms.length && !family.length) return [];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: CommunityEvent[] = [];
  for (const event of events) {
    // A working location or out-of-office block is not something happening in town.
    if (event.eventType && event.eventType !== 'default') continue;
    const allDay = event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(event.start);
    const over = allDay ? startOf(event).getTime() < startOfToday : Date.parse(event.end || event.start) < now.getTime();
    if (over) continue;
    const text = `${event.title} ${event.location || ''} ${event.calendar || ''}`;
    const hit = terms.find(t => t.re.test(text));
    // An outing for a family member ("Skylar softball game") needs no town on it.
    const member = hit ? undefined : OUTING.test(event.title) ? family.find(f => f.re.test(event.title)) : undefined;
    if (!hit && !member) continue;
    // Take the town off the title only when something sensible is left ("Troutman 5K" stays).
    const stripped = eventWhat(event.title, (hit ? hit.term : member!.name).split(/\s+/));
    out.push({ event, term: hit ? hit.term : '', who: member?.name, what: stripped.length >= 4 ? stripped : event.title, when: whenWords(event, now) });
  }
  return out.sort((a, b) => startOf(a.event).getTime() - startOf(b.event).getTime());
}
