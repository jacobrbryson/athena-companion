import { Fragment, useState, type ReactNode } from 'react';
import type { JiraIssue, RedEpic, WorkspaceSprint } from '../api/dashboard';
import { AREA_LABEL, STATE_LABEL, type Area, type Project, type ProjectEntry } from '../api/projects';
import { Picture } from './ProjectJournal';
import { SPRINT_STATUS } from './SprintCard';
import { CardHeader } from './YourDay';
import { createPortal } from 'react-dom';
import { JiraIssueDrawer, type JiraIssueRef } from './JiraIssueDrawer';
import './dayTasks.css';

/**
 * Home's Work and Projects cards (owner mockup, 2026-11-17), in the same family
 * as Your Day and Tasks. Work leads with the sprint, then the Red team's epics
 * by due date with how far along each is. Projects shows the top open
 * non-work projects (up to five) with their cover photo and step progress.
 */

const svg = (art: ReactNode, className?: string) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art}</svg>;
const LAPTOP = <><rect x="4.5" y="5" width="15" height="10.5" rx="1.5" /><path d="M2.5 18.5h19" /></>;
const CLIPBOARD = <><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3.5h6v1M9 10h6M9 13.5h6M9 17h4" /></>;
const LAYERS = <><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></>;
const CAL = <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3v4M15.5 3v4M8 14h2M14 14h2" /></>;
const PEOPLE = <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c0-3.2 2.5-5.4 5.5-5.4s5.5 2.2 5.5 5.4M14.5 14c3 0 6 1.6 6 5" /></>;
const CHEVRON = <path d="m9.5 6 6 6-6 6" />;
const CHECK_CIRCLE = <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.6 2.6 4.9-5.3" /></>;
const AREA_ART: Record<Area, ReactNode> = {
  home: <><path d="M3.6 11.2 12 4.6l8.4 6.6" /><path d="M5.8 9.6v9.6h12.4V9.6" /><path d="M10.2 19.2v-4.6h3.6v4.6" /></>,
  work: LAPTOP,
  health: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  family: PEOPLE,
  community: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z" /></>,
};

const day = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
const first = (name: string) => name.split(' ')[0];
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

// --- Work --------------------------------------------------------------------

function EpicRow({ epic: e, today, onOpen }: { epic: RedEpic; today: string; onOpen: (epic: RedEpic) => void }) {
  const late = !!e.due && e.due < today;
  const pct = e.percent;
  const measure = e.by === 'points' ? `${fmt(e.pointsDone)}/${fmt(e.points)} SP` : e.total ? `${e.done}/${e.total} issues` : 'No child issues';
  return <li><button type="button" className="dt-epic" onClick={() => onOpen(e)} title={e.via === 'sprint' ? 'The Red team’s sprint work rolls up to this epic' : 'Marked Red team in Jira'}>
    <b className="dt-epic-badge">{(e.project || e.key).charAt(0).toUpperCase()}</b>
    <span className="dt-epic-main">
      <span className="dt-epic-title"><code>{e.key}</code><strong>{e.title}</strong></span>
      <span className="dt-epic-progress">
        <span className="dt-track" aria-label={pct == null ? 'No progress to show' : `${pct}% complete`}><i style={{ width: `${pct ?? 0}%` }} /></span>
        <em>{pct == null ? '—' : `${pct}%`}</em>
      </span>
      <small><span className={e.statusCategory === 'indeterminate' ? 'dt-epic-status-active' : undefined}>{e.status}</span> · {measure}{e.inProgress ? ` · ${e.inProgress} in progress` : ''}</small>
    </span>
    <span className={`dt-due${late ? ' dt-due-late' : !e.due ? ' dt-due-none' : ''}`}>{svg(CAL)}{e.due ? (late ? `Overdue · ${day(e.due, { month: 'short', day: 'numeric' })}` : day(e.due, { month: 'short', day: 'numeric' })) : 'No date'}</span>
    {svg(CHEVRON, 'dt-chevron')}
  </button></li>;
}

const EPIC_ERROR: Record<string, string> = {
  not_connected: 'Link Jira to your workspace to see the Red team’s epics.',
  unsupported: 'Epics read through a Jira API key; this workspace’s Jira link can’t.',
  rejected: 'Jira refused the workspace’s key — replace it on the Work page.',
  unavailable: 'Jira didn’t answer for epics just now.',
};

export function WorkCard({ sprint, sprintLoading, issues, jiraNote, today, onOpen, onOpenSprint }: {
  sprint: WorkspaceSprint | null; sprintLoading: boolean;
  /** Your In Progress / Ready to Start issues — shown only when there are no epics to show. */
  issues: JiraIssue[];
  jiraNote?: ReactNode;
  today: string;
  onOpen: () => void; onOpenSprint: () => void;
}) {
  // Epics and issues open in the app, read-only (owner, 2026-11-20) — never out to Jira.
  const [reading, setReading] = useState<JiraIssueRef | null>(null);
  const s = sprint && !sprint.error ? sprint : null;
  const target = s?.target || 64;
  const me = s?.me;
  const range = s?.sprint?.start && s.sprint.end ? `${day(s.sprint.start, { month: 'short', day: 'numeric' })} – ${day(s.sprint.end, { month: 'short', day: 'numeric' })}` : null;
  const epics = sprint?.epics;
  const risk = new Set((s?.team?.atRisk || []).map(r => r.name));
  const team = (s?.people || []).filter(p => !p.me);
  const pct = me ? Math.min(100, Math.round((me.done / target) * 100)) : 0;

  return <section className="dh-section dt-card" id="dashboard-work">
    <CardHeader icon="Work" glyph={LAPTOP} tone="violet" title="Work" subtitle={range ? `Sprint · ${range}` : 'Jira'} action="View all" actionArrow="→" onAction={onOpen} />
    <div className="dh-section-body dt-body">
      {s?.sprint && s.team && <button type="button" className="dt-sprint" onClick={onOpenSprint}>
        <span className="dt-sprint-head"><span>{s.sprint.name}{s.sprint.daysLeft !== null && <> · {s.sprint.daysLeft} day{s.sprint.daysLeft === 1 ? '' : 's'} left</>}</span>
          {me && <span className={`dt-sprint-chip dt-sprint-${me.status}`}>{svg(CHECK_CIRCLE)}{SPRINT_STATUS[me.status].label}</span>}</span>
        {me ? <>
          <span className="dt-sprint-line"><strong>{fmt(me.done)}</strong> done · {fmt(me.inProgress)} in progress · {fmt(me.notStarted)} not started of {target}</span>
          <span className="dt-sprint-bar"><span className="dt-track dt-track-lg"><i style={{ width: `${pct}%` }} /></span><em>{pct}%</em></span>
        </> : <span className="dt-sprint-line">You have no issues in this sprint.</span>}
        <span className="dt-sprint-foot">
          {s.sprint.end && <span>{svg(CAL)}Ends: {day(s.sprint.end, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
          {team.length > 0 && <span title={risk.size ? 'Amber: behind or at risk' : undefined}>{svg(PEOPLE)}<span>{s.teamFilter ? `${s.teamFilter} team` : 'Team'}: {team.slice(0, 5).map((p, i) => <Fragment key={p.id}>{i ? ', ' : ''}<b className={risk.has(p.name) ? 'dt-warn' : undefined}>{first(p.name)}</b></Fragment>)}{team.length > 5 ? '…' : ''}</span></span>}
        </span>
      </button>}
      {sprintLoading && !sprint && <p className="dashboard-empty">Reading the sprint…</p>}

      <h3 className="dt-subhead">{svg(LAYERS)}Active Work <small>Red team epics · by due date</small></h3>
      {epics?.items.length ? <><ul className="dt-epics">{epics.items.slice(0, 5).map(e => <EpicRow key={e.key} epic={e} today={today} onOpen={setReading} />)}</ul>
        {epics.items.length > 5 && <p className="dt-more-note">+{epics.items.length - 5} more Red team epics</p>}</>
        : <>
          <p className="dt-caption">{epics?.error ? EPIC_ERROR[epics.error] || 'Epics couldn’t be read.' : sprint?.error === 'not_connected' ? EPIC_ERROR.not_connected : epics ? 'No open epics for the Red team in Jira.' : sprintLoading ? 'Reading epics…' : 'Epics aren’t available yet.'}</p>
          {jiraNote}
          {issues.length > 0 && <ul className="dt-epics">{issues.slice(0, 3).map(i => <li key={`${i.site}-${i.key}`}><button type="button" className="dt-epic" onClick={() => setReading(i)}>
            <b className="dt-epic-badge">{i.project.charAt(0)}</b>
            <span className="dt-epic-main"><span className="dt-epic-title"><code>{i.key}</code><strong>{i.title}</strong></span><small className="dt-epic-status-active">{i.status}</small></span>
            <span />{svg(CHEVRON, 'dt-chevron')}
          </button></li>)}</ul>}
        </>}
    </div>
    {reading && createPortal(<JiraIssueDrawer issue={reading} onClose={() => setReading(null)} />, document.body)}
  </section>;
}

// --- Projects ------------------------------------------------------------------

function Cover({ project: p }: { project: Project }) {
  const entry: ProjectEntry | null = p.media?.cover ? { uuid: p.media.cover, type: 'photo', phase: null, body: `${p.title} cover photo`, media: 'server', deviceRef: null, involvesChildren: p.involvesChildren, source: p.source, takenAt: null, createdAt: p.updatedAt } : null;
  return <span className={`dt-cover dt-cover-${p.primaryArea}`}>{entry ? <Picture project={p} entry={entry} /> : svg(AREA_ART[p.primaryArea])}</span>;
}

export function ProjectsCard({ projects, loading, error, onOpen, onOpenProject, onNew, onRetry }: {
  /** Open non-work projects, ranked. */
  projects: Project[]; loading: boolean; error: boolean;
  onOpen: () => void; onOpenProject: (uuid: string) => void; onNew: () => void; onRetry: () => void;
}) {
  const [area, setArea] = useState<Area | 'all'>('all');
  const areas = [...new Set(projects.map(p => p.primaryArea))];
  const active = area !== 'all' && areas.includes(area) ? area : 'all';
  const shown = projects.filter(p => active === 'all' || p.primaryArea === active);
  const count = (pred: (p: Project) => boolean) => projects.filter(pred).length;
  const parts = [
    [count(p => p.effectiveStatus === 'active'), 'active'],
    [count(p => p.effectiveStatus === 'waiting' || p.effectiveStatus === 'blocked'), 'on hold'],
    [count(p => p.effectiveStatus === 'ready'), 'ready'],
  ].filter(([n]) => n) as [number, string][];
  const subtitle = loading && !projects.length ? 'Loading…' : parts.length ? parts.map(([n, w]) => `${n} ${w}`).join(' · ') : `${projects.length} open`;

  return <section className="dh-section dt-card" id="dashboard-projects">
    <CardHeader icon="Projects" glyph={CLIPBOARD} title="Projects" subtitle={subtitle} action="View all" actionArrow="→" onAction={onOpen} />
    {areas.length > 1 && <div className="dt-tabs" role="tablist" aria-label="Project areas">
      {(['all', ...areas] as (Area | 'all')[]).map(a => <button key={a} type="button" role="tab" aria-selected={a === active} className={a === active ? 'active' : undefined} onClick={() => setArea(a)}>
        {a !== 'all' && svg(AREA_ART[a])}{a === 'all' ? 'All' : AREA_LABEL[a]}
      </button>)}
    </div>}
    <div className="dh-section-body dt-body">
      {error && !projects.length ? <p className="dashboard-empty">Projects couldn’t load. <button type="button" className="dt-link" onClick={onRetry}>Retry</button></p>
        : loading && !projects.length ? <p className="dashboard-empty">Loading…</p>
          : !shown.length ? <p className="dashboard-empty">No projects yet. <button type="button" className="dt-link" onClick={onNew}>Start one</button></p>
            : <ul className="dt-projects">{shown.slice(0, 5).map((p, i) => {
              const { done, total } = p.progress.steps;
              const finished = total > 0 && done >= total;
              const pct = total ? Math.round((done / total) * 100) : null;
              return <li key={p.uuid}><button type="button" className={`dt-project${i === 0 ? ' dt-project-lead' : ''}`} onClick={() => onOpenProject(p.uuid)}>
                <Cover project={p} />
                <span className="dt-project-main">
                  <strong title={p.title}>{p.title}</strong>
                  <small>{svg(AREA_ART[p.primaryArea])}<b>{AREA_LABEL[p.primaryArea]}</b> · {STATE_LABEL[p.effectiveStatus]}</small>
                  {total ? <span className="dt-epic-progress"><span className="dt-track" aria-label={`${done} of ${total} steps done`}><i style={{ width: `${pct}%` }} /></span><em>{finished || total <= 12 ? `${done} / ${total}` : `${pct}%`}</em></span>
                    : <small className="dt-muted">No steps set</small>}
                </span>
                {finished ? <span className="dt-done-mark" title="Every step is done">{svg(CHECK_CIRCLE)}</span>
                  : p.effectiveStatus === 'ready' ? <span className="dt-ready">{svg(<path d="m5 12.5 4.5 4.5L19 7" />)}Ready</span>
                    : svg(CHEVRON, 'dt-chevron')}
              </button></li>;
            })}</ul>}
      {shown.length > 5 && <p className="dt-more-note">+{shown.length - 5} more on the Projects page</p>}
    </div>
  </section>;
}
