import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CalendarEvent, FamilyChild, FamilyHealthStatus, GroceryList } from '../api/dashboard';
import { actionsApi } from '../api/companion';
import type { ApiError } from '../api/client';
import { Icon } from './HealthPage';
import { AREA, areaOf, clock, iconOf, zonedDay } from './CalendarPage';
import type { RosterRow } from './familyRoster';
import './health.css';
import './calendar.css';
import './family.css';

/**
 * The Family page (reworked 2026-11-18 from the owner's concept): the family
 * tabs, a compact head with today's three numbers (events, chores, health
 * alerts), the family's day beside the chores, the people beside what's coming
 * up, then Provisions, pets and birthdays. The grocery list moved to its own
 * Provisions tab (FamilyProvisions.tsx). The editable memory list opens in a
 * drawer (Dashboard.tsx).
 */

type Chore = { id?: string | null; title: string; completed: boolean; status: string | null; dueDate: string | null };

interface Props {
  tabs?: ReactNode;
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
  /** Shared Google Keep food lists (connectors/googleKeep), summed up on the Provisions card. */
  groceries: GroceryList[];
  /** Why the list can't be read; the card then just says so. */
  groceriesNote: ReactNode;
  health: { label: string; tone: string; note: string };
  sick: FamilyHealthStatus[];
  onAsk: (text: string) => void;
  onCalendar: () => void;
  /** Family → Provisions, where the grocery list lives now. */
  onProvisions: () => void;
  /** Open the editable family memories drawer. */
  onDetails: () => void;
  onMember: (row: RosterRow) => void;
}

const CORE = /^(spouse|wife|husband|partner|son|daughter|child|pet)$/i;
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
  useEffect(() => setBroken(false), [photoUrl]);
  return <span className={`fp-avatar fp-avatar-${size}`} aria-hidden="true">
    {photoUrl && !broken ? <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : name.replace(/^the\s+/i, '').slice(0, 1).toUpperCase()}
  </span>;
}


/** A panel's head in the concept: a round icon, the title (and a line under it), its link. */
function PanelHead({ icon, tone, title, sub, children }: { icon: string; tone: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return <header className="fp-panel-head">
    <span className={`hp-badge hp-badge-lg ${tone}`}><Icon name={icon} /></span>
    <div className="fp-titles"><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
    {children}
  </header>;
}

/** Pet chores get a paw, garden chores a sprout, the rest the house. */
const choreIcon = (title: string) => /(walk|feed|dog|cat|pet|litter|vet)/i.test(title) ? 'paw' : /water|plant|herb|garden|flower|hibiscus|lawn|mow|weed|seed|prune/i.test(title) ? 'sprout' : 'home';
const due = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function lengthOf(e: CalendarEvent) {
  const min = Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000);
  if (!(min > 0) || min >= 12 * 60) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

export function FamilyOverview({ tabs, roster, children, events, timeZone, now, chores: choresIn, household, choresUrl, canCompleteChores, choresReconnectUrl, choresNote, calendarNote, groceries, groceriesNote, health, sick, onAsk, onCalendar, onProvisions, onDetails, onMember }: Props) {
  const ticks = useChoreTicks(choresIn);
  const chores = ticks.live;
  const today = zonedDay(new Date(now), timeZone);
  const names = roster.filter(r => !r.isPet && r.relation !== 'Pet').map(r => r.name);
  const namesPattern = names.length ? new RegExp(`\\b(${names.map(firstWord).filter(w => w.length > 2).join('|')})\\b`, 'i') : null;
  const timed = (e: CalendarEvent) => !e.allDay;
  const dayOf = (e: CalendarEvent) => (e.allDay ? e.start.slice(0, 10) : zonedDay(new Date(e.start), timeZone));
  const family = events.map(e => ({ e, area: areaOf(e, namesPattern) })).filter(r => r.area !== 'work');
  const todayRows = family.filter(r => dayOf(r.e) === today).sort((a, b) => Number(b.e.allDay) - Number(a.e.allDay) || a.e.start.localeCompare(b.e.start));
  // The one to look at: what's on now, or next today.
  const current = todayRows.find(r => timed(r.e) && Date.parse(r.e.end) > now);
  const upcoming = family.filter(r => dayOf(r.e) > today).sort((a, b) => a.e.start.localeCompare(b.e.start));
  const choresDone = chores.filter(c => c.completed).length;
  const choresOpen = chores.length - choresDone;

  // --- People ---------------------------------------------------------------
  const isCore = (r: RosterRow) => CORE.test(r.relation || '') || children.some(c => firstWord(c.name) === firstWord(r.name));
  const core = roster.filter(isCore);
  const big = (core.length ? core : roster).slice(0, 4);
  const rest = roster.filter(r => !big.includes(r));
  const kidOf = (r: RosterRow) => children.find(c => firstWord(c.name) === firstWord(r.name));
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
    if (r.isPet || r.relation === 'Pet') return { tone: 'fp-good', icon: 'check', text: 'Good' };
    if (r.signal.kind === 'calendar') return { tone: 'fp-info', icon: 'calendar', text: r.signal.label };
    return { tone: 'fp-idle', icon: 'minus', text: 'No events today' };
  };
  const press = (r: RosterRow) => onMember(r);

  const pets = roster.filter(r => r.isPet || r.relation === 'Pet');
  // Birthdays: remembered people with a known date, then calendar events that are birthdays.
  const birthdays = [
    // Count calendar days, not 24-hour blocks: across the November clock change, now + n*DAY lands an hour short — the day before, just after midnight.
    ...roster.filter(r => r.birthday != null).map(r => ({ key: r.id, name: r.name, at: (d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + r.birthday!, 12))(new Date(now)), ask: `${r.name}'s birthday is coming up. Help me plan something.` })),
    ...events.filter(e => /birthday|bday/i.test(e.title) && !roster.some(r => r.birthday != null && mentions(e.title, r.name)))
      .map(e => ({ key: `${e.id}-${e.start}`, name: e.title.replace(/[’']s birthday|birthday( party)?/i, '').trim() || e.title, at: new Date(e.allDay ? `${e.start.slice(0, 10)}T12:00:00` : e.start), ask: `"${e.title}" is coming up. Help me plan for it.` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const tone = (area: keyof typeof AREA) => ({ '--cp-tone': AREA[area].color } as CSSProperties);
  const outOf = groceries.flatMap(l => l.toBuy);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

  return <div className="hp cp fp">
    {tabs}

    <section className="hp-panel fp-top" aria-label="Your family today">
      <div className="fp-top-title">
        <span className="hp-badge fp-top-badge hp-green"><Icon name="people" /></span>
        <div><h1>Family</h1><p>People · Plans · Home · Care</p></div>
      </div>
      <button type="button" className="fp-top-stat" onClick={onCalendar}>
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="calendar" /></span>
        <span><strong>{calendarNote ? 'Calendar' : `${plural(todayRows.length, 'Event')} Today`}</strong>
          <small>{calendarNote ? 'Unavailable' : current ? `${current.e.title} • ${clock(current.e.start, timeZone)}` : todayRows.length ? 'All done for today' : 'Nothing on the calendar'}</small></span>
      </button>
      <a className="fp-top-stat" href={choresUrl || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!choresUrl || undefined}>
        <span className="hp-badge hp-badge-lg hp-green"><Icon name="check" /></span>
        <span><strong>{choresNote ? 'Chores' : `${choresDone} / ${chores.length} Chores`}</strong>
          <small>{choresNote ? 'Family Chores unavailable' : !chores.length ? 'Nothing for today' : choresOpen ? `${choresOpen} still open` : 'All done'}</small></span>
      </a>
      <button type="button" className="fp-top-stat" onClick={onDetails}>
        <span className={`hp-badge hp-badge-lg ${sick.length ? 'hp-red' : 'hp-green'}`}><Icon name="heart" /></span>
        <span><strong>{plural(sick.length, 'Alert')}</strong>
          <small>{sick.length ? 'Health watch' : health.note || 'Everyone’s well'}</small></span>
      </button>
    </section>

    <div className="fp-row fp-row-1">
      <section className="hp-panel fp-today">
        <PanelHead icon="calendar" tone="hp-blue" title="Family Today" sub="Today’s plan for the family">
          <button type="button" className="hp-link" onClick={onCalendar}>View calendar <Icon name="arrowRight" /></button>
        </PanelHead>
        {calendarNote ? calendarNote
          : !todayRows.length ? <p className="hp-empty">Nothing on the family calendar today.</p>
            : <><ol className="fp-timeline">{todayRows.slice(0, 6).map(({ e, area }, i) => {
              const length = timed(e) ? lengthOf(e) : null;
              const sub = [e.location, length].filter(Boolean).join(' • ');
              const cls = [current?.e === e ? 'fp-now' : '', timed(e) && Date.parse(e.end) <= now ? 'cp-past' : ''].filter(Boolean).join(' ');
              return <li key={`${e.id}-${i}`} style={tone(area)} className={cls || undefined}>
                <time>{e.allDay ? 'All day' : clock(e.start, timeZone)}</time>
                <i className="fp-dot" aria-hidden="true" />
                <Icon name={iconOf(e, area)} />
                <div><strong>{e.title}</strong>{sub && <small>{sub}</small>}</div>
              </li>;
            })}</ol>
              <button type="button" className="cp-outline fp-wide" onClick={onCalendar}><Icon name="calendar" /> View full day ({plural(todayRows.length, 'event')}) <Icon name="arrowRight" /></button></>}
      </section>

      <section className="hp-panel fp-chores">
        <PanelHead icon="check" tone="hp-green" title="Chores" sub={household || undefined}>
          {choresUrl && <a className="hp-link" href={choresUrl} target="_blank" rel="noopener noreferrer">View all <Icon name="arrowRight" /></a>}
        </PanelHead>
        {choresNote ? choresNote
          : !chores.length ? <div className="fp-empty-hero">
            <Icon name="check" className="fp-empty-icon" />
            <strong>No chores for today!</strong>
            <p>Enjoy the day. Chores set in Family Chores show up here.</p>
          </div>
            : <>
              <div className="fp-progress"><span>{choresDone} of {chores.length} complete</span><div className="hp-bar"><i style={{ width: `${(choresDone / chores.length) * 100}%` }} /></div></div>
              {!canCompleteChores && choresReconnectUrl && choresDone < chores.length && <p className="fp-chore-reconnect">
                To tick chores off here, <a href={choresReconnectUrl} target="_blank" rel="noopener noreferrer">reconnect Athena in Family Chores</a>. The current link can only read.
              </p>}
              {!ticks.listed.length ? <p className="hp-empty">All done for today.</p>
                : <ul className="fp-chore-list">{ticks.listed.map((c, i) => {
                  const leaving = !!(c.id && ticks.lingering[c.id] === 'leaving');
                  const busy = !!(c.id && ticks.busy[c.id]);
                  const icon = choreIcon(c.title);
                  return <li key={c.id || i} className={[c.completed ? 'fp-done' : '', leaving ? 'fp-leaving' : ''].filter(Boolean).join(' ') || undefined}>
                    {canCompleteChores && c.id
                      ? <button type="button" role="checkbox" aria-checked={c.completed} aria-label={`Mark “${c.title}” done`} disabled={c.completed || busy}
                        className={`fp-check fp-check-btn${c.completed ? ' fp-on' : ''}`} onClick={() => ticks.tick(c)}>{c.completed && <Icon name="check" />}</button>
                      : <span className={`fp-check${c.completed ? ' fp-on' : ''}`} aria-hidden="true">{c.completed && <Icon name="check" />}</span>}
                    <Icon name={icon} className={`fp-chore-icon fp-chore-${icon}`} />
                    <strong>{c.title}</strong>
                    <small>{c.completed ? 'Completed' : c.dueDate ? `Due ${due(c.dueDate)}` : c.status || 'Open'}</small>
                  </li>;
                })}</ul>}
              <ChoreSnackbar snack={ticks.snack} reconnectUrl={choresReconnectUrl} onUndo={ticks.undo} onDismiss={ticks.dismiss} />
            </>}
      </section>
    </div>

    <div className="fp-row fp-row-2">
      <section className="hp-panel fp-members">
        <PanelHead icon="people" tone="hp-blue" title="Family Members">
          {roster.length > 0 && <button type="button" className="hp-link" onClick={onDetails}>View all ({roster.length}) <Icon name="arrowRight" /></button>}
        </PanelHead>
        {!roster.length ? <div className="fp-empty-hero"><strong>No one here yet</strong><p>Tell me about your family and I’ll keep them in mind.</p><button type="button" className="cp-outline" onClick={() => onAsk('Let me tell you about my family.')}>Tell Athena <Icon name="arrowRight" /></button></div>
          : <>
            <ul className="fp-cards">{big.map(r => {
              const s = statusOf(r);
              return <li key={r.id}><button type="button" onClick={() => press(r)}>
                <Avatar name={r.name} photoUrl={r.photoUrl} size="lg" />
                <strong>{r.name}<Icon name="chevron" className="hp-chev" /></strong>
                <small>{[r.relation || 'Family', lineOf(r)].filter(Boolean).join(' · ')}</small>
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
        <PanelHead icon="calendar" tone="hp-blue" title={<>Upcoming <span>(Family)</span></>}>
          <button type="button" className="hp-link" onClick={onCalendar}>View all <Icon name="arrowRight" /></button>
        </PanelHead>
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

    <div className="fp-row fp-row-3">
      <section className="hp-panel fp-provisions">
        <PanelHead icon="cart" tone="hp-green" title="Provisions" sub="Groceries · Meals · Supplies" />
        <div className="fp-provisions-body">
          {groceriesNote ? <p className="hp-empty">The grocery list can’t be read right now.</p>
            : !groceries.length ? <p className="hp-empty">No grocery list shared yet.</p>
              : outOf.length ? <><small className="fp-groceries-label">Out of {outOf.length === 1 ? '1 thing' : `${outOf.length} things`}</small>
                <ul className="fp-groceries-items">{outOf.slice(0, 6).map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}
                  {outOf.length > 6 && <li className="fp-groceries-more">+{outOf.length - 6} more</li>}</ul></>
                : <p className="hp-empty">Stocked up — nothing waiting to be bought.</p>}
        </div>
        <button type="button" className="cp-outline fp-wide" onClick={onProvisions}>Open Provisions <Icon name="arrowRight" /></button>
      </section>

      <section className="hp-panel fp-list fp-pets">
        <PanelHead icon="paw" tone="hp-green" title="Pets" />
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

      <section className="hp-panel fp-birthdays">
        <PanelHead icon="cake" tone="fp-badge-pink" title="Birthdays">
          {birthdays.length > 4 && <button type="button" className="hp-link" onClick={onDetails}>View all <Icon name="arrowRight" /></button>}
        </PanelHead>
        {!birthdays.length ? <p className="hp-empty">No birthdays on file. Tell me one and I’ll remember it.</p>
          : <ul className="fp-bdays">{birthdays.slice(0, 4).map(b => {
            const d = monthDay(b.at);
            return <li key={b.key}><button type="button" onClick={() => onAsk(b.ask)} title={`Plan for ${b.name}’s birthday`}>
              <small>{d.mon}</small><strong>{d.day}</strong>
              <Icon name="cake" className="fp-pink" />
              <span>{b.name}</span>
            </button></li>;
          })}</ul>}
      </section>
    </div>
  </div>;
}
