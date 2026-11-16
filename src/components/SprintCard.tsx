import { useEffect, useState } from 'react';
import { dashboardApi, type SprintPerson, type SprintStatus, type WorkspaceSprint } from '../api/dashboard';
import './sprint.css';

/**
 * Sprint progress from the workspace's own Jira and GitHub keys: you first,
 * then the team average, then (expanded) every developer — story points done,
 * in progress and not started against the 64-point target, and PRs reviewed vs
 * created since the sprint began. Who's behind is decided by the server
 * (workspaceSprint.js `statusOf`), never here.
 */

export const SPRINT_STATUS: Record<SprintStatus, { label: string; tone: string }> = {
  complete: { label: 'Complete', tone: 'sp-complete' },
  on_track: { label: 'On track', tone: 'sp-on-track' },
  at_risk: { label: 'At risk', tone: 'sp-at-risk' },
  behind: { label: 'Behind', tone: 'sp-behind' },
};

export const SPRINT_ERROR: Record<string, string> = {
  not_connected: 'No Jira connection is linked to this workspace yet.',
  unsupported: 'Sprint progress needs this workspace’s Jira connected with an API token.',
  rejected: 'Jira refused this workspace’s API token.',
  unavailable: 'Jira couldn’t be read right now.',
  no_sprint_field: 'This Jira site has no sprints (no Sprint field found).',
  no_open_sprint: 'No sprint is open in this Jira right now.',
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

/** "2.0" reviews per PR created; "—" when there's nothing to compare. */
export function reviewRatio(reviewed: number | null, created: number | null) {
  if (reviewed === null || created === null) return '—';
  if (!created) return reviewed ? `${reviewed} : 0` : '—';
  return `${(reviewed / created).toFixed(1)}`;
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img className="sp-avatar" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="sp-avatar sp-initials" aria-hidden="true">{initials(name)}</span>;
}

type Points = { done: number; inProgress: number; notStarted: number };

/** Small line icons for the stat tiles and meta bar (stroke = currentColor). */
const ICON: Record<string, JSX.Element> = {
  done: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16.5 9" /></>,
  progress: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.5h-4.5" /></>,
  todo: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  reviewed: <><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /></>,
  created: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10" /><path d="M18 9c0 5-6 4-11.5 8.5" /></>,
  ratio: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /><path d="m9 17 6-6" /><circle cx="9.5" cy="11.5" r=".8" /><circle cx="14.5" cy="16.5" r=".8" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  pace: <><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-3" /></>,
  team: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.3-.2 4 1.3 4.5 4.3" /></>,
};
function Ico({ name }: { name: keyof typeof ICON }) {
  return <svg className="sp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>;
}

function Tile({ kind, value, label }: { kind: string; value: string | number; label: string }) {
  return <span className={`sp-tile sp-t-${kind}`}><Ico name={kind} /><strong>{value}</strong><small>{label}</small></span>;
}

function Stats({ points, reviewed, created, matched = true }: { points: Points; reviewed: number | null; created: number | null; matched?: boolean }) {
  return <div className="sp-tiles">
    <Tile kind="done" value={fmt(points.done)} label="Done" />
    <Tile kind="progress" value={fmt(points.inProgress)} label="In Progress" />
    <Tile kind="todo" value={fmt(points.notStarted)} label="Not Started" />
    {matched ? <>
      <Tile kind="reviewed" value={reviewed ?? '—'} label="Reviewed" />
      <Tile kind="created" value={created ?? '—'} label="Created" />
      <Tile kind="ratio" value={reviewRatio(reviewed, created)} label="Rev : Created" />
    </> : <span className="sp-tile sp-nomatch">No GitHub match</span>}
  </div>;
}

/** One line under the tiles: what's left, a single fill toward the 64 target, and done / target. */
function Progress({ p, target, status }: { p: Points; target: number; status: SprintStatus | null }) {
  const left = target - p.done;
  const pct = Math.min(100, Math.round((p.done / target) * 100));
  return <div className={`sp-progress${status === 'complete' ? ' sp-full' : ''}`}>
    <small>{left <= 0 ? <><b>{target} SP</b> reached</> : <><b>{fmt(left)} SP to go</b> · {fmt(p.done + p.inProgress + p.notStarted)} SP in the sprint</>}</small>
    <span className="sp-track" role="img" aria-label={`${fmt(p.done)} of ${target} story points done`}><i style={{ width: `${pct}%` }} /></span>
    <small className="sp-of">{fmt(Math.min(p.done, target))} / {target} SP ({pct}%)</small>
  </div>;
}

function Chip({ status }: { status: SprintStatus | null }) {
  if (!status) return null;
  const s = SPRINT_STATUS[status];
  return <em className={`sp-chip ${s.tone}`}>{s.label}</em>;
}

function Row({ tone, who, stats, compact }: { tone: string; who: JSX.Element; stats: JSX.Element; compact?: boolean }) {
  return <li className={`sp-row ${tone}${compact ? ' sp-row-compact' : ''}`}>
    <div className="sp-who">{who}</div>
    <div className="sp-body">{stats}</div>
  </li>;
}

function PersonRow({ p, target, compact }: { p: SprintPerson; target: number; compact?: boolean }) {
  return <Row tone={SPRINT_STATUS[p.status].tone} compact={compact}
    who={<><Avatar name={p.name} src={p.avatar} /><div><strong>{p.me ? `${p.name} (you)` : p.name}</strong><small>{p.issues} issue{p.issues === 1 ? '' : 's'}{p.github.login ? ` · @${p.github.login}` : ''}</small><Chip status={p.status} /></div></>}
    stats={<><Stats points={p} reviewed={p.github.reviewed} created={p.github.created} matched={!!p.github.login} /><Progress p={p} target={target} status={p.status} /></>} />;
}

export function SprintPanel({ data }: { data: WorkspaceSprint }) {
  const [open, setOpen] = useState(false);
  if (data.error || !data.sprint || !data.team || !data.people) return <p className="hp-empty">{SPRINT_ERROR[data.error || 'unavailable'] || SPRINT_ERROR.unavailable}</p>;
  const target = data.target || 64;
  const { sprint, team } = data;
  const avg = team.average;
  const others = data.people.filter(p => !p.me);
  const teamName = data.teamFilter ? `${data.teamFilter} team` : 'team';
  return <div className="sp">
    <div className="sp-meta">
      <strong className="sp-sprint"><Ico name="target" />{sprint.name}</strong>
      {sprint.daysLeft !== null && <span><Ico name="calendar" />{sprint.daysLeft} working day{sprint.daysLeft === 1 ? '' : 's'} left</span>}
      <span><Ico name="pace" />Pace today: {fmt(sprint.expected)} of {target} SP</span>
      <span className={data.teamFilter ? 'sp-team-tag' : 'sp-muted'}>{data.teamFilter ? `${data.teamFilter} team only` : 'No Red team found in Jira · showing everyone'}</span>
      {data.github?.error && <span className="sp-muted">GitHub {data.github.error === 'not_connected' ? 'not linked' : 'unavailable'}</span>}
      {!data.github?.error && data.github?.note && <span className="sp-warn">{data.github.note === 'no_org' ? 'This GitHub key can’t see any organization — PR counts are incomplete.' : 'This GitHub key can’t see the team’s pull requests — check its repository access.'}</span>}
    </div>
    <ul className="sp-list">
      {data.me ? <PersonRow p={data.me} target={target} />
        : <li className="sp-row sp-empty">You have no issues in {sprint.name}.</li>}
      {team.size > 0 && <Row tone={`sp-team ${avg.status ? SPRINT_STATUS[avg.status].tone : ''}`}
        who={<><span className="sp-avatar sp-sigma" aria-hidden="true">Σ</span><div><strong>{data.teamFilter ? `${data.teamFilter} team average` : 'Team average'}</strong><small>{team.size} developer{team.size === 1 ? '' : 's'}{team.atRisk.length ? ` · ${team.atRisk.length} need${team.atRisk.length === 1 ? 's' : ''} attention` : ''}</small><Chip status={avg.status} /></div></>}
        stats={<><Stats points={avg} reviewed={avg.reviewed} created={avg.created} /><Progress p={avg} target={target} status={avg.status} /></>} />}
      {open && others.map(p => <PersonRow key={p.id} p={p} target={target} compact />)}
    </ul>
    {(team.size > 0 || !!data.unassigned || !!data.otherSprints?.length) && <div className="sp-footer">
      {team.size > 0 && <button type="button" className="sp-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Ico name="team" />{open ? `Hide the ${teamName}` : `Show the ${teamName} (${team.size})`}<span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>}
      <small>
        {data.unassigned ? `${fmt(data.unassigned)} SP unassigned. ` : ''}
        {data.otherSprints?.length ? `Also open: ${data.otherSprints.join(', ')}` : ''}
      </small>
    </div>}
  </div>;
}

/** Loads one workspace's sprint ('primary' for the main Dashboard). */
export function useSprint(uuid: string | null) {
  const [data, setData] = useState<WorkspaceSprint | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!uuid) return;
    let alive = true;
    setData(null); setError('');
    dashboardApi.workspaceSprint(uuid).then(r => { if (alive) setData(r); }).catch(e => { if (alive) setError((e as Error).message || 'Sprint progress couldn’t load.'); });
    return () => { alive = false; };
  }, [uuid]);
  return { data, error };
}

/** The main Dashboard's Work card: your points and who on the team is in danger. */
export function SprintSummary({ data, onOpen }: { data: WorkspaceSprint; onOpen?: () => void }) {
  if (data.error || !data.sprint || !data.team) return null;
  const target = data.target || 64;
  const me = data.me;
  const risk = data.team.atRisk;
  return <button type="button" className="sp-summary" onClick={onOpen}>
    <span className="sp-summary-head"><small>{data.sprint.name}{data.sprint.daysLeft !== null ? ` · ${data.sprint.daysLeft}d left` : ''}</small>{me && <Chip status={me.status} />}</span>
    {me ? <>
      <span className="sp-summary-line"><strong>{fmt(me.done)}</strong> done · {fmt(me.inProgress)} in progress · {fmt(me.notStarted)} not started <small>of {target}</small></span>
      {me.github.login && <small>PRs reviewed : created · {me.github.reviewed ?? '—'} : {me.github.created ?? '—'}{data.team.average.reviewed !== null ? ` (team avg ${data.team.average.reviewed} : ${data.team.average.created})` : ''}</small>}
    </> : <small>You have no issues in this sprint.</small>}
    <small className={risk.length ? 'sp-summary-risk' : 'sp-muted'}>
      {risk.length ? `${data.teamFilter ? `${data.teamFilter} team` : 'Team'}: ${risk.filter(r => r.status === 'behind').length} behind, ${risk.filter(r => r.status === 'at_risk').length} at risk — ${risk.slice(0, 4).map(r => r.name.split(' ')[0]).join(', ')}${risk.length > 4 ? '…' : ''}`
        : `Team avg ${fmt(data.team.average.done)} SP done · everyone on track`}
    </small>
  </button>;
}
