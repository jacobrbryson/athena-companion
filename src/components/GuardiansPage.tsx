import { useCallback, useEffect, useState } from 'react';
import {
  guardianMissionsApi as gm, NEEDS_CAMERA, TESTABLE,
  type GmCamera, type GmCapability, type GmGuardian, type GmMission, type GmRecipient, type GmStep, type GuardiansOverview, type SkillLevel,
} from '../api/guardianMissions';
import {
  AbilityTile, GuardianRow, GuardiansHero, MissionStrip, OverviewTab, PracticeList, SkillTile, TabIcon, TABS, ago, todaysFocus, type GuardiansDetail, type GuardiansTab,
} from './GuardiansOverview';
import { AbilityDrawer, GuardianDrawer, MissionDrawer, SkillDrawer } from './GuardiansDrawers';
import { GuardiansConsentList } from './GuardiansConsent';
import { PlanMissionDrawer } from './GuardiansPlanning';
import { GuardiansHandoff } from './GuardiansHandoff';
import './health.css';
import './guardians.css';

/**
 * Companion → Guardians (parent view): the owner's 2026-10-30 concept. A hero,
 * a tab row with the active and next mission beside it, and the Overview;
 * everything the page used to stack now sits on a tab. The pause and kill
 * switch live on Field Kit (the owner's call: they read as noise up top), so
 * a banner says so whenever Athena is paused or cut off from the house.
 *
 * Every control here is a request to core_api, which enforces it; the page
 * never decides what Athena may do.
 */
const ATTENTION_LABEL = { green: 'Nothing needs you', yellow: 'Something is waiting on you', red: 'Something needs you now' } as const;
const STATUS_LABEL: Record<GmCapability['status'], string> = { untested: 'Untested', working: 'Working', flaky: 'Flaky', broken: 'Broken' };
const STEP_LABEL: Record<GmStep['status'], string> = {
  pending: 'Not yet', waiting_parent: 'Waiting on you', waiting_kids: 'Waiting on the kids', ready: 'Ready', in_progress: 'In progress', done: 'Done', stuck: 'Stuck', declined: 'Declined',
};
const MISSION_LABEL: Partial<Record<GmMission['status'], string>> = { paused: 'Paused', completed: 'Completed', stopped: 'Stopped', declined: 'Declined', archived: 'Archived' };
const RUNG_LABEL = ['', 'Easy', 'Medium', 'Hard', 'Later'];
const LEVEL_LABEL: Record<SkillLevel, string> = { untested: 'Untested', learning: 'Learning', reliable: 'Reliable' };

function when(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** An <input type="datetime-local"> value for one hour from now. */
function inAnHour() {
  const d = new Date(Date.now() + 3600_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function GuardiansPage({ onAsk }: { onAsk: (text: string) => void }) {
  const [data, setData] = useState<GuardiansOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<GuardiansTab>('overview');
  const [detail, setDetail] = useState<GuardiansDetail | null>(null);

  const load = () => {
    setError('');
    gm.overview().then(setData).catch(e => setError((e as Error).message || 'Guardians is unavailable right now.'));
  };
  useEffect(load, []);

  const close = useCallback(() => setDetail(null), []);

  /** Run one change; the server answers with the whole page, so nothing is guessed locally. */
  async function act(key: string, run: () => Promise<GuardiansOverview | { overview: GuardiansOverview; result?: TestResult }>, done?: string) {
    setBusy(key);
    setNote('');
    try {
      const next = await run();
      setData('overview' in next ? next.overview : next);
      const result = 'result' in next ? next.result : undefined;
      if (result) setNote(result.ok ? `Test passed${result.latencyMs != null ? ` (${(result.latencyMs / 1000).toFixed(1)} s)` : ''}.` : `Test failed: ${result.error || 'no reason given'}.`);
      else if (done) setNote(done);
    } catch (e) {
      setNote((e as Error).message || 'That didn\'t work.');
    } finally {
      setBusy('');
    }
  }

  return <div className="hp cp gm">
    <GuardiansHero focus={data ? todaysFocus(data) : null} onAsk={onAsk} />
    <div className="gm-nav-row">
      <nav className="gm-tabs" aria-label="Guardians sections">
        {TABS.map(t => <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}>
          <TabIcon tab={t.key} />{t.label}
        </button>)}
      </nav>
      {data && <MissionStrip data={data} onOpen={setDetail} onTab={setTab} />}
    </div>
    {error && <p className="hp-sc-note" role="status">{error} <button type="button" className="hp-link" onClick={load}>Retry</button></p>}
    {!data && !error && <p className="hp-sc-note">Loading…</p>}
    {note && <p className="gm-note" role="status">{note}</p>}
    {data && <>
      <HeldBanner data={data} onTab={setTab} />
      {tab === 'overview' && <OverviewTab data={data} onTab={setTab} onAsk={onAsk} onOpen={setDetail} />}
      {tab === 'missions' && <><ActiveMissions data={data} busy={busy} act={act} /><CompletedMissions data={data} onOpen={setDetail} /></>}
      {tab === 'skills' && <AbilitiesTab data={data} onOpen={setDetail} />}
      {tab === 'team' && <><TeamRoster data={data} onOpen={setDetail} /><TeamSkills data={data} onOpen={setDetail} /><SkillGrid data={data} /><Guardians data={data} busy={busy} act={act} /></>}
      {tab === 'progress' && <ProgressTab data={data} onOpen={setDetail} />}
      {tab === 'intel' && <><TeamActivity data={data} /><MysteryTracker data={data} /><ActivityLog data={data} /></>}
      {tab === 'map' && <ScoutedPlaces data={data} />}
      {tab === 'kit' && <><FieldKit /><StatusStrip data={data} busy={busy} act={act} /><Capabilities data={data} busy={busy} act={act} /></>}
      {detail?.kind === 'guardian' && <GuardianDrawer data={data} name={detail.name} onAsk={onAsk} onClose={close}>
        {(g) => <GuardianCard guardian={g} skills={data.skills} busy={busy} act={act} />}
      </GuardianDrawer>}
      {detail?.kind === 'skill' && <SkillDrawer data={data} skillKey={detail.key} onAsk={onAsk} onOpen={setDetail} onClose={close} />}
      {detail?.kind === 'ability' && <AbilityDrawer data={data} abilityKey={detail.key} onClose={close} />}
      {detail?.kind === 'mission' && <MissionDrawer data={data} uuid={detail.uuid} onClose={close}>
        {(m) => <ul className="gm-missions">{m.status === 'proposed' ? <ProposedCard mission={m} busy={busy} act={act} /> : <MissionCard mission={m} busy={busy} act={act} adults={data.recipients.filter(r => r.kind === 'parent')} />}</ul>}
      </MissionDrawer>}
    </>}
  </div>;
}

/** Only when something is actually held: a quiet page means Athena is running normally. */
function HeldBanner({ data, onTab }: { data: GuardiansOverview; onTab: (t: GuardiansTab) => void }) {
  const c = data.control;
  const text = [
    c.killSwitch && 'Athena has no control of lights or cameras.',
    c.mode === 'paused' && 'Athena is paused; her asks are waiting.',
    c.mode === 'quiet_until' && c.quietUntil && `Athena is quiet until ${when(c.quietUntil)}.`,
  ].filter(Boolean).join(' ');
  if (!text) return null;
  return <p className="gm-note" role="status">{text} <button type="button" className="hp-link" onClick={() => onTab('kit')}>Controls</button></p>;
}

function CompletedMissions({ data, onOpen }: { data: GuardiansOverview; onOpen: (d: GuardiansDetail) => void }) {
  const done = data.history.filter(m => m.status === 'completed');
  if (!done.length) return null;
  return <section className="hp-panel" aria-label="Completed missions">
    <header><h2>Completed</h2><span>{done.length}</span></header>
    <ul className="gm-done">{done.map(m => <li key={m.uuid}><button type="button" onClick={() => onOpen({ kind: 'mission', uuid: m.uuid })}><strong>{m.title}</strong>{m.goal && <span className="gm-sub">{m.goal}</span>}</button></li>)}</ul>
  </section>;
}

function AbilitiesTab({ data, onOpen }: { data: GuardiansOverview; onOpen: (d: GuardiansDetail) => void }) {
  const abilities = data.abilities;
  return <section className="hp-panel" aria-label="Athena's abilities">
    <header><h2>Athena's abilities</h2><span>What she can do with her tools</span></header>
    {abilities?.length ? <ul className="gm-skill-detail">{abilities.map(a => <li key={a.key}><ul className="gm-skills"><AbilityTile ability={a} onOpen={onOpen} /></ul><p className="gm-sub">{a.description}</p></li>)}</ul> : <p className="gm-sub">Abilities aren't available right now.</p>}
    <p className="gm-sub gm-foot">Each ability rises only when her tools pass tests. Time spent and attempts don't count.</p>
  </section>;
}

const GRID_LABEL: Record<string, string> = { untested: 'Untested', learning: 'Learning', reliable: 'Reliable', working: 'Reliable', flaky: 'Learning', broken: 'Not working' };

/** Who can do what: each skill against each kid, with Athena's own way of doing it beside them. */
function SkillGrid({ data }: { data: GuardiansOverview }) {
  if (!data.skills.length) return null;
  const toolStatus = (key?: string | null) => data.capabilities.find(c => c.key === key)?.status;
  return <section className="hp-panel" aria-label="Who can do what">
    <header><h2>Who can do what</h2></header>
    <div className="gm-grid-wrap">
      <table className="gm-grid">
        <thead><tr><th scope="col">Skill</th>{data.guardians.map(g => <th key={g.uuid} scope="col">{g.name}</th>)}<th scope="col">Athena</th></tr></thead>
        <tbody>{data.skills.map(s => <tr key={s.uuid}>
          <th scope="row">{s.badge} {s.name}</th>
          {data.guardians.map(g => {
            const held = g.badges.find(b => b.capabilityUuid === s.uuid);
            return <td key={g.uuid}>{held ? GRID_LABEL[held.level] : '—'}{held?.source === 'parent_reported' && <small>Parent says</small>}</td>;
          })}
          <td>{s.athenaVia ? GRID_LABEL[toolStatus(s.athenaVia) || 'untested'] : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function TeamSkills({ data, onOpen }: { data: GuardiansOverview; onOpen: (d: GuardiansDetail) => void }) {
  const skills = data.team?.skills;
  return <>
    <section className="hp-panel" aria-label="Team skills">
      <header><h2>Team skills</h2><span>What each number counts</span></header>
      {skills ? <ul className="gm-skill-detail">{skills.map(s => <li key={s.key}><ul className="gm-skills"><SkillTile skill={s} onOpen={onOpen} /></ul><p className="gm-sub">{s.detail}</p></li>)}</ul> : <p className="gm-sub">Skill progress isn't available right now.</p>}
    </section>
    <section className="hp-panel" aria-label="How missions build skills">
      <header><h2>How missions build skills</h2></header>
      <PracticeList />
    </section>
  </>;
}

function TeamRoster({ data, onOpen }: { data: GuardiansOverview; onOpen: (d: GuardiansDetail) => void }) {
  const roster = data.team?.roster;
  if (!roster) return null;
  return <section className="hp-panel" aria-label="The whole team">
    <header><h2>The team</h2><span>{roster.length} Guardians</span></header>
    <ul className="gm-members gm-members-grid">{roster.map(g => <GuardianRow key={g.name} g={g} onOpen={onOpen} />)}</ul>
    <p className="gm-sub gm-foot">A level comes from what a Guardian has done: checking in, clue cards, trail keys, map pieces and skills. Their role is where most of that is.</p>
  </section>;
}

function ProgressTab({ data, onOpen }: { data: GuardiansOverview; onOpen: (d: GuardiansDetail) => void }) {
  const clues = data.team?.clues;
  const done = data.history.filter(m => m.status === 'completed').length;
  const stats = [
    { label: 'Missions completed', value: done },
    { label: 'Running now', value: data.active.length },
    { label: 'Clue cards found', value: clues ? `${clues.found} / ${clues.total}` : '–' },
    { label: 'Guardians checked in', value: data.team ? `${data.team.roster.filter(g => g.checkedIn).length} / ${data.team.roster.length}` : '–' },
  ];
  return <>
    <section className="hp-panel" aria-label="Team progress">
      <header><h2>Team progress</h2></header>
      <ul className="gm-stats">{stats.map(s => <li key={s.label}><strong>{s.value}</strong><small>{s.label}</small></li>)}</ul>
    </section>
    <CompletedMissions data={data} onOpen={onOpen} />
  </>;
}

function TeamActivity({ data }: { data: GuardiansOverview }) {
  const rows = data.team?.activity || [];
  if (!rows.length) return null;
  return <section className="hp-panel" aria-label="Recent activity">
    <header><h2>Recent activity</h2></header>
    <ul className="gm-log">{rows.map((r, i) => <li key={i}><small>{ago(r.at)}</small> {r.who} {r.text}</li>)}</ul>
  </section>;
}

function ScoutedPlaces({ data }: { data: GuardiansOverview }) {
  return <section className="hp-panel" aria-label="Places Athena has scouted">
    <header><h2>Places Athena has scouted</h2><span>{data.locations.length}</span></header>
    {!data.locations.length && <p className="gm-sub">None yet. Places appear here once a scouting mission has run.</p>}
    <ul className="gm-places">
      {data.locations.map(l => <li key={l.uuid}>
        <strong>{l.name}</strong>{l.difficulty ? <span className="gm-chip">Difficulty {l.difficulty}/5</span> : null}
        {l.last_verified_at ? <span className="gm-chip gm-status-working">Verified</span> : <span className="gm-chip">Not verified</span>}
        {l.lat != null && l.lng != null && <a className="hp-link" href={`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`} target="_blank" rel="noreferrer">Open map</a>}
        {l.description && <p className="gm-sub">{l.description}</p>}
        {l.hiding_potential && <p className="gm-sub gm-pre">{l.hiding_potential}</p>}
      </li>)}
    </ul>
  </section>;
}

/** What every Lake Norman Guardian opened; the same list as ADVENTURE_KITS in core_api's prompt. */
const FIELD_KIT = ['Canvas bag', 'Sealed letter', 'Guardian ID card', 'Paper clip', 'Two mysterious coins', 'Field notebook', 'Blacklight', 'Pen', 'Compass', 'Magnifying glass'];

function FieldKit() {
  return <section className="hp-panel" aria-label="Field kit">
    <header><h2>In every Guardian's box</h2></header>
    <ul className="gm-kit">{FIELD_KIT.map(k => <li key={k}>{k}</li>)}</ul>
  </section>;
}

type TestResult = { ok: boolean; error: string | null; latencyMs: number | null };
type Act = (key: string, run: () => Promise<GuardiansOverview | { overview: GuardiansOverview; result?: TestResult }>, done?: string) => Promise<void>;
type SectionProps = { data: GuardiansOverview; busy: string; act: Act };

function StatusStrip({ data, busy, act }: SectionProps) {
  const c = data.control;
  const [until, setUntil] = useState(inAnHour());
  return <section className="hp-panel gm-strip" aria-label="Athena's controls">
    <div className="gm-strip-intro">
      <h2>Athena's controls</h2>
      <p className="gm-sub">The pause holds what she asks people during missions until you turn her back on; nothing is lost. The kill switch cuts only her use of lights and cameras. Stop every mission ends them all.</p>
    </div>
    <div className={`gm-light gm-light-${data.attention}`}>
      <i aria-hidden="true" />
      <strong>{ATTENTION_LABEL[data.attention]}</strong>
    </div>
    <div className="gm-pause" role="group" aria-label="Master pause">
      <button type="button" className={c.mode === 'running' ? 'active' : ''} disabled={!!busy} onClick={() => act('mode', () => gm.setControl({ mode: 'running' }))}>On</button>
      <span className={`gm-quiet${c.mode === 'quiet_until' ? ' active' : ''}`}>
        <button type="button" disabled={!!busy} onClick={() => act('mode', () => gm.setControl({ mode: 'quiet_until', quietUntil: new Date(until).toISOString() }))}>Quiet until</button>
        <input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} aria-label="Quiet until" />
      </span>
      <button type="button" className={c.mode === 'paused' ? 'active' : ''} disabled={!!busy} onClick={() => act('mode', () => gm.setControl({ mode: 'paused' }))}>Off</button>
    </div>
    {c.mode === 'quiet_until' && c.quietUntil && <small className="gm-sub">Quiet until {when(c.quietUntil)}. Her asks wait; none are dropped.</small>}
    {c.mode === 'paused' && <small className="gm-sub">Paused. Her asks wait until you turn her back on.</small>}
    <div className="gm-strip-actions">
      <button type="button" className={`gm-btn${c.killSwitch ? ' gm-btn-danger' : ''}`} disabled={!!busy}
        onClick={() => act('kill', () => gm.setControl({ killSwitch: !c.killSwitch }), c.killSwitch ? 'Athena can use the lights and cameras again.' : 'Athena has no control of lights or cameras.')}>
        {c.killSwitch ? 'Kill switch ON: restore lights & cameras' : 'Kill switch: cut lights & cameras'}
      </button>
      <button type="button" className="gm-btn gm-btn-danger" disabled={!!busy || !data.active.some(m => m.source !== 'legacy')}
        onClick={() => act('stopall', () => gm.stopEverything(), 'Every mission is stopped.')}>Stop every mission</button>
    </div>
  </section>;
}

function ActiveMissions({ data, busy, act }: SectionProps) {
  const [place, setPlace] = useState('');
  const [planning, setPlanning] = useState(false);
  const scoutRunning = data.active.some(m => m.key === 'scout-the-yard' && m.status === 'running');
  return <section className="hp-panel" aria-label="Active missions">
    <header><h2>Active missions</h2><span>{data.active.length} active</span></header>
    <div className="gm-row"><button type="button" className="gm-btn gm-btn-primary" onClick={() => setPlanning(true)}>Plan a mission</button></div>
    {planning && <PlanMissionDrawer onClose={() => setPlanning(false)} onChanged={() => act('plan', () => gm.overview())} />}
    {!data.active.length && <p className="gm-sub">Nothing is running. Approve a plan below to start one.</p>}
    <ul className="gm-missions">
      {data.active.map(m => <MissionCard key={m.uuid} mission={m} busy={busy} act={act} adults={data.recipients.filter(r => r.kind === 'parent')} />)}
    </ul>
    {scoutRunning && <form className="gm-scout" onSubmit={e => { e.preventDefault(); act('scout', () => gm.scout({ place: place || undefined }), 'Athena sent you a scouting request.'); setPlace(''); }}>
      <label>Have Athena ask me to scout
        <input value={place} onChange={e => setPlace(e.target.value)} placeholder="Where? (optional, e.g. the back porch)" maxLength={200} />
      </label>
      <button type="submit" className="gm-btn" disabled={!!busy}>Send request</button>
    </form>}
    {!!data.proposed.length && <>
      <h3 className="gm-h3">Plans waiting for your approval</h3>
      <ul className="gm-missions">
        {data.proposed.map(m => <ProposedCard key={m.uuid} mission={m} busy={busy} act={act} />)}
      </ul>
    </>}
  </section>;
}

function ProposedCard({ mission: m, busy, act }: { mission: GmMission; busy: string; act: Act }) {
  return <li className="gm-mission gm-proposed">
    <div className="gm-mission-head">
      <strong>{m.title}{m.priority === 'high' && <em className="gm-chip gm-chip-high">High priority</em>}</strong>
      <span className="gm-chip">{RUNG_LABEL[m.rung] || `Rung ${m.rung}`}</span>
    </div>
    {m.goal && <p className="gm-sub">{m.goal}</p>}
    <Caps mission={m} />
    <div className="gm-row">
      <button type="button" className="gm-btn gm-btn-primary" disabled={!!busy} onClick={() => act(`a-${m.uuid}`, () => gm.approve(m.uuid), `Approved: Athena is getting "${m.title}" ready.`)}>Approve plan</button>
      <button type="button" className="gm-btn" disabled={!!busy} onClick={() => act(`d-${m.uuid}`, () => gm.decline(m.uuid))}>Decline</button>
    </div>
  </li>;
}

function Caps({ mission }: { mission: GmMission }) {
  if (!mission.capabilities.length) return null;
  return <ul className="gm-caps" aria-label="Capabilities this mission may use">
    {mission.capabilities.map(c => <li key={c.name}>{c.badge} {c.name}</li>)}
  </ul>;
}

const PHASE_LABEL: Record<string, string> = { prep: 'Adults preparing', ready: 'Ready for Go', live: 'Live' };

/** Starting a mission is a person's decision: who is watching, and nothing left in the way. */
function GoPanel({ mission: m, adults, busy, act }: { mission: GmMission; adults: GmRecipient[]; busy: string; act: Act }) {
  const [supervisor, setSupervisor] = useState('');
  const chosen = supervisor || adults[0]?.uuid || '';
  const problems = m.preflight || [];
  return <div className="gm-go">
    {problems.length > 0 && <ul className="gm-go-problems" aria-label="What stands in the way">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
    <div className="gm-row">
      <label>Who's supervising?
        <select value={chosen} onChange={e => setSupervisor(e.target.value)}>{adults.map(a => <option key={a.uuid} value={a.uuid}>{a.name}</option>)}</select>
      </label>
      <button type="button" className="gm-btn gm-btn-primary" disabled={!!busy || !chosen || problems.length > 0} onClick={() => act(`g-${m.uuid}`, () => gm.go(m.uuid, chosen), `Go: "${m.title}" has started.`)}>Go</button>
    </div>
  </div>;
}

function MissionCard({ mission: m, busy, act, adults }: { mission: GmMission; busy: string; act: Act; adults: GmRecipient[] }) {
  const legacy = m.source === 'legacy';
  const over = ['completed', 'stopped', 'declined', 'archived'].includes(m.status);
  return <li className={`gm-mission gm-${m.status}`}>
    <div className="gm-mission-head">
      <strong>{m.title}</strong>
      <span className="gm-chip">{MISSION_LABEL[m.status] || (legacy ? 'Guardians app' : (m.phase && PHASE_LABEL[m.phase]) || 'Running')}</span>
    </div>
    {m.waitingOn.length > 0 && <p className="gm-waiting">Waiting on {m.waitingOn.join(' and ')}</p>}
    {m.status === 'running' && m.phase === 'ready' && <GoPanel mission={m} adults={adults} busy={busy} act={act} />}
    {(legacy || over) && <p className="gm-sub">{m.goal}{legacy ? (over ? ' Ran in the Guardians app.' : ' Runs in the Guardians app.') : ''}</p>}
    <Caps mission={m} />
    {!!m.steps.length && <ol className="gm-steps">
      {m.steps.map(s => <li key={s.uuid} className={`gm-step gm-step-${s.status}`}>
        <div className="gm-step-head">
          <span className="gm-chip">{STEP_LABEL[s.status]}</span>
          {s.assignee && <small>{s.assignee.name}</small>}
          {s.dueAt && <small>due {when(s.dueAt)}</small>}
          {s.nudgeCount > 0 && <small>{s.nudgeCount} reminder{s.nudgeCount === 1 ? '' : 's'}</small>}
        </div>
        <p>{s.instruction}</p>
        {s.resultNote && <p className="gm-sub">{s.resultNote}</p>}
        {s.status !== 'done' && s.proofRequired === 'code' && m.phase !== 'live' && <button type="button" className="hp-link" disabled={!!busy} onClick={() => {
          const code = window.prompt('The secret code for this step. Athena never sees it.');
          if (code) act(`c-${s.uuid}`, () => gm.setCode(s.uuid, code), 'Code saved.');
        }}>Set the secret code</button>}
        {s.status !== 'done' && s.proofRequired === 'parent_confirm' && <div className="gm-row">
          <button type="button" className="gm-btn gm-btn-primary" disabled={!!busy} onClick={() => act(`v-${s.uuid}`, () => gm.verify(s.uuid, true), 'Thanks: recorded as a match.')}>It matches</button>
          <button type="button" className="gm-btn" disabled={!!busy} onClick={() => {
            const why = window.prompt('What\'s different?') || '';
            act(`v-${s.uuid}`, () => gm.verify(s.uuid, false, why), 'Recorded: it doesn\'t match.');
          }}>Doesn't match</button>
        </div>}
        {!s.sentAt && !['done', 'declined', 'pending'].includes(s.status) && <button type="button" className="hp-link" disabled={!!busy} onClick={() => act(`s-${s.uuid}`, () => gm.sendStep(s.uuid))}>Send now</button>}
      </li>)}
    </ol>}
    {m.debrief && <div className="gm-debrief">
      <strong>Debrief: {m.debrief.passed} of {m.debrief.total} passed</strong>
      <ul>{m.debrief.results.map(r => <li key={r.key}>{r.passed ? '✓' : '✗'} {r.text} <small>{r.detail}</small></li>)}</ul>
    </div>}
    {!legacy && !over && <div className="gm-row">
      {m.status === 'running' && m.phase === 'live' && <button type="button" className="gm-btn" disabled={!!busy} onClick={() => { if (window.confirm('End this mission now and grade it as it stands?')) act(`f-${m.uuid}`, () => gm.finish(m.uuid), `Ended "${m.title}".`); }}>End and debrief</button>}
      {m.status === 'running' && <button type="button" className="gm-btn" disabled={!!busy} onClick={() => act(`p-${m.uuid}`, () => gm.pause(m.uuid, true))}>Pause</button>}
      {m.status === 'paused' && <button type="button" className="gm-btn" disabled={!!busy} onClick={() => act(`p-${m.uuid}`, () => gm.pause(m.uuid, false))}>Resume</button>}
      <button type="button" className="gm-btn gm-btn-danger" disabled={!!busy} onClick={() => act(`x-${m.uuid}`, () => gm.stop(m.uuid), `Stopped "${m.title}".`)}>Stop</button>
    </div>}
  </li>;
}

/** A parent's Test: the person's own click (not held to mission mode), still stopped by the kill switch. */
function TestButton({ cap, cameras, busy, act }: { cap: GmCapability; cameras: GmCamera[]; busy: string; act: Act }) {
  const fits = cameras.filter(c => cap.key === 'pan_tilt_camera' ? c.control.ptz : cap.key === 'speak_through_camera' ? c.control.talkback : c.freshSnapshot);
  const [serial, setSerial] = useState('');
  if (!TESTABLE.has(cap.key)) return null;
  const needs = NEEDS_CAMERA.has(cap.key);
  const chosen = serial || fits[0]?.serial || '';
  return <span className="gm-test">
    {needs && <select value={chosen} onChange={e => setSerial(e.target.value)} aria-label={`Camera for ${cap.name}`} disabled={!fits.length}>
      {fits.length ? fits.map(c => <option key={c.serial} value={c.serial}>{c.name}</option>) : <option value="">No camera can</option>}
    </select>}
    <button type="button" className="hp-link" disabled={!!busy || !cap.enabled || (needs && !chosen)}
      onClick={() => act(`t-${cap.uuid}`, () => gm.test(cap.uuid, needs ? chosen : undefined))}>{busy === `t-${cap.uuid}` ? 'Testing…' : 'Test'}</button>
  </span>;
}

function Capabilities({ data, busy, act }: SectionProps) {
  const [cameras, setCameras] = useState<GmCamera[]>([]);
  useEffect(() => { gm.cameras().then(r => setCameras(r.cameras)).catch(() => setCameras([])); }, []);
  return <section className="hp-panel" aria-label="Capabilities">
    <header><h2>Capabilities</h2><span>{data.capabilities.filter(c => c.status === 'working').length} of {data.capabilities.length} working</span></header>
    <ul className="gm-cap-list">
      {data.capabilities.map(c => <li key={c.uuid} className={`gm-cap gm-cap-${c.status}${c.enabled ? '' : ' gm-off'}`}>
        <span className="gm-cap-badge" aria-hidden="true">{c.badge}</span>
        <div className="gm-cap-body">
          <strong>{c.name}</strong>
          <small>{c.record.text}{c.lastTestedAt ? ` · last ${when(c.lastTestedAt)}` : ''}{c.stale ? ' · due a retest' : ''}</small>
          <small className="gm-tags">
            <span>{c.locality === 'local' ? 'Local' : c.locality === 'cloud' ? 'Cloud' : 'Local + cloud'}</span>
            {c.missionOnly && <span title="Only usable while a mission that lists it is running">Mission only</span>}
            {c.permission === 'parent_approval' && <span>Asks each time</span>}
            {data.control.killSwitch && c.houseControl && <span className="gm-tag-off">Cut by kill switch</span>}
          </small>
          <TestButton cap={c} cameras={cameras} busy={busy} act={act} />
        </div>
        <span className={`gm-chip gm-status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
        <label className="gm-switch">
          <input type="checkbox" checked={c.enabled} disabled={!!busy} onChange={e => act(`c-${c.uuid}`, () => gm.setCapability(c.uuid, e.target.checked))} />
          <span>{c.enabled ? 'On' : 'Off'}</span>
        </label>
      </li>)}
    </ul>
    <GuardiansConsentList />
    <GuardiansHandoff capabilities={data.capabilities} people={data.recipients} />
    <h3 className="gm-h3">Who she may ask</h3>
    <ul className="gm-recipients">
      {data.recipients.map(r => <li key={r.uuid}>
        <span>
          {r.name}{r.kind === 'parent' ? ' (you)' : ''}
          {r.channels && <small className="gm-recipient-channels">{r.channels.length ? r.channels.map(c => c.label).join(' · ') : 'No way to reach them yet'}</small>}
        </span>
        <label className="gm-switch">
          <input type="checkbox" checked={!r.muted} disabled={!!busy} onChange={e => act(`r-${r.uuid}`, () => gm.setRecipient(r.uuid, !e.target.checked))} />
          <span>{r.muted ? 'Muted' : 'On'}</span>
        </label>
      </li>)}
    </ul>
    <p className="gm-sub">A mute holds her asks for that person until you unmute; nothing is dropped. Replying "pause" to any of her messages pauses her.</p>
  </section>;
}

function Guardians({ data, busy, act }: SectionProps) {
  return <section className="hp-panel" aria-label="Guardians">
    <header><h2>Guardians</h2></header>
    <div className="gm-kids">
      {data.guardians.map(g => <GuardianCard key={g.uuid} guardian={g} skills={data.skills} busy={busy} act={act} />)}
    </div>
  </section>;
}

function GuardianCard({ guardian: g, skills, busy, act }: { guardian: GmGuardian; skills: GmCapability[]; busy: string; act: Act }) {
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState<SkillLevel>('learning');
  return <article className="gm-kid">
    <h3>{g.name}</h3>
    {g.badges.length ? <ul className="gm-badges">
      {g.badges.map(b => <li key={b.capabilityUuid} className={`gm-badge gm-badge-${b.level}`} title={`${LEVEL_LABEL[b.level]}${b.retest ? ' · time to try it again' : ''}`}>
        <span aria-hidden="true">{b.badge}</span>{b.name}{b.level === 'learning' && <small>learning</small>}
      </li>)}
    </ul> : <p className="gm-sub">No badges yet.</p>}
    <form className="gm-row" onSubmit={e => { e.preventDefault(); if (skill) act(`k-${g.uuid}`, () => gm.setSkill(g.uuid, skill, level)); }}>
      <select value={skill} onChange={e => setSkill(e.target.value)} aria-label={`Skill for ${g.name}`}>
        <option value="">Add a skill…</option>
        {skills.map(s => <option key={s.uuid} value={s.uuid}>{s.badge} {s.name}</option>)}
      </select>
      <select value={level} onChange={e => setLevel(e.target.value as SkillLevel)} aria-label="Level">
        <option value="learning">Learning</option>
        <option value="reliable">Reliable</option>
      </select>
      <button type="submit" className="gm-btn" disabled={!!busy || !skill}>Add</button>
    </form>
  </article>;
}

function MysteryTracker({ data }: { data: GuardiansOverview }) {
  const byMission = new Map<string, typeof data.clues>();
  for (const c of data.clues) {
    const key = c.mission || 'Other';
    byMission.set(key, [...(byMission.get(key) || []), c]);
  }
  const found = new Set(data.team?.clues.foundRefs || []);
  return <section className="hp-panel" aria-label="Mystery and clue tracker">
    <header><h2>Mystery &amp; clues</h2>{data.team && <span>{data.team.clues.found} of {data.team.clues.total} found</span>}</header>
    <p className="gm-sub">The lake mystery's clue cards, as the Guardians found them in the Guardians app. Placing new cards is the next build.</p>
    {[...byMission].map(([mission, clues]) => <details key={mission} className="gm-clues">
      <summary>{mission}: {clues.length} cards</summary>
      <ol>{clues.map(c => <li key={c.uuid} className={c.ref && found.has(c.ref) ? 'gm-clue-found' : ''}>{c.title}</li>)}</ol>
    </details>)}
  </section>;
}

function ActivityLog({ data }: { data: GuardiansOverview }) {
  if (!data.log.length) return null;
  return <section className="hp-panel" aria-label="What Athena did">
    <details>
      <summary className="gm-h3">What Athena did (latest {data.log.length})</summary>
      <ul className="gm-log">
        {data.log.map((l, i) => <li key={i} className={`gm-log-${l.outcome}`}>
          <small>{when(l.at)}</small> {l.verb.replace(/_/g, ' ')}{l.mission ? `: ${l.mission}` : ''}{l.who ? ` (${l.who})` : ''}{l.outcome !== 'ok' ? `: ${l.outcome}` : ''}
          {typeof l.detail?.reason === 'string' && <small> ({l.detail.reason})</small>}
        </li>)}
      </ul>
    </details>
  </section>;
}
