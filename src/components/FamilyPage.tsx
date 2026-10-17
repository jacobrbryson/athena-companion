import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarEvent, FamilyChild, FamilyHealthStatus } from '../api/dashboard';
import { actionsApi } from '../api/companion';
import type { ApiError } from '../api/client';
import { Icon } from './HealthPage';
import { AREA, SPORTS, areaOf, clock, iconOf, zonedDay } from './CalendarPage';
import type { RosterRow } from './familyRoster';
import { PageHeader } from './PageHeader';
import './health.css';
import './calendar.css';
import './family.css';

/**
 * The Family page (redesigned 2026-10-14 from the owner's concept): a hero
 * with Athena's take on the family's week, four numbers, today's chores and
 * the family's day, the people as cards, what's coming up, then kids, pets
 * and birthdays. The editable list of people stays below it (Dashboard.tsx).
 *
 * Athena's take is written here, in code, from what's on the page — never by
 * a model — so it can only say what the calendar, the health reports and the
 * birthdays already say.
 */

type Chore = { id?: string | null; title: string; completed: boolean; status: string | null; dueDate: string | null };
interface Props {
  roster: RosterRow[];
  children: FamilyChild[];
  events: CalendarEvent[];
  timeZone?: string;
  now: number;
  chores: Chore[];
  household?: string | null;
  /** The Family Chores site, for "View all"; no link without one. */
  choresUrl?: string | null;
  /** The Family Chores token can mark chores done (write:chores). */
  canCompleteChores?: boolean;
  /** Where to reconnect when it can't; shown instead of the checkboxes. */
  choresReconnectUrl?: string | null;
  /** Why chores can't be read, with its fix button; null when they can. */
  choresNote: ReactNode;
  /** Why the calendar can't be read; null when it can. */
  calendarNote: ReactNode;
  health: { label: string; tone: string; note: string };
  sick: FamilyHealthStatus[];
  onAsk: (text: string) => void;
  onCalendar: () => void;
  /** Scroll to the editable list, where reports are resolved and people edited. */
  onDetails: () => void;
}

const CORE = /^(spouse|wife|husband|partner|son|daughter|child|pet)$/i;
const KIDS = /^(son|daughter|child)$/i;
const DAY = 86400000;
const monthDay = (d: Date) => ({ mon: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(), day: d.getDate() });
const firstWord = (name: string) => name.trim().split(/\s+/)[0].toLowerCase();
const mentions = (title: string, name: string) => new RegExp(`\\b${firstWord(name).replace(/[^a-z'-]/g, '')}\\b`, 'i').test(title);
function ageOf(birthday: string | null, now: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday || '');
  if (!m) return null;
  const d = new Date(now), age = d.getFullYear() - Number(m[1]) - (d.getMonth() + 1 < Number(m[2]) || (d.getMonth() + 1 === Number(m[2]) && d.getDate() < Number(m[3])) ? 1 : 0);
  return age >= 0 && age < 120 ? age : null;
}
function joinWords(words: string[]) {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** How long the snackbar (and its Undo) stays up before a ticked chore leaves the list. */
const SNACK_MS = 6000;
type Snack = { id: string; title: string; kind: 'done' | 'undone' | 'error'; text: string; reconnect?: boolean };

/**
 * Ticking chores off the Family page (2026-10-14). A tick runs the
 * complete_chore action in core_api — the click is the approval, recorded and
 * audited there — and shows at once (optimistic), rolling back if Family
 * Chores refuses. A snackbar offers Undo for a few seconds (undo_complete_chore,
 * the app's own undo: coins come back out); when it closes the row fades away.
 *
 * Done chores are not listed — they count toward done/total, but the list is
 * what's left — except one just ticked, which stays until its snackbar goes.
 */
function useChoreTicks(chores: Chore[]) {
  // Our own view of a chore until the dashboard's next read agrees with it.
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [lingering, setLingering] = useState<Record<string, 'shown' | 'leaving'>>({});
  const [snack, setSnack] = useState<Snack | null>(null);
  const timers = useRef<number[]>([]);
  const snackTimer = useRef<number | null>(null);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (snackTimer.current) clearTimeout(snackTimer.current);
  }, []);
  // Forget an override once the server says the same thing.
  useEffect(() => {
    setOverride(prev => {
      const next = { ...prev };
      let changed = false;
      for (const c of chores) if (c.id && c.id in next && next[c.id] === c.completed) { delete next[c.id]; changed = true; }
      return changed ? next : prev;
    });
  }, [chores]);

  const live = chores.map(c => (c.id && c.id in override ? { ...c, completed: override[c.id], status: override[c.id] ? 'Completed' : 'Open' } : c));
  const drop = <T,>(rec: Record<string, T>, id: string) => { const next = { ...rec }; delete next[id]; return next; };
  const showSnack = (next: Snack | null, ms = SNACK_MS) => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack(next);
    snackTimer.current = next ? window.setTimeout(() => {
      setSnack(null);
      // A tick nobody undid: fade the row, then drop it.
      if (next.kind === 'done') {
        setLingering(prev => ({ ...prev, [next.id]: 'leaving' }));
        timers.current.push(window.setTimeout(() => setLingering(prev => drop(prev, next.id)), 400));
      }
    }, ms) : null;
  };
  const failure = (id: string, title: string, err: unknown, what: 'done' | 'undo'): Snack => {
    const e = err as ApiError;
    const reconnect = e?.code === 'family_chores_reconnect' || e?.code === 'unavailable';
    const tried = what === 'done' ? `mark “${title}” done` : `undo “${title}”`;
    const text = reconnect
      ? `Couldn’t ${tried} — Family Chores needs reconnecting.`
      : `Couldn’t ${tried}${e?.message ? `: ${e.message}` : '.'}`;
    return { id, title, kind: 'error', reconnect, text };
  };

  async function tick(c: Chore) {
    const id = c.id;
    if (!id || busy[id] || c.completed) return;
    setBusy(b => ({ ...b, [id]: true }));
    setOverride(o => ({ ...o, [id]: true }));
    setLingering(l => ({ ...l, [id]: 'shown' }));
    try {
      await actionsApi.perform('complete_chore', { chore_id: id });
      showSnack({ id, title: c.title, kind: 'done', text: `“${c.title}” done` });
    } catch (err) {
      setOverride(o => ({ ...o, [id]: false }));
      setLingering(l => drop(l, id));
      showSnack(failure(id, c.title, err, 'done'));
    } finally {
      setBusy(b => drop(b, id));
    }
  }

  async function undo() {
    if (!snack || snack.kind !== 'done') return;
    const { id, title } = snack;
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack(null);
    setBusy(b => ({ ...b, [id]: true }));
    setOverride(o => ({ ...o, [id]: false }));
    try {
      await actionsApi.perform('undo_complete_chore', { chore_id: id });
      setLingering(l => drop(l, id));
      showSnack({ id, title, kind: 'undone', text: `“${title}” is open again` }, 3000);
    } catch (err) {
      // Still done at Family Chores: show it so, and let it leave as a tick would.
      setOverride(o => ({ ...o, [id]: true }));
      showSnack({ ...failure(id, title, err, 'undo'), kind: 'done' });
    } finally {
      setBusy(b => drop(b, id));
    }
  }

  const listed = live.filter(c => !c.completed || (c.id && lingering[c.id]));
  return { live, listed, busy, lingering, snack, tick, undo, dismiss: () => showSnack(null) };
}

function ChoreSnackbar({ snack, reconnectUrl, onUndo, onDismiss }: { snack: Snack | null; reconnectUrl?: string | null; onUndo: () => void; onDismiss: () => void }) {
  if (!snack) return null;
  return <div className={`fp-snack${snack.kind === 'error' ? ' fp-snack-error' : ''}`} role="status" aria-live="polite">
    <span>{snack.text}</span>
    {snack.kind === 'done' && !snack.reconnect && <button type="button" onClick={onUndo}>Undo</button>}
    {snack.reconnect && reconnectUrl && <a href={reconnectUrl} target="_blank" rel="noopener noreferrer">Reconnect</a>}
    <button type="button" className="fp-snack-x" aria-label="Dismiss" onClick={onDismiss}>×</button>
  </div>;
}

function Avatar({ name, photoUrl, size }: { name: string; photoUrl?: string | null; size: 'lg' | 'sm' }) {
  const [broken, setBroken] = useState(false);
  return <span className={`fp-avatar fp-avatar-${size}`} aria-hidden="true">
    {photoUrl && !broken ? <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : name.replace(/^the\s+/i, '').slice(0, 1).toUpperCase()}
  </span>;
}

export function FamilyOverview({ roster, children, events, timeZone, now, chores: choresIn, household, choresUrl, canCompleteChores, choresReconnectUrl, choresNote, calendarNote, health, sick, onAsk, onCalendar, onDetails }: Props) {
  const ticks = useChoreTicks(choresIn);
  const chores = ticks.live;
  const today = zonedDay(new Date(now), timeZone);
  const names = roster.filter(r => r.relation !== 'Pet').map(r => r.name);
  const namesPattern = names.length ? new RegExp(`\\b(${names.map(firstWord).filter(w => w.length > 2).join('|')})\\b`, 'i') : null;
  const timed = (e: CalendarEvent) => !e.allDay;
  const dayOf = (e: CalendarEvent) => (e.allDay ? e.start.slice(0, 10) : zonedDay(new Date(e.start), timeZone));
  const withArea = events.map(e => ({ e, area: areaOf(e, namesPattern) }));
  const family = withArea.filter(r => r.area !== 'work');
  const todayRows = withArea.filter(r => dayOf(r.e) === today).sort((a, b) => Number(b.e.allDay) - Number(a.e.allDay) || a.e.start.localeCompare(b.e.start));
  const nextFamily = family.filter(r => timed(r.e) && Date.parse(r.e.end) > now).sort((a, b) => a.e.start.localeCompare(b.e.start))[0];
  const upcoming = family.filter(r => dayOf(r.e) > today).sort((a, b) => a.e.start.localeCompare(b.e.start));
  const choresDone = chores.filter(c => c.completed).length;

  // --- Athena's take: only what the page already shows ----------------------
  const activities = [...new Set(family.flatMap(r => (r.e.title.match(new RegExp(SPORTS.source, 'gi')) || []).map(w => w.toLowerCase())).filter(w => !/^(practice|game|race)$/.test(w)))];
  const school = family.some(r => /\bschool\b/i.test(r.e.title));
  const busy = [...activities, ...(school ? ['school'] : [])].slice(0, 3).map(w => w.replace(/^(\d+)k$/, '$1K'));
  const clash = (() => {
    const list = family.filter(r => timed(r.e)).sort((a, b) => a.e.start.localeCompare(b.e.start));
    for (let i = 1; i < list.length; i++) if (Date.parse(list[i].e.start) < Date.parse(list[i - 1].e.end)) return [list[i - 1].e, list[i].e];
    return null;
  })();
  const birthdaySoon = roster.filter(r => r.birthday != null && r.birthday <= 14).sort((a, b) => a.birthday! - b.birthday!)[0];
  const take = [
    family.length ? `${family.length} family thing${family.length === 1 ? '' : 's'} on the calendar this week${busy.length ? ` — ${joinWords(busy)}` : ''}.` : 'A quiet week on the family calendar.',
    sick.length ? `${joinWords(sick.map(s => s.personName))} ${sick.length === 1 ? 'is' : 'are'} under the weather.` : 'No one’s reported unwell.',
    birthdaySoon ? `${birthdaySoon.name}’s birthday is ${birthdaySoon.birthday === 0 ? 'today' : birthdaySoon.birthday === 1 ? 'tomorrow' : `in ${birthdaySoon.birthday} days`}.` : null,
    clash ? `${clash[0].title} and ${clash[1].title} overlap on ${new Date(clash[1].start).toLocaleDateString(undefined, { timeZone, weekday: 'long' })}.` : family.length ? 'No clashes that I can see.' : null,
  ].filter(Boolean) as string[];

  // --- People ---------------------------------------------------------------
  const isCore = (r: RosterRow) => CORE.test(r.relation || '') || children.some(c => firstWord(c.name) === firstWord(r.name));
  const core = roster.filter(isCore);
  const big = (core.length ? core : roster).slice(0, 4);
  const rest = roster.filter(r => !big.includes(r));
  const kidOf = (r: RosterRow) => children.find(c => firstWord(c.name) === firstWord(r.name));
  const tagsOf = (name: string) => [...new Set(events.filter(e => mentions(e.title, name)).flatMap(e => (e.title.match(new RegExp(SPORTS.source, 'gi')) || [])).map(w => w.toLowerCase()).filter(w => !/^(practice|game|race)$/.test(w)))].map(w => w[0].toUpperCase() + w.slice(1));
  const todayFor = (name: string) => todayRows.find(r => !r.e.allDay && mentions(r.e.title, name));
  const lineOf = (r: RosterRow) => {
    const kid = kidOf(r);
    const age = kid ? ageOf(kid.birthday, now) : null;
    if (kid) return [age != null ? `Age ${age}` : null, kid.grade ? `Grade ${kid.grade}` : null].filter(Boolean).join(' · ') || r.detail;
    return r.detail.split(/[;.]/)[0];
  };
  const statusOf = (r: RosterRow): { tone: string; icon: string; text: string } => {
    if (r.signal.kind === 'sick') return { tone: 'fp-bad', icon: 'heart', text: r.signal.label };
    const now_ = todayFor(r.name);
    if (now_) return { tone: 'fp-good', icon: 'clock', text: `${now_.e.title.replace(new RegExp(`\\b${firstWord(r.name)}('s)?\\b`, 'i'), '').trim()} ${clock(now_.e.start, timeZone)}` };
    if (r.signal.kind === 'birthday') return { tone: 'fp-warn', icon: 'cake', text: r.signal.label };
    if (r.relation === 'Pet') return { tone: 'fp-good', icon: 'check', text: 'Good' };
    if (r.signal.kind === 'calendar') return { tone: 'fp-info', icon: 'calendar', text: r.signal.label };
    return { tone: 'fp-idle', icon: 'minus', text: 'No events today' };
  };
  const press = (r: RosterRow) => (r.signal.kind === 'sick' ? onDetails() : onAsk(r.signal.ask));

  const kids = roster.filter(r => KIDS.test(r.relation || '') || kidOf(r));
  const pets = roster.filter(r => r.relation === 'Pet');
  // Birthdays: remembered people with a known date, then calendar events that are birthdays.
  const birthdays = [
    ...roster.filter(r => r.birthday != null).map(r => ({ key: r.id, name: r.name, at: new Date(now + r.birthday! * DAY), ask: `${r.name}'s birthday is coming up. Help me plan something.` })),
    ...events.filter(e => /birthday|bday/i.test(e.title) && !roster.some(r => r.birthday != null && mentions(e.title, r.name)))
      .map(e => ({ key: `${e.id}-${e.start}`, name: e.title.replace(/[’']s birthday|birthday( party)?/i, '').trim() || e.title, at: new Date(e.allDay ? `${e.start.slice(0, 10)}T12:00:00` : e.start), ask: `"${e.title}" is coming up. Help me plan for it.` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const tone = (area: keyof typeof AREA) => ({ '--cp-tone': AREA[area].color } as CSSProperties);

  return <div className="hp cp fp">
    <PageHeader eyebrow="THE PEOPLE IN YOUR CORNER" title="Family" blurb="People, plans, chores, and the moments that matter most."
      backdrop="/assets/family.png" backdropBeside
      take={{ lines: [take.join(' ')], ask: 'Help me think about my family this week — what should I be paying attention to?', onAsk }} />

    <section className="cp-stats" aria-label="Your family at a glance">
      <button type="button" className="hp-tile cp-stat" onClick={onDetails}>
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="people" /></span>
        <div><span>People remembered</span><strong>{roster.length}</strong><small>from your memories</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <div className="hp-tile cp-stat">
        <span className="hp-badge hp-badge-lg hp-green"><Icon name="check" /></span>
        <div><span>Chores today</span><strong>{chores.length ? `${choresDone}/${chores.length}` : '—'}</strong><small>{choresNote ? 'Family Chores unavailable' : chores.length ? (choresDone === chores.length ? 'All done' : `${chores.length - choresDone} still open`) : 'Nothing for today'}</small></div>
      </div>
      <button type="button" className="hp-tile cp-stat" onClick={onCalendar}>
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="calendar" /></span>
        <div><span>Next family event</span><strong>{nextFamily ? clock(nextFamily.e.start, timeZone) : '—'}</strong><small>{nextFamily ? `${nextFamily.e.title}${dayOf(nextFamily.e) !== today ? ` · ${new Date(nextFamily.e.start).toLocaleDateString(undefined, { timeZone, weekday: 'short' })}` : ''}` : calendarNote ? 'Calendar unavailable' : 'Nothing coming up'}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={onDetails}>
        <span className="hp-badge hp-badge-lg hp-red"><Icon name="heart" /></span>
        <div><span>Family Health</span><strong className={`fp-health-${health.tone}`}>{health.label}</strong><small>{health.note}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
    </section>

    <div className="fp-grid">
      <section className="hp-panel fp-chores">
        <header><h2>Chores <span>{household || ''}</span></h2>{choresUrl
          ? <a className="hp-link" href={choresUrl} target="_blank" rel="noopener noreferrer">View all <Icon name="arrowRight" /></a>
          : <span>Today</span>}</header>
        {choresNote ? choresNote
          : !chores.length ? <div className="fp-empty-hero">
            <Icon name="check" className="fp-empty-icon" />
            <strong>No chores for today!</strong>
            <p>Enjoy the day. Chores set in Family Chores show up here.</p>
          </div>
            : <>
              <div className="hp-bar"><i style={{ width: `${(choresDone / chores.length) * 100}%` }} /></div>
              {!canCompleteChores && choresReconnectUrl && choresDone < chores.length && <p className="fp-chore-reconnect">
                To tick chores off here, <a href={choresReconnectUrl} target="_blank" rel="noopener noreferrer">reconnect Athena in Family Chores</a>. The current link can only read.
              </p>}
              {!ticks.listed.length ? <p className="hp-empty">All done for today.</p>
                : <ul className="fp-chore-list">{ticks.listed.map((c, i) => {
                  const leaving = !!(c.id && ticks.lingering[c.id] === 'leaving');
                  const busy = !!(c.id && ticks.busy[c.id]);
                  return <li key={c.id || i} className={[c.completed ? 'fp-done' : '', leaving ? 'fp-leaving' : ''].filter(Boolean).join(' ') || undefined}>
                    {canCompleteChores && c.id
                      ? <button type="button" role="checkbox" aria-checked={c.completed} aria-label={`Mark “${c.title}” done`} disabled={c.completed || busy}
                        className={`fp-check fp-check-btn${c.completed ? ' fp-on' : ''}`} onClick={() => ticks.tick(c)}>{c.completed && <Icon name="check" />}</button>
                      : <span className={`fp-check${c.completed ? ' fp-on' : ''}`} aria-hidden="true">{c.completed && <Icon name="check" />}</span>}
                    <div><strong>{c.title}</strong><small>{c.completed ? 'Completed' : c.status || 'Open'}{c.dueDate ? ` · due ${new Date(`${c.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</small></div>
                  </li>;
                })}</ul>}
              <ChoreSnackbar snack={ticks.snack} reconnectUrl={choresReconnectUrl} onUndo={ticks.undo} onDismiss={ticks.dismiss} />
            </>}
      </section>

      <section className="hp-panel fp-today">
        <header><h2>Family Today</h2><button type="button" className="hp-link" onClick={onCalendar}>View calendar <Icon name="arrowRight" /></button></header>
        {calendarNote ? calendarNote
          : !todayRows.length ? <p className="hp-empty">Nothing on the calendar today.</p>
            : <><ul className="fp-day">{todayRows.slice(0, 9).map(({ e, area }, i) => <li key={`${e.id}-${i}`} style={tone(area)} className={timed(e) && Date.parse(e.end) <= now ? 'cp-past' : undefined}>
              <time>{e.allDay ? 'All day' : clock(e.start, timeZone)}</time>
              <Icon name={iconOf(e, area)} /><span>{e.title}</span>
            </li>)}</ul>
              <button type="button" className="cp-outline fp-wide" onClick={onCalendar}>View full day ({todayRows.length} event{todayRows.length === 1 ? '' : 's'}) <Icon name="arrowRight" /></button></>}
      </section>

      <section className="hp-panel fp-members">
        <header><h2>Family Members</h2><button type="button" className="hp-link" onClick={onDetails}>View all <Icon name="arrowRight" /></button></header>
        {!roster.length ? <div className="fp-empty-hero"><strong>No one here yet</strong><p>Tell me about your family and I’ll keep them in mind.</p><button type="button" className="cp-outline" onClick={() => onAsk('Let me tell you about my family.')}>Tell Athena <Icon name="arrowRight" /></button></div>
          : <>
            <ul className="fp-cards">{big.map(r => {
              const s = statusOf(r);
              return <li key={r.id}><button type="button" onClick={() => press(r)}>
                <Avatar name={r.name} photoUrl={r.photoUrl} size="lg" />
                <strong>{r.name}<Icon name="chevron" className="hp-chev" /></strong>
                <small>{r.relation || 'Family'}</small>
                <small>{lineOf(r) || ' '}</small>
                <em className={s.tone}><Icon name={s.icon} />{s.text}</em>
              </button></li>;
            })}</ul>
            {rest.length > 0 && <ul className="fp-chips">{rest.slice(0, 5).map(r => <li key={r.id}><button type="button" onClick={() => press(r)} title={r.signal.label}>
              <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" /><span>{r.name}</span>
            </button></li>)}
              {rest.length > 5 && <li><button type="button" onClick={onDetails}><span className="fp-avatar fp-avatar-sm fp-more"><Icon name="people" /></span><span className="fp-link">+{rest.length - 5} more</span></button></li>}
            </ul>}
          </>}
      </section>

      <section className="hp-panel fp-upcoming">
        <header><h2>Upcoming <span>(Family)</span></h2><button type="button" className="hp-link" onClick={onCalendar}>View all <Icon name="arrowRight" /></button></header>
        {calendarNote ? calendarNote
          : !upcoming.length ? <p className="hp-empty">Nothing else for the family this week.</p>
            : <ul className="fp-dated">{upcoming.slice(0, 4).map(({ e, area }, i) => {
              const d = monthDay(new Date(e.allDay ? `${e.start.slice(0, 10)}T12:00:00` : e.start));
              return <li key={`${e.id}-${i}`} style={tone(area)}>
                <span className="fp-date"><small>{d.mon}</small>{d.day}</span>
                <Icon name={/birthday/i.test(e.title) ? 'cake' : iconOf(e, area)} className="fp-dated-icon" />
                <div><strong>{e.title}</strong><small>{e.allDay ? 'All day' : clock(e.start, timeZone)}</small></div>
              </li>;
            })}</ul>}
        {upcoming.length > 4 && <button type="button" className="cp-outline fp-wide" onClick={onCalendar}>{upcoming.length - 4} more this week <Icon name="arrowRight" /></button>}
      </section>
    </div>

    <div className="cp-bottom">
      <section className="hp-panel fp-list">
        <header><h2>Kids</h2></header>
        {!kids.length ? <p className="hp-empty">No children on file yet.</p>
          : <ul>{kids.map(r => {
            const tags = tagsOf(r.name);
            return <li key={r.id}><button type="button" onClick={() => press(r)}>
              <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" />
              <div><strong>{r.name}</strong><small>{lineOf(r) || r.relation}</small></div>
              <span className="fp-tags">{tags.slice(0, 2).map((t, i) => <i key={t} className={i ? 'fp-tag-alt' : undefined}>{t}</i>)}</span>
              <Icon name="chevron" className="hp-chev" />
            </button></li>;
          })}</ul>}
      </section>

      <section className="hp-panel fp-list">
        <header><h2>Pets</h2></header>
        {!pets.length ? <p className="hp-empty">No pets on file.</p>
          : <ul>{pets.map(r => {
            const unwell = r.signal.kind === 'sick';
            return <li key={r.id}><button type="button" onClick={() => press(r)}>
              <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" />
              <div><strong>{r.name}</strong><small>{r.detail.split(/[;.]/)[0] || 'Pet'}</small></div>
              <em className={`fp-pill ${unwell ? 'fp-bad' : 'fp-good'}`}><Icon name={unwell ? 'heart' : 'check'} />{unwell ? r.signal.label : 'Good'}</em>
            </button></li>;
          })}</ul>}
      </section>

      <section className="hp-panel fp-list">
        <header><h2>Birthdays</h2></header>
        {!birthdays.length ? <p className="hp-empty">No birthdays on file. Tell me one and I’ll remember it.</p>
          : <ul className="fp-dated">{birthdays.slice(0, 4).map(b => {
            const d = monthDay(b.at);
            return <li key={b.key}><button type="button" onClick={() => onAsk(b.ask)}>
              <span className="fp-date"><small>{d.mon}</small>{d.day}</span>
              <Icon name="cake" className="fp-dated-icon fp-pink" />
              <div><strong>{b.name}</strong></div>
              <Icon name="chevron" className="hp-chev" />
            </button></li>;
          })}</ul>}
      </section>
    </div>
  </div>;
}
