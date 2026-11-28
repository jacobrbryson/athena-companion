import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { dashboardApi, type CalendarEvent, type FamilyChild, type FamilyHealthStatus, type FamilyLink, type PersonPageData } from '../api/dashboard';
import type { Fact } from '../api/companion';
import type { RosterRow } from './familyRoster';
import { clock } from './CalendarPage';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import { SectionTabs } from './PageTabs';
import { checkInWords } from './HealthWatch';
import { loadPhotoUrl } from './photoStore';
import { PersonCollections } from './Collections';
import './health.css';
import './healthWatch.css';
import './person.css';

/**
 * A page for each person Athena knows (/family/people/<key>), opened from
 * their row on the Family page (owner's mockup, 2026-11-22).
 *
 * Most of it is what the Family page already holds, gathered for one
 * person: their memory and the details filed under it, their Google
 * Contact, child profile, calendar events and active health watches. The
 * rest comes from GET /dashboard/family/person/<key> (core_api
 * services/personPage.js): the write-up, interests and related people this
 * page stores, memory events that mention them, every health watch on them,
 * and camera sightings. Photos are the photo memories that mention them;
 * the pictures themselves only exist on the device that took them.
 *
 * Nothing is invented to fill a card. Family Chores doesn't say whose chore
 * is whose, so Chores lists only chores whose title names them and says so.
 */

type Chore = { id?: string | null; title: string; completed: boolean; status: string | null; dueDate: string | null };
type Tab = 'overview' | 'memories' | 'health' | 'activities' | 'photos' | 'details';
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'Home' },
  { id: 'memories', label: 'Memories', icon: 'Research' },
  { id: 'health', label: 'Health', icon: 'Health' },
  { id: 'activities', label: 'Activities', icon: 'StatCalendar' },
  { id: 'photos', label: 'Photos', icon: 'Dreams' },
  { id: 'details', label: 'Details', icon: 'SystemOverview' },
] as const satisfies readonly { id: Tab; label: string; icon: string }[];

/** Interest icons the server accepts, drawn with the Health page's icon set. */
const INTEREST_ICONS: Record<string, string> = {
  star: 'star', ball: 'ball', art: 'bulb', paw: 'paw', robot: 'bot', food: 'food', book: 'book', music: 'speech',
  game: 'bolt', run: 'run', bike: 'bike', leaf: 'leaf', heart: 'heart', camera: 'camera', chef: 'chef', plane: 'plane',
};
const DAY = 86_400_000;
const UPCOMING_DAYS = 30;

const words = (s: string | null | undefined) => (s || '').toLowerCase().split(/[^a-z']+/).map(w => w.replace(/'s$/, ''));
const names = (text: string | null | undefined, tokens: string[]) => { const w = words(text); return tokens.some(t => w.includes(t)); };
const shortDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const longDay = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
function ago(iso: string | null) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 14 ? `${days} days ago` : shortDay(Date.parse(iso));
}
/** 11 → "11th", 22 → "22nd". */
function ordinal(n: number) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}
/** Age in whole years from a birthday that has a year (YYYY-MM-DD); null for year-less ones. */
function ageOf(iso: string | null | undefined, now: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  const d = new Date(now);
  let age = d.getFullYear() - Number(m[1]);
  if (d.getMonth() + 1 < Number(m[2]) || (d.getMonth() + 1 === Number(m[2]) && d.getDate() < Number(m[3]))) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export interface PersonPageProps {
  row: RosterRow;
  roster: RosterRow[];
  /** Their memory, when they are one (not a child profile alone). */
  fact?: Fact;
  /** Every family memory, for the details filed under theirs. */
  facts: Fact[];
  link?: FamilyLink;
  child?: FamilyChild;
  events: CalendarEvent[];
  timeZone?: string;
  now: number;
  /** Every active health watch in the family. */
  watches: FamilyHealthStatus[];
  chores: Chore[];
  /** Why chores can't be read; null when they can. */
  choresNote: ReactNode;
  onAsk: (text: string) => void;
  onBack: () => void;
  onOpenPerson: (key: string) => void;
  onOpenWatch: (uuid: string) => void;
  onStartWatch: () => void;
  /** Open the memory editor for them (name, relation, contact, birthday). */
  onEditMemory?: () => void;
  onCalendar: () => void;
}

export function PersonPage(props: PersonPageProps) {
  const { row, roster, fact, facts, link, child, events, timeZone, now, watches, chores, choresNote, onAsk, onBack } = props;
  // The roster is rebuilt on every Dashboard render; key on the words, not the array, or every render re-reads the server.
  const tokenText = (row.tokens?.length ? row.tokens : words(row.name).filter(w => w.length >= 3)).slice(0, 4).join(',');
  const tokens = useMemo(() => tokenText.split(',').filter(Boolean), [tokenText]);
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<PersonPageData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    dashboardApi.person(row.id, tokens).then(d => { setData(d); setLoadError(''); }).catch(err => setLoadError((err as Error).message || 'Couldn’t read everything about them.'));
  }, [row.id, tokens]);
  useEffect(() => { load(); }, [load]);

  async function run(key: string, call: () => Promise<PersonPageData>) {
    setBusy(key); setError('');
    try { setData(await call()); return true; } catch (err) { setError((err as Error).message || 'That didn’t save.'); return false; } finally { setBusy(null); }
  }

  // What the Family page already knows, for this person.
  const card = link?.card || null;
  const birthdayIso = child?.birthday || card?.birthday || null;
  const age = row.isPet ? null : ageOf(birthdayIso, now);
  // The page's own grade moves up each school year; a child profile's grade is shown as it was set.
  const grade = data?.grade || child?.grade || null;
  const gradeText = data?.gradeLabel || gradeLabel(child?.grade || null);
  const relation = data?.relation || row.relation || (row.isPet ? 'Pet' : null);
  const nextBirthday = row.birthday != null ? now + row.birthday * DAY : null;
  const mine = watches.filter(w => names(w.personName, tokens));
  const keyOf = (f: Fact) => f.key.trim().toLowerCase();
  const filed = fact ? facts.filter(f => f.uuid === fact.uuid || keyOf(f).startsWith(`${keyOf(fact)} `) || keyOf(f).startsWith(`${keyOf(fact)}'s `)) : [];
  const upcoming = useMemo(() => {
    const list = events.filter(e => { const t = Date.parse(e.start); return t >= now - DAY / 2 && t <= now + UPCOMING_DAYS * DAY && names(e.title, tokens); })
      .map(e => ({ at: Date.parse(e.start), title: e.title, time: e.allDay ? null : clock(e.start, timeZone), icon: 'calendar' }));
    if (nextBirthday && nextBirthday <= now + UPCOMING_DAYS * DAY) list.push({ at: nextBirthday, title: `${row.name}’s ${age !== null ? `${ordinal(age + 1)} ` : ''}birthday`, time: null, icon: 'cake' });
    return list.sort((a, b) => a.at - b.at);
  }, [events, now, tokens, nextBirthday, row.name, age, timeZone]);
  const theirChores = chores.filter(c => names(c.title, tokens));
  const photos = (data?.memories || []).filter(m => m.kind === 'photo' && m.mediaRef);
  const photoUrl = row.photoUrl || card?.photoUrl || null;
  const about = data?.about || fact?.value || row.detail || '';

  // Athena's Take: what the roster already noticed about them, said plainly. No model call.
  const take: string[] = [];
  if (mine.length) take.push(`${row.name} is on a health watch: ${mine.map(w => w.symptom).join(', ')}.${mine.some(w => (w.checksOverdue || 0) > 0 || w.updateDue) ? ' Something is due.' : ''}`);
  const today = upcoming.find(u => new Date(u.at).toDateString() === new Date(now).toDateString() && u.icon !== 'cake');
  if (today) take.push(`${today.title}${today.time ? ` at ${today.time}` : ''} today.`);
  if (row.birthday != null && row.birthday <= 14) take.push(row.birthday === 0 ? `It’s ${row.name}’s birthday today.` : `${row.name}’s birthday is in ${row.birthday} day${row.birthday === 1 ? '' : 's'} — want to plan something?`);
  if (!take.length) take.push(row.signal.kind === 'ok' ? `Nothing needs you about ${row.name} right now.` : `${row.name}: ${row.signal.label}.`);

  const chips = <div className="pp-chips">
    {today && <span className="pp-chip"><Icon name="calendar" /> Event today</span>}
    {!today && upcoming.some(u => u.icon !== 'cake' && u.at <= now + 7 * DAY) && <span className="pp-chip"><Icon name="calendar" /> Event soon</span>}
    {row.birthday != null && row.birthday <= 14 && <span className="pp-chip pp-chip-violet"><Icon name="cake" /> Birthday</span>}
    {!row.isPet && (mine.length ? <span className="pp-chip pp-chip-bad"><Icon name="heart" /> Health watch</span> : <span className="pp-chip pp-chip-good"><Icon name="check" /> Healthy</span>)}
  </div>;

  const panels = {
    upcoming: <Panel key="upcoming" icon="calendar" title="Today & Upcoming" action={<button type="button" className="hp-link" onClick={props.onCalendar}>View calendar <Icon name="arrowRight" /></button>}>
      {!upcoming.length ? <p className="hp-empty">Nothing on the calendar names {row.name} in the next {UPCOMING_DAYS} days.</p>
        : <ol className="pp-rows">{(tab === 'overview' ? upcoming.slice(0, 4) : upcoming).map((u, i) => {
          const isToday = new Date(u.at).toDateString() === new Date(now).toDateString();
          return <li key={i} className={`pp-event${isToday ? ' pp-today' : ''}`}><span className="pp-when">{isToday ? 'Today' : shortDay(u.at)}</span><Icon name={u.icon} /><strong>{u.title}</strong>{u.time && <small>{u.time}</small>}</li>;
        })}</ol>}
    </Panel>,
    health: <Panel key="health" icon="heart" title="Health" action={tab === 'overview' ? <button type="button" className="hp-link" onClick={() => setTab('health')}>View all <Icon name="arrowRight" /></button> : undefined}>
      {!mine.length && <div className="pp-well"><span className="hp-badge hp-green"><Icon name="check" /></span><span><strong>No active health watches</strong><small>{(() => { const last = data?.health.find(h => h.status === 'resolved'); return last ? `Last one ended ${last.resolvedAt ? longDay(last.resolvedAt) : ''}` : 'None on record'; })()}</small></span></div>}
      <ul className="pp-rows">{mine.map(w => <li key={w.uuid}><button type="button" className="pp-row-btn" onClick={() => props.onOpenWatch(w.uuid)}>
        <span className={`hp-badge ${(w.checksOverdue || 0) > 0 || w.updateDue ? 'hp-amber' : 'hp-red'}`}><Icon name="heart" /></span>
        <span><strong>{w.symptom}</strong><small>{w.severity} · day {w.daysActive}{checkInWords(w) ? ` · ${checkInWords(w)}` : ''}</small></span><Icon name="chevron" />
      </button></li>)}
      {tab === 'health' && (data?.health || []).filter(h => h.status === 'resolved').map(h => <li key={h.uuid}><button type="button" className="pp-row-btn pp-past" onClick={() => props.onOpenWatch(h.uuid)}>
        <span className="hp-badge hp-green"><Icon name="check" /></span>
        <span><strong>{h.symptom}</strong><small>{h.severity} · {h.startedAt ? longDay(h.startedAt) : ''}{h.resolvedAt ? ` – ${longDay(h.resolvedAt)}` : ''}</small></span><Icon name="chevron" />
      </button></li>)}</ul>
      {!row.isPet && <button type="button" className="cp-outline pp-start" onClick={props.onStartWatch}><Icon name="plus" /> Start a health watch</button>}
    </Panel>,
    about: <AboutPanel key="about" row={row} about={about} relation={relation} grade={grade} gradeText={gradeText} age={age} nextBirthday={nextBirthday} factCount={filed.length + (data?.memories.length || 0)}
      own={data} busy={busy} onSave={payload => run('about', () => dashboardApi.savePerson(row.id, tokens, payload))} onMemories={() => setTab('memories')} />,
    memories: <Panel key="memories" icon="book" title="Memories" action={tab === 'overview' ? <button type="button" className="hp-link" onClick={() => setTab('memories')}>View all ({filed.length + (data?.memories.length || 0)}) <Icon name="arrowRight" /></button> : undefined}>
      {!data && !loadError ? <p className="hp-empty">Reading memories…</p> : <ul className="pp-rows">
        {(data?.memories || []).slice(0, tab === 'overview' ? 4 : undefined).map(m => <MemoryRow key={m.uuid} memory={m} />)}
        {(tab === 'memories' || !data?.memories.length) && filed.map(f => <li key={f.uuid} className="pp-memory"><span className="pp-memory-icon"><Icon name="user" /></span>
          <span><strong>{f.uuid === fact?.uuid ? (f.value || f.key) : `${f.key}: ${f.value || ''}`}</strong><small>{ago(f.updated_at)} · {f.source === 'ai' ? 'From conversation' : 'You told her'}</small></span></li>)}
        {!data?.memories.length && !filed.length && <li className="hp-empty">Athena doesn’t remember anything about {row.name} yet.</li>}
      </ul>}
    </Panel>,
    photos: <Panel key="photos" icon="camera" title="Photos" action={tab === 'overview' && photos.length > 4 ? <button type="button" className="hp-link" onClick={() => setTab('photos')}>View all <Icon name="arrowRight" /></button> : undefined}>
      {!photos.length ? <p className="hp-empty">Photos you share with Athena that mention {row.name} show here. They stay on the device that took them.</p>
        : <div className="pp-photos">{photos.slice(0, tab === 'overview' ? 4 : undefined).map(p => <DevicePhoto key={p.uuid} memory={p} />)}</div>}
    </Panel>,
    chores: <Panel key="chores" icon="list" title="Chores">
      {choresNote ? choresNote : !theirChores.length ? <p className="hp-empty">Family Chores doesn’t say whose chore is whose. Chores that name {row.name} in their title show here.</p>
        : <><p className="pp-progress"><strong>{theirChores.filter(c => c.completed).length} of {theirChores.length}</strong> done<span className="hp-bar hp-bar-thin"><i style={{ width: `${(100 * theirChores.filter(c => c.completed).length) / theirChores.length}%` }} /></span></p>
          <ul className="pp-rows">{theirChores.map((c, i) => <li key={c.id || i} className="pp-chore"><Icon name={c.completed ? 'check' : 'minus'} /><span>{c.title}</span>{c.dueDate && <small>{shortDay(Date.parse(c.dueDate))}</small>}</li>)}</ul></>}
    </Panel>,
    interests: <InterestsPanel key="interests" data={data} name={row.name} busy={busy}
      onAdd={(label, icon) => run('interest', () => dashboardApi.addPersonInterest(row.id, tokens, { label, icon }))}
      onRemove={uuid => run(`interest-${uuid}`, () => dashboardApi.removePersonInterest(row.id, tokens, uuid))} />,
    related: <RelatedPanel key="related" data={data} row={row} roster={roster} busy={busy} onOpen={props.onOpenPerson}
      onAdd={(otherKey, label) => run('related', () => dashboardApi.addPersonRelated(row.id, tokens, { otherKey, label }))}
      onRemove={uuid => run(`related-${uuid}`, () => dashboardApi.removePersonRelated(row.id, tokens, uuid))} />,
    connections: <Panel key="connections" icon="link" title="Details & Connections" sub={`Where Athena gets information about ${row.name}`}>
      <ul className="pp-facts">
        <Connection icon="people" label="Google Contact" value={!link ? 'Not linked' : link.status === 'ok' ? 'Connected' : link.status === 'missing' ? 'Contact deleted' : link.status === 'not_connected' ? 'Google not connected' : 'Couldn’t read it'} good={link?.status === 'ok'} />
        <Connection icon="user" label="Athena profile" value={child ? `Child profile${child.grade ? ` (${gradeLabel(child.grade)})` : ''}` : 'None'} good={!!child} />
        <Connection icon="home" label="Family account" value={child ? 'Member (child)' : 'Not a member'} good={!!child} />
        <Connection icon="heart" label="Health watches" value={`${mine.length} active${data ? ` · ${data.health.length} on record` : ''}`} />
        <Connection icon="calendar" label="Calendar" value={upcoming.filter(u => u.icon !== 'cake').length ? `Named in ${upcoming.filter(u => u.icon !== 'cake').length} upcoming event${upcoming.filter(u => u.icon !== 'cake').length === 1 ? '' : 's'}` : 'Not named in upcoming events'} />
        <Connection icon="book" label="Memories" value={`${filed.length} fact${filed.length === 1 ? '' : 's'} · ${data?.memories.length ?? '…'} mention${data?.memories.length === 1 ? '' : 's'}`} />
        <Connection icon="camera" label="Camera sightings" value={!data ? '…' : !data.sightings ? 'Not linked to a camera subject' : data.sightings.count ? `${data.sightings.count} in ${data.sightings.days} days${data.sightings.recent[0]?.camera ? ` · last ${data.sightings.recent[0].camera}` : ''}` : `None in ${data.sightings.days} days`} good={!!data?.sightings?.count} />
      </ul>
      {props.onEditMemory && <button type="button" className="cp-outline pp-start" onClick={props.onEditMemory}><Icon name="pencil" /> Edit memory, contact & birthday</button>}
    </Panel>,
  };

  const layout: Record<Tab, ReactNode[]> = {
    overview: [panels.upcoming, panels.health, panels.about, panels.memories, panels.photos, panels.chores, panels.interests, panels.related, panels.connections],
    memories: [panels.memories, panels.interests],
    health: [panels.health],
    activities: [panels.upcoming, panels.chores],
    photos: [panels.photos],
    details: [panels.about, panels.connections, panels.related, panels.interests],
  };

  return <div className="hp pp">
    <div className="pp-toolbar"><button type="button" className="hp-link" onClick={onBack}><Icon name="chevronLeft" /> Family</button></div>
    <div className="pp-hero">
      <Portrait name={row.name} url={photoUrl} />
      <PageHeader title={<>{row.name}{relation && <span className="pp-relation">{relation}</span>}</>}
        blurb={<span className="pp-facts-line">
          {grade || age !== null ? <><Icon name="user" />{[age !== null ? `Age ${age}` : null, gradeText].filter(Boolean).join(' · ')}</> : null}
          {nextBirthday ? <><Icon name="cake" />{shortDay(nextBirthday)} ({row.birthday === 0 ? 'today' : `in ${row.birthday} day${row.birthday === 1 ? '' : 's'}`})</> : null}
        </span>}
        controls={chips}
        take={{ lines: take, ask: row.signal.ask || `Tell me how ${row.name} is doing — what should I pay attention to?`, onAsk }} />
    </div>
    {/* Their part of any list Athena keeps (a Christmas list): nothing when they're on none. */}
    {!row.isPet && <PersonCollections personKey={row.id} name={row.name} onAsk={onAsk} />}
    <SectionTabs tabs={TABS} active={tab} onChange={setTab} label={`${row.name}’s sections`} panelId="person-panel" />
    {(error || loadError) && <p className="dashboard-notice" role="status">{error || loadError}</p>}
    <div id="person-panel" role="tabpanel" className={`pp-grid pp-grid-${tab}`}>{layout[tab]}</div>
  </div>;
}

function Panel({ icon, title, sub, action, children }: { icon: string; title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="hp-panel pp-panel">
    <header><span className="pp-panel-icon"><Icon name={icon} /></span><span className="pp-panel-title"><h2>{title}</h2>{sub && <small>{sub}</small>}</span>{action}</header>
    {children}
  </section>;
}

function Portrait({ name, url }: { name: string; url: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return <div className="pp-portrait">{url && !broken ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}</div>;
}

function Connection({ icon, label, value, good }: { icon: string; label: string; value: string; good?: boolean }) {
  return <li><Icon name={icon} /><span>{label}</span><strong className={good ? 'pp-good' : undefined}>{good ? '✓ ' : ''}{value}</strong></li>;
}

function MemoryRow({ memory: m }: { memory: PersonPageData['memories'][number] }) {
  const icon = m.kind === 'photo' ? 'camera' : m.kind === 'conversation' ? 'chat' : m.kind === 'reflection' ? 'sun' : 'book';
  return <li className="pp-memory">
    <span className="pp-memory-icon"><Icon name={icon} /></span>
    <span><strong>{m.title || m.content}</strong><small>{ago(m.occurredAt)} · {m.source === 'ai' && m.kind === 'conversation' ? 'From conversation' : `Importance ${m.importance}`}</small></span>
    {m.kind === 'photo' && m.mediaRef && <DevicePhoto memory={m} small />}
  </li>;
}

/** A photo memory's picture, from this device's store; its description when this device doesn't have it. */
function DevicePhoto({ memory, small = false }: { memory: PersonPageData['memories'][number]; small?: boolean }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void loadPhotoUrl(memory.mediaRef!).then(u => { made = u; if (alive) setUrl(u); }).catch(() => alive && setUrl(null));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [memory.mediaRef]);
  if (small) return url ? <img className="pp-thumb" src={url} alt="" /> : null;
  return <figure className="pp-photo">{url ? <img src={url} alt={memory.title || ''} /> : <figcaption>{url === undefined ? '…' : memory.title || memory.content.slice(0, 80)}</figcaption>}</figure>;
}

const GRADE_OPTIONS: [string, string][] = [['pre-k', 'Pre-K'], ['kindergarten', 'Kindergarten'],
  ...Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), gradeLabel(String(i + 1))!])];

/** "4" → "4th grade"; the server's labels, for a child profile's grade it didn't send. */
function gradeLabel(grade: string | null): string | null {
  if (!grade) return null;
  const g = grade.toLowerCase();
  if (g === 'pre-k') return 'Pre-K';
  if (g === 'kindergarten') return 'Kindergarten';
  if (g === 'graduated') return 'Graduated';
  const n = Number(g);
  if (!Number.isInteger(n)) return `Grade ${grade}`;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${suffix} grade`;
}

function AboutPanel({ row, about, relation, grade, gradeText, age, nextBirthday, factCount, own, busy, onSave, onMemories }: {
  row: RosterRow; about: string; relation: string | null; grade: string | null; gradeText: string | null; age: number | null; nextBirthday: number | null; factCount: number;
  own: PersonPageData | null; busy: string | null; onSave: (p: { about?: string | null; relation?: string | null; grade?: string | null }) => Promise<boolean>; onMemories: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [rel, setRel] = useState('');
  const [grd, setGrd] = useState('');
  const shownGrade = grade && GRADE_OPTIONS.some(([v]) => v === grade) ? grade : '';
  function open() { setText(own?.about || about); setRel(own?.relation || relation || ''); setGrd(shownGrade); setEditing(true); }
  async function save(e: FormEvent) {
    e.preventDefault();
    // Only send the grade when it changed, so saving the write-up doesn't restart its school year.
    const payload = { about: text.trim() || null, relation: rel.trim() || null, ...(grd !== shownGrade ? { grade: grd || null } : {}) };
    if (await onSave(payload)) setEditing(false);
  }
  return <Panel icon="user" title={`About ${row.name}`} action={own && !editing ? <button type="button" className="hp-link" onClick={open}><Icon name="pencil" /> Edit</button> : undefined}>
    {editing ? <form className="dashboard-form pp-form" onSubmit={save}>
      <label>About<textarea rows={3} maxLength={600} value={text} onChange={e => setText(e.target.value)} placeholder={`A line or two about ${row.name}`} /></label>
      <label>Relation<input maxLength={60} value={rel} onChange={e => setRel(e.target.value)} placeholder="e.g. Daughter" /></label>
      {!row.isPet && <label>Grade<select value={grd} onChange={e => setGrd(e.target.value)}>
        <option value="">Not in school / not set</option>
        {GRADE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select><small className="pp-hint">Moves up by itself every August 1st.</small></label>}
      <div className="pp-form-actions"><button className="dashboard-chat-cta" type="submit" disabled={busy === 'about'}>{busy === 'about' ? 'Saving…' : 'Save'} <span>↗</span></button><button type="button" className="hw-quiet" onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <>
      {about ? <p className="pp-about">{about}</p> : <p className="hp-empty">Nothing written about {row.name} yet.</p>}
      <ul className="pp-facts">
        {gradeText && <li><Icon name="star" /><span>Grade</span><strong>{gradeText}</strong></li>}
        {age !== null && <li><Icon name="user" /><span>Age</span><strong>{age}</strong></li>}
        <li><Icon name="cake" /><span>Birthday</span><strong>{nextBirthday ? `${shortDay(nextBirthday)} (${row.birthday === 0 ? 'today' : `in ${row.birthday} days`})` : 'Not on file'}</strong></li>
        <li><Icon name="people" /><span>Relation</span><strong>{relation || 'Not said'}</strong></li>
        <li><button type="button" className="pp-row-btn" onClick={onMemories}><Icon name="book" /><span>From memories</span><strong>{factCount} fact{factCount === 1 ? '' : 's'}</strong><Icon name="chevron" /></button></li>
      </ul>
    </>}
  </Panel>;
}

function InterestsPanel({ data, name, busy, onAdd, onRemove }: {
  data: PersonPageData | null; name: string; busy: string | null; onAdd: (label: string, icon: string | null) => Promise<boolean>; onRemove: (uuid: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('star');
  const [adding, setAdding] = useState(false);
  return <Panel icon="star" title="Interests & Favorites" sub="What they love — add them here" action={data && !adding ? <button type="button" className="hp-link" onClick={() => setAdding(true)}><Icon name="plus" /> Add</button> : undefined}>
    {data && !data.interests.length && !adding && <p className="hp-empty">No interests yet. Add what {name} loves — Athena will keep them in mind.</p>}
    <div className="pp-interests">{data?.interests.map(i => <span key={i.uuid} className="pp-interest">
      <Icon name={INTEREST_ICONS[i.icon || 'star'] || 'star'} />{i.label}
      <button type="button" aria-label={`Remove ${i.label}`} disabled={!!busy} onClick={() => void onRemove(i.uuid)}>✕</button>
    </span>)}</div>
    {adding && <form className="dashboard-form pp-form pp-inline" onSubmit={e => { e.preventDefault(); if (label.trim()) void onAdd(label.trim(), icon).then(ok => { if (ok) { setLabel(''); setAdding(false); } }); }}>
      <select value={icon} onChange={e => setIcon(e.target.value)} aria-label="Icon">{Object.keys(INTEREST_ICONS).map(k => <option key={k} value={k}>{k}</option>)}</select>
      <input autoFocus maxLength={60} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Basketball" aria-label="Interest" />
      <button className="dashboard-chat-cta" type="submit" disabled={!label.trim() || busy === 'interest'}>Add <span>↗</span></button>
      <button type="button" className="hw-quiet" onClick={() => setAdding(false)}>Cancel</button>
    </form>}
  </Panel>;
}

function RelatedPanel({ data, row, roster, busy, onOpen, onAdd, onRemove }: {
  data: PersonPageData | null; row: RosterRow; roster: RosterRow[]; busy: string | null;
  onOpen: (key: string) => void; onAdd: (otherKey: string, label: string) => Promise<boolean>; onRemove: (uuid: string) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [other, setOther] = useState('');
  const [label, setLabel] = useState('');
  const byId = new Map(roster.map(r => [r.id, r]));
  const listed = new Set(data?.related.map(r => r.otherKey));
  const choices = roster.filter(r => r.id !== row.id && !listed.has(r.id));
  return <Panel icon="people" title="Related People" sub="Close family, friends, and caregivers" action={data && !adding && choices.length ? <button type="button" className="hp-link" onClick={() => { setAdding(true); setOther(choices[0]?.id || ''); }}><Icon name="plus" /> Add</button> : undefined}>
    {data && !data.related.length && !adding && <p className="hp-empty">Nobody listed yet. Add {row.name}’s brother, mom, best friend — whoever matters.</p>}
    <ul className="pp-rows">{data?.related.map(r => {
      const p = byId.get(r.otherKey);
      return <li key={r.uuid} className="pp-related">
        <button type="button" className="pp-row-btn" disabled={!p} onClick={() => p && onOpen(p.id)}>
          <Portrait name={p?.name || '?'} url={p?.photoUrl || null} />
          <span><strong>{p?.name || 'Someone no longer remembered'}</strong><small>{r.label}</small></span>{p && <Icon name="chevron" />}
        </button>
        <button type="button" className="hw-icon-btn" aria-label={`Remove ${p?.name || 'them'}`} disabled={!!busy} onClick={() => void onRemove(r.uuid)}>✕</button>
      </li>;
    })}</ul>
    {adding && <form className="dashboard-form pp-form pp-inline" onSubmit={e => { e.preventDefault(); if (other && label.trim()) void onAdd(other, label.trim()).then(ok => { if (ok) { setLabel(''); setAdding(false); } }); }}>
      <select value={other} onChange={e => setOther(e.target.value)} aria-label="Who">{choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input autoFocus maxLength={60} value={label} onChange={e => setLabel(e.target.value)} placeholder={`Who they are to ${row.name} — e.g. Brother`} aria-label="Relation" />
      <button className="dashboard-chat-cta" type="submit" disabled={!other || !label.trim() || busy === 'related'}>Add <span>↗</span></button>
      <button type="button" className="hw-quiet" onClick={() => setAdding(false)}>Cancel</button>
    </form>}
  </Panel>;
}
