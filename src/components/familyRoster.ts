import type { CalendarEvent, FamilyChild, FamilyHealthStatus, FamilyLink } from '../api/dashboard';
import type { Fact } from '../api/companion';
import { whenWords, eventWhat } from './eventWords.ts';

export { whenWords, eventWhat };

/**
 * Who in the family needs something from you, and what.
 *
 * Each remembered person, family member or pet becomes one row carrying the
 * single most pressing thing about them. Everything is derived in code from
 * data already on the page — no model ranks or writes any of it — and a row
 * with nothing pressing still says something useful: what Athena knows is
 * thin, or has gone stale, so the card keeps backfilling and nudging instead
 * of going quiet.
 */
export type SignalKind = 'sick' | 'birthday' | 'calendar' | 'stale' | 'sparse' | 'ok';

export interface RosterSignal {
  kind: SignalKind;
  /** Lower sorts first. */
  rank: number;
  /** The chip on the row. */
  label: string;
  /** What the row's button says. */
  action: string;
  /** What Athena is asked when the button is pressed (unused for `sick`). */
  ask: string;
  /** Set for `sick`: the report the button resolves. */
  healthUuid?: string;
}

export interface RosterRow {
  id: string;
  name: string;
  initial: string;
  detail: string;
  /** "Spouse", "Sister": how they are related, when the memory is filed under that. */
  relation?: string;
  /** From a linked Google Contact, when there is one. */
  photoUrl?: string | null;
  signal: RosterSignal;
}

/** Athena counts a person as going stale after this long without an update. */
export const STALE_DAYS = 21;
const BIRTHDAY_WINDOW_DAYS = 14;
const CALENDAR_WINDOW_DAYS = 7;
const DAY = 86_400_000;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Words that name a relationship rather than a person, so "mom" is a name
// token for the step-mom's row but "son" never matches half the calendar.
const NOT_NAMES = new Set(['the', 'and', 'my', 'his', 'her', 'their', 'our', 'with', 'for', 'son', 'daughter', 'kid', 'kids', 'child', 'pet', 'dog', 'cat', 'family', 'person']);

/** Words in a person's key and value that an event or report could be naming. */
function nameTokens(fact: Fact): string[] {
  const out = new Set<string>();
  const add = (w: string) => { const t = w.toLowerCase().replace(/[^a-z']/g, '').replace(/'s$/, ''); if (t.length >= 3 && !NOT_NAMES.has(t)) out.add(t); };
  fact.key.split(/\s+/).forEach(add);
  // Capitalised words at the start of the value are usually the name itself.
  (fact.value || '').split(/[\s,.;:]+/).slice(0, 3).filter(w => /^[A-Z]/.test(w)).forEach(add);
  return [...out];
}

// Keys that name how someone is related rather than who they are: the memory
// "spouse: Ashlynn, therapy Tuesdays" is about Ashlynn.
const RELATIONS = new Set(['spouse', 'wife', 'husband', 'partner', 'mom', 'mother', 'dad', 'father', 'son', 'daughter', 'brother', 'sister', 'grandma', 'grandmother', 'grandpa', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew', 'friend', 'step mom', 'step dad', 'stepmom', 'stepdad', 'mother-in-law', 'father-in-law']);
// Keys that cover several people at once; they yield calendar events to the named ones.
const GROUPS = new Set(['children', 'kids', 'siblings', 'family', 'parents', 'grandkids', 'grandchildren', 'household']);
// The person's own name is a fact about them, not someone in their corner.
const SELF_KEY = /^(my |user'?s? |full |first |last )?name$/i;
/** "Ashlynn therapy" -> "Ashlynn"; "Linda Smith, Ohio" -> "Linda Smith"; null when the value does not open with a name. */
const leadName = (value: string | null) => /^([A-Z][a-z'\u2019-]+(?: [A-Z][a-z'\u2019-]+)?)(?=[\s,.;:\u2014\u2013-]|$)/.exec((value || '').trim())?.[1] ?? null;

// Longest first, so "step mom" is found before "mom".
const RELATION_WORDS = [...RELATIONS].sort((a, b) => b.length - a.length).join('|');
const SAID_MY = new RegExp(`\\bmy (${RELATION_WORDS})\\b`, 'i');
const SAID_AFTER_NAME = new RegExp(`^[A-Z][\\w'\u2019 -]*?\\s*(?:,|\\(|[\u2014\u2013-])\\s*(?:my |their )?(${RELATION_WORDS})\\b`, 'i');
/** "Skylar is my daughter", "Thomas, son, 8", "Wynter (daughter)" -> the relation said outright; never inferred from "her son". */
const relationIn = (value: string | null) => { const m = SAID_MY.exec(value || '') || SAID_AFTER_NAME.exec(value || ''); return m ? capitalize(m[1]) : undefined; };

const hasToken = (text: string, tokens: string[]) => {
  const words = text.toLowerCase().replace(/'s\b/g, '').split(/[^a-z]+/);
  return tokens.some(t => words.includes(t));
};

/** Whole days from `now` to the next occurrence of month/day, or null. */
function daysUntil(month: number, day: number, now: Date): number | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), month, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month, day);
  return Math.round((next.getTime() - today.getTime()) / DAY);
}

/** "birthday March 3", "born 3/14/2015", "bday: Mar 3rd" → days until it; else null. */
export function birthdayIn(value: string | null, now: Date): number | null {
  if (!value || !/birthday|bday|born/i.test(value)) return null;
  const named = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (named) return daysUntil(MONTHS.indexOf(named[1].toLowerCase()), Number(named[2]), now);
  const dayFirst = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  if (dayFirst) return daysUntil(MONTHS.indexOf(dayFirst[2].toLowerCase()), Number(dayFirst[1]), now);
  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (numeric) return daysUntil(Number(numeric[1]) - 1, Number(numeric[2]), now);
  return null;
}

const SINCE = (ms: number) => {
  const days = Math.floor(ms / DAY);
  return days < 14 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.floor(days / 7)} weeks`;
};
function capitalize(s: string) { return s.replace(/(^|\s)(\w)/g, (_, space, c) => space + c.toUpperCase()); }

/** "2016-10-08" or Google's year-less "--10-08" → days until the next one, or null. */
export function birthdayFromIso(iso: string | null | undefined, now: Date): number | null {
  const m = /^(?:\d{4}|-)-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? daysUntil(Number(m[1]) - 1, Number(m[2]), now) : null;
}

/** One person, whichever source they came from, ready to be given a signal. */
interface Person {
  id: string;
  name: string;
  detail: string;
  tokens: string[];
  /** Days to the next birthday, when any source knows it. */
  birthday: number | null;
  /** Ms since Athena last heard about them; null where there's no memory to age (a child profile). */
  quiet: number | null;
  /** Athena knows little more than the name. */
  thin: boolean;
  photoUrl?: string | null;
  relation?: string;
  /** Covers several people ("children"), so named people get first call on shared events. */
  group?: boolean;
  /** How much the memory says, to pick the better of two rows for one person. */
  richness?: number;
  /** What to ask when the birthday is the thing missing. */
  missing?: string;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, '');

export function buildFamilyRoster({ facts, sick, events, now, children = [], links = [] }: {
  facts: Fact[]; sick: FamilyHealthStatus[]; events: CalendarEvent[]; now: Date;
  /** Children on the family's profiles. */
  children?: FamilyChild[];
  /** Google Contacts the person linked to remembered people. */
  links?: FamilyLink[];
}): RosterRow[] {
  const soon = events.filter(e => {
    const start = Date.parse(e.start);
    return start >= now.getTime() - DAY / 2 && start <= now.getTime() + CALENDAR_WINDOW_DAYS * DAY;
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const claimed = new Set<string>();
  const linkOf = new Map(links.map(l => [l.factUuid, l]));
  const taken = new Set<string>();

  const people: Person[] = facts.filter(f => !SELF_KEY.test(f.key.trim())).map(fact => {
    const tokens = nameTokens(fact);
    // "dog's name" → "Biscuit": when the key only says what the value is, the value is the name.
    const keyedByName = /'s name$/i.test(fact.key) && !!fact.value;
    const key = fact.key.trim().toLowerCase();
    const lead = RELATIONS.has(key) ? leadName(fact.value) : null;
    const name = keyedByName ? fact.value!.split(/\s[\u2014\u2013-]\s|\s\(|[,.;]/)[0].trim() : lead ?? capitalize(fact.key);
    // What the value says beyond the name: "Dexter (4-year-old husky mix)" -> "4-year-old husky mix".
    const rest = keyedByName ? fact.value!.slice(name.length).replace(/^[\s,.;:\u2014\u2013(-]+|\)\s*$/g, '') : '';
    const card = linkOf.get(fact.uuid)?.card || null;
    // A child profile with the same first name is this person: its birthday is theirs.
    const kid = children.find(c => !taken.has(c.uuid) && [name, ...tokens].some(t => firstName(t) === firstName(c.name)));
    if (kid) taken.add(kid.uuid);
    const birthday = birthdayFromIso(kid?.birthday ?? card?.birthday, now) ?? birthdayIn(fact.value, now);
    const known = birthday !== null;
    return {
      id: fact.uuid, name, tokens, birthday,
      // How they are related: said by the key ("spouse"), the category (a pet), or the value ("my daughter").
      relation: fact.category === 'pet' ? 'Pet' : RELATIONS.has(key) ? capitalize(fact.key) : relationIn(fact.value),
      group: GROUPS.has(key),
      detail: keyedByName ? rest || fact.key : lead ? (fact.value || '').slice(lead.length).replace(/^[\s,.;:\u2014\u2013-]+/, '') : fact.value || '',
      quiet: Math.max(0, now.getTime() - Date.parse(fact.updated_at)),
      thin: keyedByName ? rest.length < 12 : (fact.value || '').trim().length < 12,
      richness: (fact.value || '').length,
      photoUrl: card?.photoUrl,
      // Pets get no birthday prompt; everyone else without one does.
      missing: known || fact.category === 'pet' ? undefined : `I haven't told you ${name}'s birthday yet. Ask me when it is.`,
    };
  });
  // A child with no memory of their own still belongs on the card.
  for (const c of children) {
    if (taken.has(c.uuid)) continue;
    people.push({
      id: `child:${c.uuid}`, name: c.name, tokens: [firstName(c.name)].filter(t => t.length >= 3),
      relation: 'Child',
      detail: c.grade ? `Grade ${c.grade}` : 'Child profile', birthday: birthdayFromIso(c.birthday, now), quiet: null, thin: false,
      missing: `I haven't told you ${c.name}'s birthday yet. Ask me when it is.`,
    });
  }

  // "Children: Skylar ortho" beside a row for Skylar says nothing the Skylar
  // row doesn't; a group row only earns its place when it names no one else.
  // The same person remembered twice ("dog's name: Dexter" and a "Dexter" note) is one row:
  // the one that says more.
  const best = new Map<string, Person>();
  for (const q of people) {
    const k = q.name.toLowerCase().replace(/\s*\(.*$/, '').trim();
    const held = best.get(k);
    const better = !held || Number(!q.thin) > Number(!held.thin) || (Number(!q.thin) === Number(!held.thin) && (q.richness ?? 0) > (held.richness ?? 0));
    if (better) best.set(k, q);
  }
  const unique = [...best.values()];
  const coveredByNamed = (p: Person) => !!p.group && unique.some(o => o !== p && !o.group && hasToken(p.detail, [firstName(o.name)]));
  const usedEvents = new Set<CalendarEvent>();
  const rows: RosterRow[] = unique.filter(p => !coveredByNamed(p)).sort((a, b) => Number(!!a.group) - Number(!!b.group)).map(p => {
    const mine = sick.find(h => hasToken(h.personName, p.tokens));
    if (mine) claimed.add(mine.uuid);
    const event = soon.find(e => !usedEvents.has(e) && hasToken(e.title, p.tokens));
    const { name, birthday, quiet } = p;
    if (event && !mine) usedEvents.add(event);

    let signal: RosterSignal;
    if (mine) {
      signal = { kind: 'sick', rank: 0, label: `${mine.symptom} · day ${mine.daysActive}`, action: 'Feeling better?', ask: '', healthUuid: mine.uuid };
    } else if (birthday !== null && birthday <= BIRTHDAY_WINDOW_DAYS) {
      const when = birthday === 0 ? 'Birthday today' : birthday === 1 ? 'Birthday tomorrow' : `Birthday in ${birthday} days`;
      signal = { kind: 'birthday', rank: birthday <= 3 ? 1 : 4, label: when, action: 'Plan something', ask: `${name}'s birthday is ${birthday === 0 ? 'today' : `in ${birthday} days`}. Help me plan something for ${name}.` };
    } else if (event) {
      signal = { kind: 'calendar', rank: 2, label: `${eventWhat(event.title, [...p.tokens, ...name.split(/\s+/)])} ${whenWords(event, now)}`, action: 'Talk it through', ask: `I have "${event.title}" coming up that involves ${name}. Help me prepare.` };
    } else if (quiet !== null && quiet > STALE_DAYS * DAY) {
      signal = { kind: 'stale', rank: 3, label: `Not updated in ${SINCE(quiet)}`, action: 'Update', ask: `It's been a while since I updated you about ${name}. Ask me how ${name} is doing.` };
    } else if (p.thin) {
      signal = { kind: 'sparse', rank: 5, label: 'Athena barely knows them', action: 'Tell her more', ask: `Let me tell you more about ${name}. Ask me what you should know.` };
    } else if (!p.relation && !p.group) {
      signal = { kind: 'sparse', rank: 5, label: 'How are they related to you?', action: 'Tell her', ask: `I haven't told you how ${name} is related to me. Ask me, and remember it.` };
    } else if (birthday === null && p.missing) {
      signal = { kind: 'sparse', rank: 5, label: 'No birthday on file', action: 'Add it', ask: p.missing };
    } else {
      signal = { kind: 'ok', rank: 6, label: quiet === null ? p.detail : `Updated ${SINCE(quiet)} ago`, action: 'Check in', ask: `How is ${name} doing? Ask me for an update so you stay current.` };
    }
    return { id: p.id, name, initial: name.slice(0, 1) || '?', detail: p.detail, relation: p.relation && p.relation.toLowerCase() !== name.toLowerCase() ? p.relation : undefined, photoUrl: p.photoUrl, signal };
  });

  // Someone reported unwell who Athena has no memory of still gets a row.
  for (const h of sick) {
    if (claimed.has(h.uuid)) continue;
    rows.push({
      id: h.uuid, name: h.personName, initial: h.personName.slice(0, 1).toUpperCase() || '?', detail: h.notes || '',
      signal: { kind: 'sick', rank: 0, label: `${h.symptom} · day ${h.daysActive}`, action: 'Feeling better?', ask: '', healthUuid: h.uuid },
    });
  }

  return rows.sort((a, b) => a.signal.rank - b.signal.rank || a.name.localeCompare(b.name));
}
