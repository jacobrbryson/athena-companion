import type { ReactNode } from 'react';
import type { GmAbility, GmMission, GmTeamMember, GmTeamSkill, GuardiansOverview } from '../api/guardianMissions';
import { Icon, Ring } from './HealthPage';

/**
 * The Guardians page's first screen, from the owner's 2026-10-30 concept: the
 * team, the six skills, what the team did and what is next. It only reads;
 * every control stays on the tabs in GuardiansPage.tsx.
 */
export const GUARDIANS_HEADER = '/assets/1684a674-5e7c-44d6-91f0-a0918e50d7f9.png';

export type GuardiansTab = 'overview' | 'missions' | 'skills' | 'team' | 'progress' | 'intel' | 'map' | 'kit';
/** What a side drawer is showing. It holds a key, not a copy, so a change on the page reaches it. */
export type GuardiansDetail = { kind: 'guardian'; name: string } | { kind: 'skill'; key: string } | { kind: 'ability'; key: string } | { kind: 'mission'; uuid: string };
type Open = (d: GuardiansDetail) => void;

const TAB_PATHS: Record<GuardiansTab, ReactNode> = {
  overview: <><circle cx="12" cy="12" r="9" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8l1.6 2.4L16 12l-2.4 1.6L12 16l-1.6-2.4L8 12l2.4-1.6z" /></>,
  missions: <path d="M3 20 9.5 7l4 7 2.5-4 5 10zM9.5 7 11 11" />,
  skills: <path d="M5 20v-6M12 20V6M19 20v-9" />,
  team: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.4-4 2.8-6 6-6s5.6 2 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14c2.5.2 4 1.8 4.5 5" /></>,
  progress: <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4c0 3 1.2 4.6 3.4 5M17 6h3c0 3-1.2 4.6-3.4 5M12 14v4M8 20h8" />,
  intel: <path d="M12 6c-2-1.6-5-2-8-1.6v14C7 18 10 18.4 12 20c2-1.6 5-2 8-1.6v-14C17 4 14 4.4 12 6zM12 6v14" />,
  map: <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" />,
  kit: <><rect x="5" y="8" width="14" height="13" rx="3" /><path d="M9 8V6a3 3 0 0 1 6 0v2M5 14h14M12 12v4" /></>,
};
export const TABS: { key: GuardiansTab; label: string }[] = [
  { key: 'overview', label: 'Overview' }, { key: 'missions', label: 'Missions' }, { key: 'skills', label: 'Abilities' }, { key: 'team', label: 'Team' },
  { key: 'progress', label: 'Progress' }, { key: 'intel', label: 'Intel' }, { key: 'map', label: 'Map' }, { key: 'kit', label: 'Field Kit' },
];

export function TabIcon({ tab }: { tab: GuardiansTab }) {
  return <svg className="gm-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TAB_PATHS[tab]}</svg>;
}

export const SKILL_STYLE: Record<string, { color: string; glyph: string; focus: string; blurb: string }> = {
  planning: { color: '#46b4f5', glyph: '🧭', focus: 'Plan Together', blurb: 'Good plans turn ideas into adventures. Practice breaking a big goal into steps, assigning roles, and adapting when things change.' },
  teamwork: { color: '#b07cf5', glyph: '👥', focus: 'Work Together', blurb: 'Every family holds a piece. Practice sharing what you find, and bringing the whole team along.' },
  problemSolving: { color: '#f6b23a', glyph: '🧩', focus: 'Solve It', blurb: 'Combine clues, test ideas, and explain your reasoning before reaching for the answer.' },
  observation: { color: '#33e0a1', glyph: '👁️', focus: 'Look Closer', blurb: 'The answer is usually already in front of you. Practice slowing down and noticing what changed.' },
  communication: { color: '#ff5d6c', glyph: '💬', focus: 'Speak Up', blurb: 'A clue nobody hears about is a clue nobody has. Practice checking in and reporting clearly.' },
  realWorldTools: { color: '#9fb2ca', glyph: '⚙️', focus: 'Use Real Tools', blurb: 'A compass, a walkie-talkie, Morse code. Practice the tools until they work without thinking.' },
};

/** One crest per Guardian, the animals on the packs in the header; anyone else cycles through them. */
const CRESTS: Record<string, [string, string]> = {
  Skylar: ['🦊', '#a56cf0'], Thomas: ['🐻', '#3aa6ff'], Aaron: ['🦅', '#33e0a1'], Addy: ['🦉', '#f6c33a'], Emery: ['🦊', '#ff8a3a'], Penny: ['🐢', '#2fd8e0'],
};
const CREST_CYCLE = Object.values(CRESTS);
export function crestFor(name: string): [string, string] {
  return CRESTS[name] || CREST_CYCLE[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % CREST_CYCLE.length];
}

export const PRACTICE: { glyph: string; title: string; text: string; skills: string[] }[] = [
  { glyph: '🗺️', title: 'Plan the route', text: 'Break the goal into steps, identify risks, and assign roles.', skills: ['planning', 'teamwork'] },
  { glyph: '🔎', title: 'Find the clues', text: 'Use observation, maps, and tools to locate each card.', skills: ['observation', 'realWorldTools'] },
  { glyph: '🧩', title: 'Work together', text: 'Share what you find and adapt when plans change.', skills: ['teamwork', 'communication'] },
  { glyph: '🔐', title: 'Solve the code', text: 'Combine clues, test ideas, and explain your reasoning.', skills: ['problemSolving', 'communication'] },
];
export const SKILL_NAME: Record<string, string> = { planning: 'Planning', teamwork: 'Teamwork', problemSolving: 'Problem Solving', observation: 'Observation', communication: 'Communication', realWorldTools: 'Real World Tools' };

/** "12 min ago", then days, then the date: July's finds shouldn't read like news. */
export function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins || 1} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
  if (mins < 43200) { const d = Math.round(mins / 1440); return `${d} day${d === 1 ? '' : 's'} ago`; }
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type FocusCard = { title: string; text: string; ask: string; urgent: boolean };

/** Whatever is waiting on the parent comes first; otherwise the team's least-practiced skill. */
export function todaysFocus(data: GuardiansOverview): FocusCard | null {
  for (const m of data.active) {
    const step = m.steps.find(s => s.status === 'stuck') || m.steps.find(s => s.status === 'waiting_parent');
    if (step) return { title: step.status === 'stuck' ? 'Stuck' : 'Waiting on you', text: `${m.title}: ${step.instruction}`, ask: `What do you need from me on ${m.title}?`, urgent: true };
  }
  const skills = (data.team?.skills || []).filter(s => s.percent != null);
  if (!skills.length) return null;
  const low = skills.reduce((a, b) => (b.percent! < a.percent! ? b : a));
  const style = SKILL_STYLE[low.key];
  return { title: style?.focus || low.name, text: style?.blurb || low.detail, ask: `How can the Guardians practice ${low.name.toLowerCase()} this week?`, urgent: false };
}

export function GuardiansHero({ focus, onAsk }: { focus: FocusCard | null; onAsk: (text: string) => void }) {
  return <section className="gm-hero">
    <img src={GUARDIANS_HEADER} alt="Six young Guardians with glowing packs look out over a lake at night toward a distant citadel." />
    <div className="gm-hero-copy">
      <h1>Guardians</h1>
      <strong>Real world skills. Epic adventures.</strong>
      <p>The Guardians are a team of kids learning, exploring, and solving real-world challenges with Athena. Missions are how we practice skills, work together, and grow stronger.</p>
    </div>
    {focus && <button type="button" className={`gm-focus${focus.urgent ? ' gm-focus-urgent' : ''}`} onClick={() => onAsk(focus.ask)}>
      <small>Today's focus</small>
      <span className="gm-focus-body">
        <i aria-hidden="true"><TabIcon tab="overview" /></i>
        <span><b>{focus.title}</b><span>{focus.text}</span></span>
        <Icon name="chevron" />
      </span>
    </button>}
  </section>;
}

function nextMissionOf(data: GuardiansOverview) { return data.proposed[0] as GmMission | undefined; }

/** The first running mission, and how far its clue cards have got when it has any. */
export function MissionStrip({ data, onOpen, onTab }: { data: GuardiansOverview; onOpen: Open; onTab: (t: GuardiansTab) => void }) {
  const active = data.active.find(m => m.status === 'running') || data.active[0];
  const next = nextMissionOf(data);
  const clues = data.team?.clues;
  const steps = active?.steps || [];
  const done = steps.filter(s => s.status === 'done').length;
  const progress = clues?.total && clues.mission === active?.key ? { n: clues.found, of: clues.total, unit: 'clues' } : steps.length ? { n: done, of: steps.length, unit: 'steps' } : null;
  return <>
    <button type="button" className="gm-strip-card" onClick={() => (active ? onOpen({ kind: 'mission', uuid: active.uuid }) : onTab('missions'))}>
      <small>Active mission</small>
      {active ? <span className="gm-strip-body">
        <i className="gm-thumb gm-thumb-art" style={{ backgroundImage: `url("${GUARDIANS_HEADER}")` }} aria-hidden="true" />
        <span className="gm-strip-text">
          <b>{active.title}</b>
          <span className="gm-dot gm-dot-go">{active.status === 'paused' ? 'Paused' : 'In progress'}</span>
          {progress && <span className="gm-meter-row"><span className="gm-meter"><i style={{ width: `${Math.round((progress.n / progress.of) * 100)}%` }} /></span><em>{progress.n} / {progress.of} {progress.unit}</em></span>}
        </span>
        <Icon name="chevron" />
      </span> : <span className="gm-strip-none">Nothing is running.</span>}
    </button>
    <button type="button" className="gm-strip-card" onClick={() => (next ? onOpen({ kind: 'mission', uuid: next.uuid }) : onTab('missions'))}>
      <small>Next mission</small>
      {next ? <span className="gm-strip-body">
        <i className="gm-thumb" aria-hidden="true">{next.capabilities[0]?.badge || '🧭'}</i>
        <span className="gm-strip-text"><b>{next.title}</b><span className="gm-dot gm-dot-wait">Waiting for approval</span></span>
        <Icon name="chevron" />
      </span> : <span className="gm-strip-none">No plans are waiting.</span>}
    </button>
  </>;
}

function PanelHead({ title, link, onLink }: { title: string; link?: string; onLink?: () => void }) {
  return <header className="gm-panel-head"><h2>{title}</h2>{link && <button type="button" onClick={onLink}>{link} <span aria-hidden="true">→</span></button>}</header>;
}

export function Crest({ name }: { name: string }) {
  const [crest, color] = crestFor(name);
  return <i className="gm-crest" style={{ color, borderColor: color, boxShadow: `0 0 12px ${color}55, inset 0 0 12px ${color}33` }} aria-hidden="true">{crest}</i>;
}

export function GuardianRow({ g, onOpen }: { g: GmTeamMember; onOpen: Open }) {
  return <li><button type="button" className="gm-member" onClick={() => onOpen({ kind: 'guardian', name: g.name })}>
    <Crest name={g.name} />
    <span>
      <b>{g.name}</b>
      <small>Level {g.level} · {g.role}</small>
      <span className="gm-meter" role="img" aria-label={`${g.levelProgress}% of the way to level ${g.level + 1}`}><i style={{ width: `${Math.max(g.levelProgress, 4)}%` }} /></span>
    </span>
  </button></li>;
}

const TEAM_PREVIEW = 6;

function TeamPanel({ data, onTab, onOpen }: { data: GuardiansOverview; onTab: (t: GuardiansTab) => void; onOpen: Open }) {
  const roster = data.team?.roster;
  if (!roster) return <section className="gm-panel"><PanelHead title="Guardians team" /><p className="gm-sub">The team's records aren't available right now.</p></section>;
  const extra = roster.length - TEAM_PREVIEW;
  return <section className="gm-panel">
    <PanelHead title="Guardians team" link="View all" onLink={() => onTab('team')} />
    <ul className="gm-members">{roster.slice(0, TEAM_PREVIEW).map(g => <GuardianRow key={g.name} g={g} onOpen={onOpen} />)}</ul>
    {extra > 0 && <button type="button" className="gm-more" onClick={() => onTab('team')}>+{extra} more Guardian{extra === 1 ? '' : 's'}</button>}
  </section>;
}

export function SkillTile({ skill, onOpen }: { skill: GmTeamSkill; onOpen: Open }) {
  const style = SKILL_STYLE[skill.key];
  const color = style?.color || '#46b4f5';
  return <li><button type="button" className="gm-skill" title={skill.detail} onClick={() => onOpen({ kind: 'skill', key: skill.key })}>
    <Ring value={skill.percent} max={100} color={color} size={64} stroke={6}><span className="gm-skill-glyph" aria-hidden="true">{style?.glyph}</span></Ring>
    <span>
      <b>{skill.name}</b>
      <strong>{skill.percent == null ? 'Not started' : `${skill.percent}%`}</strong>
      <span className="gm-meter"><i style={{ width: `${skill.percent || 0}%`, background: color }} /></span>
    </span>
  </button></li>;
}

export const ABILITY_STYLE: Record<string, { glyph: string; color: string }> = {
  perception: { glyph: '👁️', color: '#46b4f5' },
  investigation: { glyph: '🔎', color: '#a78bfa' },
  strategy: { glyph: '🗺️', color: '#f5b74e' },
  communication: { glyph: '📡', color: '#5ee0a0' },
  coordination: { glyph: '🧭', color: '#f58a6e' },
  action: { glyph: '⚡', color: '#f56ea8' },
  adaptation: { glyph: '📈', color: '#62d6d0' },
};

export function AbilityTile({ ability, onOpen }: { ability: GmAbility; onOpen: Open }) {
  const style = ABILITY_STYLE[ability.key];
  const color = style?.color || '#46b4f5';
  return <li><button type="button" className="gm-skill" title={ability.description} onClick={() => onOpen({ kind: 'ability', key: ability.key })}>
    <Ring value={ability.percent} max={100} color={color} size={64} stroke={6}><span className="gm-skill-glyph" aria-hidden="true">{style?.glyph}</span></Ring>
    <span>
      <b>{ability.name}</b>
      <strong>{ability.percent}%</strong>
      <span className="gm-meter"><i style={{ width: `${Math.max(ability.percent, 2)}%`, background: color }} /></span>
    </span>
  </button></li>;
}

function SkillsPanel({ data, onTab, onOpen }: { data: GuardiansOverview; onTab: (t: GuardiansTab) => void; onOpen: Open }) {
  const abilities = data.abilities;
  return <section className="gm-panel">
    <PanelHead title="Athena's abilities" link="All abilities" onLink={() => onTab('skills')} />
    {abilities?.length ? <ul className="gm-skills">{abilities.map(a => <AbilityTile key={a.key} ability={a} onOpen={onOpen} />)}</ul> : <p className="gm-sub">Abilities aren't available right now.</p>}
  </section>;
}

export function PracticeList() {
  return <ul className="gm-practice">
    {PRACTICE.map(p => <li key={p.title}>
      <i aria-hidden="true">{p.glyph}</i>
      <span><b>{p.title}</b><small>{p.text}</small></span>
      <span className="gm-practice-tags">{p.skills.map(k => <em key={k} style={{ color: SKILL_STYLE[k].color, borderColor: `${SKILL_STYLE[k].color}66` }}>{SKILL_NAME[k]}</em>)}</span>
    </li>)}
  </ul>;
}

function PracticePanel({ onAsk }: { onAsk: (text: string) => void }) {
  return <section className="gm-panel">
    <PanelHead title="Active skill practice" link="How this mission builds skills" onLink={() => onAsk('How does the current Guardians mission build the kids\' skills?')} />
    <PracticeList />
  </section>;
}

export const ACTIVITY_GLYPH = { find: '🔎', key: '🔐', report: '🗺️' } as const;

function ActivityPanel({ data, onTab }: { data: GuardiansOverview; onTab: (t: GuardiansTab) => void }) {
  const rows = (data.team?.activity || []).slice(0, 5);
  return <section className="gm-panel">
    <PanelHead title="Recent activity" link="View all" onLink={() => onTab('intel')} />
    {rows.length ? <ul className="gm-activity">{rows.map((r, i) => <li key={i}>
      <i aria-hidden="true">{ACTIVITY_GLYPH[r.kind]}</i>
      <span><b>{r.who} {r.text}</b><small>{ago(r.at)}</small></span>
    </li>)}</ul> : <p className="gm-sub">Nothing recorded yet.</p>}
  </section>;
}

function UpcomingPanel({ data, onTab, onOpen }: { data: GuardiansOverview; onTab: (t: GuardiansTab) => void; onOpen: Open }) {
  const rows = data.proposed.slice(0, 3);
  return <section className="gm-panel">
    <PanelHead title="Upcoming" link="View all" onLink={() => onTab('missions')} />
    {rows.length ? <ul className="gm-upcoming">{rows.map(m => <li key={m.uuid}>
      <i className="gm-thumb" aria-hidden="true">{m.capabilities[0]?.badge || '🧭'}</i>
      <span><b>{m.title}</b><span className="gm-dot gm-dot-wait">Waiting for approval</span></span>
      <button type="button" className="gm-review" onClick={() => onOpen({ kind: 'mission', uuid: m.uuid })}>Review</button>
    </li>)}</ul> : <p className="gm-sub">No plans are waiting.</p>}
  </section>;
}

export function OverviewTab({ data, onTab, onAsk, onOpen }: { data: GuardiansOverview; onTab: (t: GuardiansTab) => void; onAsk: (text: string) => void; onOpen: Open }) {
  return <div className="gm-overview">
    <TeamPanel data={data} onTab={onTab} onOpen={onOpen} />
    <div className="gm-col"><SkillsPanel data={data} onTab={onTab} onOpen={onOpen} /><PracticePanel onAsk={onAsk} /></div>
    <div className="gm-col"><ActivityPanel data={data} onTab={onTab} /><UpcomingPanel data={data} onTab={onTab} onOpen={onOpen} /></div>
  </div>;
}
