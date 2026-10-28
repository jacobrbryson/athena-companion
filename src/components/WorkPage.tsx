import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { dashboardApi, type AgentRun, type CalendarEvent, type JiraIssue, type Website, type Workplace, type WorkplacesOverview } from '../api/dashboard';
import type { Project } from '../api/projects';
import { areaOf, clock, zonedDay } from './CalendarPage';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import './health.css';
import './calendar.css';
import './family.css';
import './work.css';

/**
 * The Work page (redesigned 2026-10-16 from the owner's concept): a head over
 * the desk, four numbers, the workspaces as cards, then Jira, Slack and
 * Athena's agents, the work projects, the site monitors and the week's work
 * meetings, a blend of recent activity and quick actions. The editable lists
 * (workplaces, websites, projects) stay below it in Dashboard.tsx.
 *
 * A workspace is a workplace (athena_workplace) — a job, a company you co-own,
 * your own projects — and owns what is linked to it: connections, addresses,
 * and since migration 0079 its sites and projects. Nothing is assigned to a
 * workspace by guessing; a Jira issue counts toward one only when its site is
 * a Jira connection linked there.
 *
 * Every number is read from something real; where a source is missing the
 * panel says so, with the button that fixes it.
 */

type Slack = { workspace: string; messages: { text: string; channel: string; url: string; timestamp: string }[] };
interface Props {
  issues: JiraIssue[];
  /** Why Jira can't be read, with its fix; null when it can. */
  jiraNote: ReactNode;
  slack: Slack | null;
  slackNote: ReactNode;
  /** Projects in the work area (the Projects snapshot), or null while it loads. */
  projects: Project[] | null;
  events: CalendarEvent[];
  timeZone?: string;
  now: number;
  /** Workplaces as the panel below last saw them; the overview reads its own until then. */
  workplaces: WorkplacesOverview | null;
  onWorkplaces: (o: WorkplacesOverview) => void;
  onAsk: (text: string) => void;
  onOpenProject: (uuid: string) => void;
  onNewProject: () => void;
  onConnect: () => void;
  onMemory: () => void;
  /** Scroll to one of the detail panels below by its id. */
  onSection: (id: string) => void;
  onOpenIssue: (url: string) => void;
}

const DAY = 86400000;
/** One colour per workspace, in the order they're listed (primary first). */
const TONES = ['#33e0a1', '#ff9a3c', '#a77bff', '#3aa6ff', '#ff5d6c', '#f6c33a', '#5fd3e8'];
const PROVIDER_ICON: Record<string, string> = { jira: 'list', slack: 'chat', gmail: 'speech', google_calendar: 'calendar', github: 'code', websites: 'globe', openai: 'bot', anthropic: 'bot', google_contacts: 'people' };
const hostOf = (s: string) => s.toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#\s]/)[0];

function ago(value?: string | number | null) {
  const at = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return minutes < 1 ? 'just now' : `${minutes} min ago`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60); return `${h} hr${h === 1 ? '' : 's'} ago`; }
  const d = Math.floor(minutes / 1440);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
/** Slack timestamps are seconds with a fraction ("1760621000.1234"). */
const slackTime = (ts: string) => Math.round(Number(ts) * 1000);

/** In progress, in review, or not started — by Jira's own category first, the status name second. */
function phaseOf(issue: JiraIssue): 'review' | 'progress' | 'todo' {
  if (/review|qa|testing|verify/i.test(issue.status)) return 'review';
  if (issue.statusCategory === 'indeterminate' || /progress|doing|started/i.test(issue.status)) return 'progress';
  return 'todo';
}
const STATE_WORD: Record<NonNullable<AgentRun['state']>, string> = { working: 'Working', no_change: 'No change', failed: 'Failed', open: 'PR open', merged: 'Merged', closed: 'Closed', unknown: 'Unknown' };
const PHASE_TONE ={ review: 'wp-chip-violet', progress: 'wp-chip-amber', todo: 'wp-chip-blue' } as const;

type ProjectPhase = 'active' | 'hold' | 'done';
function projectPhase(p: Project): ProjectPhase | null {
  const s = p.effectiveStatus;
  if (s === 'done') return 'done';
  if (s === 'dropped') return null;
  if (s === 'waiting' || s === 'blocked') return 'hold';
  return 'active';
}

/** Who owns what: the workspace each site, project and Jira site belongs to. */
function ownership(places: Workplace[]) {
  const site = new Map<string, number>();
  const project = new Map<string, number>();
  const jira: { host: string; index: number }[] = [];
  places.forEach((w, index) => {
    w.sites?.forEach(s => site.set(s.siteUuid, index));
    w.projects?.forEach(p => project.set(p.projectUuid, index));
    for (const c of w.connections) {
      if (c.provider !== 'jira' || !c.account) continue;
      for (const part of c.account.split('·')) { const host = hostOf(part.trim()); if (host.includes('.')) jira.push({ host, index }); }
    }
  });
  const ofIssue = (i: JiraIssue) => { const host = hostOf(i.site || i.url || ''); return jira.find(j => host === j.host || host.endsWith(`.${j.host}`) || j.host.endsWith(`.${host}`))?.index ?? null; };
  return { site, project, ofIssue };
}

function Spark({ values, ok }: { values: (number | null)[]; ok: boolean }) {
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return <span className="wp-spark wp-spark-empty" />;
  const max = Math.max(...nums, 1);
  return <span className="wp-spark" aria-hidden="true">{values.map((v, i) => <i key={i} className={v == null ? 'wp-spark-miss' : ok ? '' : 'wp-spark-bad'} style={{ height: `${v == null ? 12 : Math.max(18, (v / max) * 100)}%` }} />)}</span>;
}

export function WorkOverview(props: Props) {
  const { issues, jiraNote, slack, slackNote, projects, events, timeZone, now, onAsk, onOpenProject, onNewProject, onConnect, onMemory, onSection } = props;
  const [own, setOwn] = useState<WorkplacesOverview | null>(props.workplaces);
  const [ownError, setOwnError] = useState('');
  const [sites, setSites] = useState<Website[] | null>(null);
  const [sitesError, setSitesError] = useState('');
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [issueTab, setIssueTab] = useState<'all' | 'progress' | 'review'>('all');
  const [projectTab, setProjectTab] = useState<ProjectPhase>('active');
  const [managing, setManaging] = useState<Workplace | null>(null);

  // The panel below owns edits; whatever it last loaded wins over ours.
  useEffect(() => { if (props.workplaces) setOwn(props.workplaces); }, [props.workplaces]);
  useEffect(() => {
    let alive = true;
    if (!props.workplaces) dashboardApi.workplaces().then(o => { if (alive) setOwn(o); }).catch(e => { if (alive) setOwnError((e as Error).message || 'Workspaces couldn’t load.'); });
    // Opening the page checks any site not checked in ten minutes.
    dashboardApi.checkWebsites().then(r => { if (alive) setSites(r.sites); })
      .catch(() => dashboardApi.websites().then(r => { if (alive) setSites(r.sites); }).catch(e => { if (alive) setSitesError((e as Error).message || 'Sites couldn’t load.'); }));
    dashboardApi.workAgents().then(r => { if (alive) setRuns(r.runs); }).catch(() => { if (alive) setRuns([]); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const places = own?.workplaces || [];
  const owns = useMemo(() => ownership(places), [places]);
  const nameOf = (index: number | null | undefined) => (index == null ? null : places[index]?.name ?? null);
  const toneOf = (index: number | null | undefined) => (index == null ? '#6c8199' : TONES[index % TONES.length]);
  const linksBuilt = places.some(w => w.sites !== undefined);

  const workProjects = (projects || []).filter(p => projectPhase(p));
  const byPhase = (phase: ProjectPhase) => workProjects.filter(p => projectPhase(p) === phase);
  const healthy = (sites || []).filter(s => s.uptime?.ok).length;
  const down = (sites || []).filter(s => s.uptime && !s.uptime.ok).length;
  const mentions = slack?.messages || [];

  const shownIssues = issues.filter(i => issueTab === 'all' || phaseOf(i) === issueTab);
  const today = zonedDay(new Date(now), timeZone);
  const weekOut = zonedDay(new Date(now + 7 * DAY), timeZone);
  const meetings = events
    .filter(e => !e.allDay && Date.parse(e.end) > now && zonedDay(new Date(e.start), timeZone) <= weekOut && areaOf(e, null) === 'work')
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const activity = [
    ...[...issues].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)).slice(0, 3).map(i => ({ key: `j-${i.key}`, at: Date.parse(i.updated), icon: 'list', tone: 'wp-badge-blue', title: `${i.key} updated`, sub: `Status → ${i.status}`, ask: `What's the latest on ${i.key}?` })),
    ...mentions.slice(0, 2).map(m => ({ key: `s-${m.timestamp}`, at: slackTime(m.timestamp), icon: 'chat', tone: 'wp-badge-violet', title: `Mentioned in #${m.channel}`, sub: m.text, ask: `Help me reply to the Slack mention in #${m.channel}.` })),
    ...(runs || []).slice(0, 2).map(r => ({ key: `a-${r.uuid}`, at: Date.parse(r.at), icon: 'bot', tone: 'wp-badge-indigo', title: r.kind === 'fix' ? 'Code fix requested' : 'Investigation started', sub: r.summary || r.repo || '', ask: `What did the agents find on ${r.summary || 'that'}?` })),
    ...(sites?.length && sites.some(s => s.uptime) ? [{ key: 'sites', at: Math.max(...sites.map(s => Date.parse(s.uptime?.checkedAt || '') || 0)), icon: 'globe', tone: down ? 'wp-badge-red' : 'wp-badge-green', title: 'Site check', sub: down ? `${down} site${down === 1 ? '' : 's'} down` : 'All sites healthy', ask: 'How are my sites doing?' }] : []),
  ].filter(a => Number.isFinite(a.at)).sort((a, b) => b.at - a.at).slice(0, 5);

  const names = places.map(w => w.name);
  const blurb = names.length > 1
    ? `Everything across ${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names[names.length - 1]} — issues, messages, projects, site health, and the work Athena is doing for you.`
    : 'Issues, messages, projects, site health, and the work Athena is doing for you.';

  return <div className="hp cp wp">
    <PageHeader eyebrow="YOUR WORK, IN FOCUS" title="Work" blurb={blurb} backdrop="/assets/2f4d6755-5cc2-4e5d-aebd-44e2afcc49b2.png" />

    <section className="cp-stats" aria-label="Your work at a glance">
      <button type="button" className="hp-tile cp-stat" onClick={() => onSection('work-jira')}>
        <span className="hp-badge hp-badge-lg hp-blue"><Icon name="list" /></span>
        <div><span>Open issues</span><strong>{jiraNote ? '—' : issues.length}</strong><small>{jiraNote ? 'Jira unavailable' : 'assigned to you'}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={() => (slackNote ? onConnect() : onSection('work-slack'))}>
        <span className="hp-badge hp-badge-lg hp-violet"><Icon name="chat" /></span>
        <div><span>Slack mentions</span><strong>{slackNote ? '—' : mentions.length}</strong><small>{slackNote ? 'Not connected' : slack?.workspace || 'last 7 days'}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={() => onSection('work-projects')}>
        <span className="hp-badge hp-badge-lg hp-green"><Icon name="folder" /></span>
        <div><span>Work projects</span><strong>{projects ? byPhase('active').length + byPhase('hold').length : '—'}</strong><small>{projects ? `${byPhase('active').length} active · ${byPhase('hold').length} on hold` : 'Loading…'}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
      <button type="button" className="hp-tile cp-stat" onClick={() => onSection('work-sites')}>
        <span className={`hp-badge hp-badge-lg ${down ? 'hp-red' : 'hp-green'}`}><Icon name="pulse" /></span>
        <div><span>Sites monitored</span><strong>{sites ? sites.length : '—'}</strong><small>{!sites ? 'Checking…' : !sites.length ? 'No sites yet' : down ? `${down} down` : healthy === sites.length ? 'All healthy' : `${healthy} of ${sites.length} checked healthy`}</small></div>
        <Icon name="chevron" className="hp-chev" />
      </button>
    </section>

    <section className="hp-panel wp-spaces">
      <header>
        <h2><Icon name="briefcase" className="wp-head-icon" /> Workspaces <span>Your companies and projects, all in one place.</span></h2>
        <button type="button" className="cp-outline" onClick={() => onSection('work-workplaces')}><Icon name="plus" /> Add workspace</button>
      </header>
      {ownError ? <p className="hp-empty">{ownError}</p>
        : !own ? <p className="hp-empty">Loading…</p>
          : !places.length ? <div className="fp-empty-hero"><Icon name="briefcase" className="fp-empty-icon" /><strong>No workspaces yet</strong><p>Add where you work — a job, a company you co-own, your own projects — and link its Jira, Slack, email, sites and projects.</p><button type="button" className="cp-outline" onClick={() => onSection('work-workplaces')}>Add a workspace <Icon name="arrowRight" /></button></div>
            : <ul className="wp-space-cards">{places.map((w, index) => {
              const issueCount = issues.filter(i => owns.ofIssue(i) === index).length;
              const projectCount = workProjects.filter(p => owns.project.get(p.uuid) === index && projectPhase(p) !== 'done').length;
              const siteCount = (sites || []).filter(s => owns.site.get(s.uuid) === index).length;
              return <li key={w.uuid} style={{ '--wp-tone': toneOf(index) } as CSSProperties}>
                <div className="wp-space-head">
                  <span className="wp-space-mark">{w.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{w.name}{w.primary && <em className="wp-primary">Primary</em>}</strong>
                    {w.role && <small>{w.role}</small>}
                    {w.domain && <a href={`https://${w.domain}`} target="_blank" rel="noopener noreferrer">{w.domain} <Icon name="arrowRight" /></a>}
                  </div>
                  <button type="button" className="wp-kebab" aria-label={`Manage ${w.name}`} onClick={() => setManaging(w)}><Icon name="dots" /></button>
                </div>
                <div className="wp-conn">{w.connections.length || w.emails.length
                  ? <>{w.connections.map(c => <span key={c.uuid} className={c.status === 'active' ? 'wp-conn-ok' : 'wp-conn-bad'} title={c.account || c.label}><i />{c.label.replace(/^Google /, '').replace(' Cloud', '')}</span>)}
                    {w.emails.length > 0 && <span className="wp-conn-ok" title={w.emails.map(e => e.email).join(', ')}><i />Email</span>}</>
                  : <small>Nothing linked yet</small>}
                </div>
                <button type="button" className="wp-space-foot" onClick={() => setManaging(w)}>
                  <span>{issueCount} issue{issueCount === 1 ? '' : 's'}</span><span>{projectCount} project{projectCount === 1 ? '' : 's'}</span><span>{siteCount} site{siteCount === 1 ? '' : 's'}</span>
                  <Icon name="chevron" className="hp-chev" />
                </button>
              </li>;
            })}</ul>}
    </section>

    <div className="cp-bottom wp-row">
      <section className="hp-panel wp-jira" id="work-jira-overview">
        <header><h2><Icon name="list" className="wp-head-icon wp-blue" /> Jira <span>Open issues</span></h2><button type="button" className="hp-link" onClick={() => onSection('work-jira')}>View all <Icon name="arrowRight" /></button></header>
        {jiraNote ? jiraNote : <>
          <div className="hp-tabs wp-tabs" role="tablist">
            {([['all', `Assigned to you (${issues.length})`], ['progress', `In progress (${issues.filter(i => phaseOf(i) === 'progress').length})`], ['review', `Review (${issues.filter(i => phaseOf(i) === 'review').length})`]] as const).map(([id, label]) =>
              <button key={id} type="button" role="tab" aria-selected={issueTab === id} className={issueTab === id ? 'active' : ''} onClick={() => setIssueTab(id)}>{label}</button>)}
          </div>
          {!shownIssues.length ? <p className="hp-empty">{issues.length ? 'Nothing in this list.' : 'No open issues assigned to you.'}</p>
            : <ul className="wp-issues">{shownIssues.slice(0, 5).map(i => {
              const owner = owns.ofIssue(i);
              return <li key={`${i.site}-${i.key}`}><button type="button" className="wi-open" onClick={() => props.onOpenIssue(i.url)}>
                <i className="wp-dot" style={{ background: toneOf(owner) }} />
                <span className="wp-key">{i.key}</span>
                <div><strong>{i.title}</strong><small>{[nameOf(owner), i.project].filter(Boolean).join(' · ')}</small></div>
                <em className={`wp-chip ${PHASE_TONE[phaseOf(i)]}`}>{i.status}</em>
              </button></li>;
            })}</ul>}
          {issues.length > 0 && <button type="button" className="cp-outline fp-wide" onClick={() => onSection('work-jira')}>View all {issues.length} issue{issues.length === 1 ? '' : 's'} <Icon name="arrowRight" /></button>}
        </>}
      </section>

      <section className="hp-panel wp-slack">
        <header><h2><Icon name="chat" className="wp-head-icon wp-violet" /> Slack <span>Messages that need you</span></h2>{slackNote ? <button type="button" className="hp-link" onClick={onConnect}>Connect <Icon name="arrowRight" /></button> : <button type="button" className="hp-link" onClick={() => onSection('work-slack')}>View all <Icon name="arrowRight" /></button>}</header>
        {slackNote ? <div className="fp-empty-hero"><Icon name="chat" className="fp-empty-icon" /><strong>Slack not connected</strong><p>Connect your workspace to see the messages that mention you.</p><button type="button" className="cp-outline" onClick={onConnect}>Connect Slack <Icon name="arrowRight" /></button></div>
          : !mentions.length ? <div className="fp-empty-hero"><Icon name="chat" className="fp-empty-icon" /><strong>Nothing needs you</strong><p>No mentions in {slack?.workspace || 'Slack'} in the last 7 days.</p></div>
            : <ul className="wp-rows">{mentions.slice(0, 5).map(m => <li key={m.timestamp}><a href={m.url} target="_blank" rel="noopener noreferrer">
              <span className="hp-badge hp-violet"><Icon name="chat" /></span>
              <div><strong>#{m.channel}</strong><small className="wp-clamp">{m.text}</small></div>
              <small className="wp-when">{ago(slackTime(m.timestamp))}</small>
            </a></li>)}</ul>}
      </section>

      <section className="hp-panel wp-agents">
        <header><h2><Icon name="bot" className="wp-head-icon wp-blue" /> Athena’s Agents <span>Work happening in the background</span></h2></header>
        <ul className="wp-rows">
          {(runs || []).slice(0, 4).map(r => <li key={r.uuid}><button type="button" onClick={() => onAsk(`What did the agents find on ${r.summary || 'that'}?`)}>
            <span className={`hp-badge hp-badge-lg ${r.kind === 'fix' ? 'hp-green' : 'hp-indigo'}`}><Icon name="code" /></span>
            <div><strong>{r.kind === 'fix' ? 'Code fix' : 'Code investigation'}</strong><small className="wp-clamp">{r.summary || 'No description'}</small><small>{r.repo}</small></div>
            <small className="wp-when"><i className={`wp-live ${r.state === 'failed' || r.state === 'closed' ? 'wp-live-bad' : r.state === 'merged' || r.state === 'no_change' ? 'wp-live-done' : ''}`} />{r.state ? STATE_WORD[r.state] : ago(r.at)}</small>
          </button></li>)}
          <li><button type="button" onClick={() => onSection('work-sites')}>
            <span className={`hp-badge hp-badge-lg ${down ? 'hp-red' : 'hp-green'}`}><Icon name="pulse" /></span>
            <div><strong>Site Monitor</strong><small>{!sites ? 'Checking…' : !sites.length ? 'No sites to watch yet' : down ? `${down} site${down === 1 ? '' : 's'} down` : 'All sites healthy'}</small><small>{sites ? `${sites.length} site${sites.length === 1 ? '' : 's'}` : ''}</small></div>
            <small className="wp-when"><i className={`wp-live${down ? ' wp-live-bad' : ''}`} />{sites?.some(s => s.uptime) ? ago(Math.max(...sites.map(s => Date.parse(s.uptime?.checkedAt || '') || 0))) : ''}</small>
          </button></li>
        </ul>
        {runs && !runs.length && <p className="hp-footnote">No code investigations or fixes this week. Ask me to look into a bug and the agents’ work shows up here.</p>}
      </section>
    </div>

    <div className="cp-bottom wp-row wp-row-b">
      <section className="hp-panel wp-projects">
        <header><h2><Icon name="folder" className="wp-head-icon wp-blue" /> Work Projects <span>Your active work across all workspaces</span></h2><button type="button" className="hp-link" onClick={() => onSection('work-projects')}>View all <Icon name="arrowRight" /></button></header>
        {!projects ? <p className="hp-empty">Loading…</p> : <>
          <div className="hp-tabs wp-tabs" role="tablist">
            {([['active', 'Active'], ['hold', 'On hold'], ['done', 'Completed']] as const).map(([id, label]) =>
              <button key={id} type="button" role="tab" aria-selected={projectTab === id} className={projectTab === id ? 'active' : ''} onClick={() => setProjectTab(id)}>{label} ({byPhase(id).length})</button>)}
          </div>
          {!byPhase(projectTab).length ? <p className="hp-empty">{workProjects.length ? 'Nothing in this list.' : 'No work projects yet.'}</p>
            : <ul className="wp-project-list">{byPhase(projectTab).slice(0, 6).map(p => {
              const owner = owns.project.get(p.uuid);
              const { done, total } = p.progress.steps;
              return <li key={p.uuid}><button type="button" onClick={() => onOpenProject(p.uuid)}>
                <i className="wp-dot" style={{ background: toneOf(owner) }} />
                <span className="wp-project-name">{p.title}{nameOf(owner) && <small> ({nameOf(owner)})</small>}</span>
                <span className="hp-bar hp-bar-thin wp-bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
                <span className="wp-count">{total ? `${done}/${total}` : '—'}</span>
                <em className={`wp-chip ${projectTab === 'active' ? 'wp-chip-green' : projectTab === 'hold' ? 'wp-chip-amber' : 'wp-chip-blue'}`}>{projectTab === 'active' ? 'Active' : projectTab === 'hold' ? 'On hold' : 'Done'}</em>
              </button></li>;
            })}</ul>}
          <button type="button" className="cp-outline fp-wide" onClick={onNewProject}><Icon name="plus" /> Add a work project</button>
        </>}
      </section>

      <section className="hp-panel wp-sites">
        <header><h2><Icon name="globe" className="wp-head-icon wp-blue" /> Site Monitors <span>Your sites and services</span></h2><button type="button" className="hp-link" onClick={() => onSection('work-sites')}>View all <Icon name="arrowRight" /></button></header>
        {sitesError ? <p className="hp-empty">{sitesError}</p>
          : !sites ? <p className="hp-empty">Checking your sites…</p>
            : !sites.length ? <div className="fp-empty-hero"><Icon name="globe" className="fp-empty-icon" /><strong>No sites yet</strong><p>Add a site and I’ll check it’s up and how fast it answers.</p><button type="button" className="cp-outline" onClick={() => onSection('work-sites')}>Add a site <Icon name="arrowRight" /></button></div>
              : <ul className="wp-site-list">{sites.slice(0, 5).map(s => {
                const up = s.uptime;
                return <li key={s.uuid} title={up?.error || undefined}>
                  <span className={`wp-site-state ${!up ? 'wp-site-idle' : up.ok ? 'wp-site-ok' : 'wp-site-bad'}`}><Icon name={!up ? 'minus' : up.ok ? 'check' : 'down'} /></span>
                  <div><strong>{s.domain}</strong><small className={!up ? '' : up.ok ? 'wp-ok' : 'wp-bad'}>{!up ? 'Not checked yet' : up.ok ? 'Healthy' : up.error || 'Down'}</small>{up?.ms != null && <small>{up.ms} ms</small>}</div>
                  <Spark values={(up?.recent || []).map(c => c.ms)} ok={!!up?.ok} />
                </li>;
              })}</ul>}
        {!linksBuilt && own && places.length > 0 && <p className="hp-footnote">Sites and projects can be given to a workspace once the database is updated (migration 0079).</p>}
      </section>

      <section className="hp-panel wp-upcoming">
        <header><h2><Icon name="calendar" className="wp-head-icon wp-blue" /> Upcoming <span>(Work)</span></h2><small className="wp-sub">Next 7 days</small></header>
        {!meetings.length ? <p className="hp-empty">No work meetings in the next 7 days.</p>
          : <ul className="fp-dated wp-dated">{meetings.slice(0, 5).map((e, i) => {
            const d = new Date(e.start);
            const isToday = zonedDay(d, timeZone) === today;
            return <li key={`${e.id}-${i}`}><button type="button" onClick={() => onAsk(`Help me prepare for "${e.title}".`)}>
              <span className="fp-date"><small>{isToday ? 'TODAY' : d.toLocaleDateString(undefined, { timeZone, weekday: 'short' }).toUpperCase()}</small>{d.toLocaleDateString(undefined, { timeZone, day: 'numeric' })}</span>
              <div><strong>{e.title}</strong><small>{e.calendar || 'Calendar'}</small></div>
              <small className="wp-when">{clock(e.start, timeZone)}</small>
            </button></li>;
          })}</ul>}
      </section>
    </div>

    <section className="hp-panel wp-activity">
      <header><h2><Icon name="pulse" className="wp-head-icon wp-blue" /> Recent Work Activity <span>A blend of issues, messages, agent work and site checks</span></h2></header>
      {!activity.length ? <p className="hp-empty">Nothing recent yet.</p>
        : <ul>{activity.map(a => <li key={a.key}><button type="button" onClick={() => onAsk(a.ask)}>
          <span className={`hp-badge hp-badge-lg ${a.tone}`}><Icon name={a.icon} /></span>
          <div><small>{ago(a.at)}</small><strong>{a.title}</strong><small className="wp-clamp-1">{a.sub}</small></div>
        </button></li>)}</ul>}
    </section>

    <section className="hp-panel wp-quick">
      <header><h2><Icon name="bolt" className="wp-head-icon wp-blue" /> Quick Actions</h2></header>
      <ul>
        <li><button type="button" onClick={() => onAsk('')}><Icon name="chat" />Ask a question</button></li>
        <li><button type="button" onClick={onNewProject}><Icon name="folder" />Add a work project</button></li>
        <li><button type="button" onClick={() => onAsk('Help me create a task for work.')}><Icon name="task" />Create a task</button></li>
        <li><button type="button" onClick={() => onAsk('Help me review my open Jira issues — what should I do first?')}><Icon name="list" />Review open issues</button></li>
        <li><button type="button" onClick={onConnect}><Icon name="link" />Connect an app</button></li>
        <li><button type="button" onClick={onMemory}><Icon name="book" />Explore memories</button></li>
      </ul>
    </section>

    {managing && <ManageWorkspace workplace={places.find(w => w.uuid === managing.uuid) || managing} places={places} sites={sites || []} projects={workProjects}
      onClose={() => setManaging(null)} onChanged={o => { setOwn(o); props.onWorkplaces(o); }} onEdit={() => { setManaging(null); onSection('work-workplaces'); }} />}
  </div>;
}

/**
 * Which sites and work projects are this workspace's. A tick links it here
 * (refused, with the other workspace's name, if it is already someone else's —
 * exclusive, like connections); untick unlinks it.
 */
function ManageWorkspace({ workplace, places, sites, projects, onClose, onChanged, onEdit }: {
  workplace: Workplace; places: Workplace[]; sites: Website[]; projects: Project[];
  onClose: () => void; onChanged: (o: WorkplacesOverview) => void; onEdit: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const elsewhere = useCallback((kind: 'sites' | 'projects', id: string) => places.find(w => w.uuid !== workplace.uuid && (kind === 'sites' ? w.sites?.some(s => s.siteUuid === id) : w.projects?.some(p => p.projectUuid === id)))?.name ?? null, [places, workplace.uuid]);
  const toggle = async (kind: 'site' | 'project', id: string) => {
    const link = kind === 'site' ? workplace.sites?.find(s => s.siteUuid === id) : workplace.projects?.find(p => p.projectUuid === id);
    setBusy(id); setError('');
    try {
      onChanged(link ? await dashboardApi.unlinkWorkplace(workplace.uuid, link.uuid) : await dashboardApi.linkWorkplace(workplace.uuid, kind === 'site' ? { site: id } : { project: id }));
    } catch (e) {
      setError((e as Error & { body?: { message?: string } }).body?.message || (e as Error).message || 'Couldn’t change that.');
    } finally { setBusy(null); }
  };
  const ready = workplace.sites !== undefined;
  return <div className="health-modal" role="dialog" aria-modal="true" aria-label={`Manage ${workplace.name}`}>
    <div className="health-modal-backdrop" onClick={onClose} />
    <div className="health-modal-card hp-modal wp-manage">
      <header><div><small>WORKSPACE</small><h2>{workplace.name}</h2></div><button type="button" className="health-modal-close" aria-label="Close" onClick={onClose}>✕</button></header>
      {!ready ? <p className="hp-empty">Sites and projects can be given to a workspace once the database is updated (migration 0079).</p> : <>
        <h3>Sites</h3>
        {!sites.length ? <p className="hp-empty">No sites yet — add one under Site monitors below.</p>
          : <ul>{sites.map(s => {
            const mine = !!workplace.sites?.some(l => l.siteUuid === s.uuid);
            const other = elsewhere('sites', s.uuid);
            return <li key={s.uuid}><label className={other ? 'wp-taken' : undefined}><input type="checkbox" checked={mine} disabled={busy === s.uuid || !!other} onChange={() => void toggle('site', s.uuid)} />{s.domain}{other && <small>· {other}</small>}</label></li>;
          })}</ul>}
        <h3>Work projects</h3>
        {!projects.length ? <p className="hp-empty">No work projects yet.</p>
          : <ul>{projects.map(p => {
            const mine = !!workplace.projects?.some(l => l.projectUuid === p.uuid);
            const other = elsewhere('projects', p.uuid);
            return <li key={p.uuid}><label className={other ? 'wp-taken' : undefined}><input type="checkbox" checked={mine} disabled={busy === p.uuid || !!other} onChange={() => void toggle('project', p.uuid)} />{p.title}{other && <small>· {other}</small>}</label></li>;
          })}</ul>}
      </>}
      {error && <p className="hp-error" role="status">{error}</p>}
      <div className="hp-form-actions"><button type="button" className="hp-link" onClick={onEdit}>Edit name, role and connections <Icon name="arrowRight" /></button><button type="button" className="dashboard-chat-cta" onClick={onClose}>Done <span>↗</span></button></div>
    </div>
  </div>;
}
