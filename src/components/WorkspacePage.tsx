import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { dashboardApi, type AgentRun, type CalendarEvent, type JiraIssue, type TriageEmail, type Website, type WorkspaceExtras, type WorkspacePull, type WorkplacesOverview } from '../api/dashboard';
import { areaOf, clock, zonedDay } from './CalendarPage';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import { SectionTabs } from './PageTabs';
import { Stat } from './SectionMetric';
import { DrawerButton } from './ActionControls';
import { PullRequestReviewDrawer, RepositoryReviewDrawer } from './WorkspaceReviewDrawers';
import { WorkspaceSettingsDrawer } from './WorkspaceSettingsDrawer';
import { AgentRow, PHASE_TONE, Spark, TONES, ago, ownership, phaseOf, slackTime, useAgentProgress } from './WorkPage';
import './health.css';
import './calendar.css';
import './family.css';
import './property.css';
import './work.css';
import './workspace.css';

const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', icon: 'Work' },
  { id: 'jira', label: 'Jira', icon: 'Issues' },
  { id: 'github', label: 'GitHub', icon: 'Work' },
  { id: 'deployments', label: 'Deployments', icon: 'Projects' },
  { id: 'monitoring', label: 'Monitoring', icon: 'Health' },
  { id: 'team', label: 'Team', icon: 'Family' },
  { id: 'docs', label: 'Docs', icon: 'Projects' },
] as const;
type WorkspaceTab = typeof WORKSPACE_TABS[number]['id'];

// Design previews until the owner connects deployment and service feeds.
const DEPLOYMENTS = [
  ['Production', 'v1.24.3', 'Oct 29, 10:41 AM', 'github-actions'],
  ['Staging', 'v1.24.3', 'Oct 29, 9:12 AM', 'rossbryson'],
  ['Development', 'v1.24.2', 'Oct 28, 4:33 PM', 'github-actions'],
];
const SERVICES = ['API (dream-backend)', 'Web (dream-frontend)', 'NetSuite Sync', 'Device Telemetry', 'Email Service'];

/**
 * One workspace's own dashboard (/work/<uuid>), opened from its card on Work.
 * Overview follows the owner's command-center concept; shared section tabs
 * retain Jira, Slack, sites, epics, upcoming events and agents. Deployment,
 * service and business previews are explicitly labeled until feeds arrive.
 *
 * Nothing here is guessed onto a workspace: Jira issues and sites count only
 * when linked to it; mail is matched by the sender's domain; pull requests and
 * epics are read with the keys linked to this workspace. A card whose source
 * isn't connected says so, with the way to fix it.
 */

type Slack = { workspace: string; messages: { text: string; channel: string; url: string; timestamp: string }[] };
interface Props {
  workspaceUuid: string;
  issues: JiraIssue[];
  jiraNote: ReactNode;
  slack: Slack | null;
  slackNote: ReactNode;
  events: CalendarEvent[];
  timeZone?: string;
  now: number;
  workplaces: WorkplacesOverview | null;
  onWorkplaces: (o: WorkplacesOverview) => void;
  onAsk: (text: string) => void;
  onConnect: () => void;
  onOpenIssue: (url: string) => void;
  onBack: () => void;
}

const DAY = 86400000;
/** Repositories that lead the pull-request card, in this order; every other repo follows by most recent change. */
const REPO_ORDER = ['helpful_db_scripts', 'dream-backend', 'dream_frontned'];
const repoRank = (repo: string) => {
  const i = REPO_ORDER.indexOf(repo.toLowerCase());
  return i < 0 ? REPO_ORDER.length : i;
};
const domainOf = (address: string | null | undefined) => (address || '').toLowerCase().split('@')[1]?.trim() || '';

const PULL_NOTE: Record<string, string> = {
  not_connected: 'No GitHub key is linked to this workspace. Add one under Work → Development environments & keys.',
  rejected: 'GitHub refused this workspace’s key. Replace it under Work → Development environments & keys.',
  unavailable: 'GitHub couldn’t be read right now.',
  unsupported: 'GitHub couldn’t be read right now.',
};
const EPIC_NOTE: Record<string, string> = {
  not_connected: 'No Jira connection is linked to this workspace yet.',
  unsupported: 'Epics can be read once this workspace’s Jira is connected with an API token.',
  rejected: 'Jira refused this workspace’s API token.',
  unavailable: 'Jira epics couldn’t be read right now.',
};

/** Open pull requests grouped by repository, the named repositories first. */
export function groupPulls(items: WorkspacePull[]) {
  const groups = new Map<string, WorkspacePull[]>();
  for (const pr of items) groups.set(pr.repo, [...(groups.get(pr.repo) || []), pr]);
  const newest = (list: WorkspacePull[]) => Math.max(...list.map(p => Date.parse(p.updatedAt) || 0));
  return [...groups.entries()]
    .map(([repo, list]) => ({ repo, list: [...list].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)) }))
    .sort((a, b) => repoRank(a.repo) - repoRank(b.repo) || newest(b.list) - newest(a.list) || a.repo.localeCompare(b.repo));
}

function Card({ id, wide, icon, tone = 'wp-blue', title, sub, action, children }: { id?: string; wide?: boolean; icon: string; tone?: string; title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return <section id={id} className={`hp-panel wsd-card${wide ? ' wsd-wide' : ''}`}>
    <header><Icon name={icon} className={`wp-head-icon ${tone}`} /><h2>{title}{sub && <span>{sub}</span>}</h2>{action}</header>
    {children}
  </section>;
}

function Fix({ icon, title, text, button, onClick }: { icon: string; title: string; text: string; button?: string; onClick?: () => void }) {
  return <div className="fp-empty-hero"><Icon name={icon} className="fp-empty-icon" /><strong>{title}</strong><p>{text}</p>{button && <button type="button" className="cp-outline" onClick={onClick}>{button} <Icon name="arrowRight" /></button>}</div>;
}

export function WorkspacePage(props: Props) {
  const { workspaceUuid, issues, jiraNote, slack, slackNote, events, timeZone, now, onAsk, onConnect, onOpenIssue, onBack } = props;
  const [own, setOwn] = useState<WorkplacesOverview | null>(props.workplaces);
  const [ownError, setOwnError] = useState('');
  const [extras, setExtras] = useState<WorkspaceExtras | null>(null);
  const [extrasError, setExtrasError] = useState('');
  const [sites, setSites] = useState<Website[] | null>(null);
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [mail, setMail] = useState<TriageEmail[] | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [activityFilter, setActivityFilter] = useState('All');
  const [pullFilter, setPullFilter] = useState('Open');
  const [mailFilter, setMailFilter] = useState('All new');
  const [drawer, setDrawer] = useState<{ kind: 'repository'; repository: string } | { kind: 'pull'; repository: string; number: number } | { kind: 'keys' } | null>(null);
  const [returnTo, setReturnTo] = useState<{ kind: 'pull'; repository: string; number: number } | null>(null);

  // Reviews belong to one company, so this page lists only its own.
  const showRuns = (all: AgentRun[]) => setRuns(all.filter(r => r.kind !== 'review' || r.workplaceUuid === workspaceUuid));
  const loadRuns = () => { dashboardApi.workAgents().then(r => showRuns(r.runs)).catch(() => {}); };
  useAgentProgress(runs, showRuns);

  useEffect(() => { if (props.workplaces) setOwn(props.workplaces); }, [props.workplaces]);
  useEffect(() => {
    let alive = true;
    setExtras(null); setExtrasError('');
    if (!props.workplaces) dashboardApi.workplaces().then(o => { if (alive) { setOwn(o); props.onWorkplaces(o); } }).catch(e => { if (alive) setOwnError((e as Error).message || 'Workspaces couldn’t load.'); });
    dashboardApi.workspaceExtras(workspaceUuid).then(r => { if (alive) setExtras(r); }).catch(e => { if (alive) setExtrasError((e as Error).message || 'This workspace’s GitHub and Jira couldn’t be read.'); });
    dashboardApi.websites().then(r => { if (alive) setSites(r.sites); }).catch(() => { if (alive) setSites([]); });
    dashboardApi.workAgents().then(r => { if (alive) showRuns(r.runs); }).catch(() => { if (alive) setRuns([]); });
    dashboardApi.mailList({ status: 'new', limit: 100 }).then(r => { if (alive) setMail(r.items); }).catch(() => { if (alive) setMail([]); });
    return () => { alive = false; };
  }, [workspaceUuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const places = own?.workplaces || [];
  const index = places.findIndex(w => w.uuid === workspaceUuid);
  const space = index < 0 ? null : places[index];
  const owns = useMemo(() => ownership(places), [places]);
  const tone = TONES[Math.max(index, 0) % TONES.length];

  if (ownError) return <div className="hp cp wp wsd"><p className="hp-empty">{ownError}</p><button type="button" className="cp-outline" onClick={onBack}>Back to Work</button></div>;
  if (!own) return <div className="hp cp wp wsd"><p className="hp-empty">Loading…</p></div>;
  if (!space) return <div className="hp cp wp wsd"><Fix icon="briefcase" title="That workspace isn’t on your list" text="It may have been removed." button="Back to Work" onClick={onBack} /></div>;

  const hasConn = (provider: string) => space.connections.some(c => c.provider === provider);
  const domains = [...new Set([space.domain, ...space.emails.map(e => domainOf(e.email))].filter((d): d is string => !!d).map(d => d.toLowerCase()))];
  const workMail = (mail || []).filter(m => { const d = domainOf(m.from_address); return !!d && domains.some(x => d === x || d.endsWith(`.${x}`)); })
    .sort((a, b) => (Date.parse(b.received_at || b.created_at) || 0) - (Date.parse(a.received_at || a.created_at) || 0));
  const mine = issues.filter(i => owns.ofIssue(i) === index);
  const mentions = hasConn('slack') ? slack?.messages || [] : [];
  const mySites = (sites || []).filter(s => owns.site.get(s.uuid) === index);
  const down = mySites.filter(s => s.uptime && !s.uptime.ok).length;
  const pulls = extras?.pullRequests.items || [];
  const groups = groupPulls(pullFilter === 'Reviewing' ? pulls.filter(p => p.reviewRequested) : pullFilter === 'Drafts' ? pulls.filter(p => p.draft) : pulls);
  const today = zonedDay(new Date(now), timeZone);
  const weekOut = zonedDay(new Date(now + 7 * DAY), timeZone);
  const meetings = events.filter(e => !e.allDay && Date.parse(e.end) > now && zonedDay(new Date(e.start), timeZone) <= weekOut && areaOf(e, null) === 'work')
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const activity = [
    ...[...mine].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)).slice(0, 3).map(i => ({ key: `j-${i.key}`, at: Date.parse(i.updated), icon: 'list', tone: 'wp-badge-blue', title: `${i.key} updated`, sub: `Status → ${i.status}`, ask: `What's the latest on ${i.key}?` })),
    ...[...pulls].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3).map(p => ({ key: `p-${p.id}`, at: Date.parse(p.updatedAt), icon: 'code', tone: 'wp-badge-green', title: `${p.repo} #${p.number}`, sub: p.title, ask: `Walk me through ${p.repoFull}#${p.number}: ${p.title}.` })),
    ...workMail.slice(0, 2).map(m => ({ key: `m-${m.uuid}`, at: Date.parse(m.received_at || m.created_at), icon: 'speech', tone: 'wp-badge-indigo', title: m.subject || '(no subject)', sub: m.from_name || m.from_address || '', ask: `Help me with the email "${m.subject}" from ${m.from_name || m.from_address}.` })),
    ...mentions.slice(0, 2).map(m => ({ key: `s-${m.timestamp}`, at: slackTime(m.timestamp), icon: 'chat', tone: 'wp-badge-violet', title: `Mentioned in #${m.channel}`, sub: m.text, ask: `Help me reply to the Slack mention in #${m.channel}.` })),
    ...(runs || []).slice(0, 2).map(r => ({ key: `a-${r.uuid}`, at: Date.parse(r.at), icon: 'bot', tone: 'wp-badge-indigo', title: r.kind === 'review' ? 'PR review started' : r.kind === 'fix' ? 'Code fix requested' : 'Investigation started', sub: r.summary || r.repo || '', ask: `What did the agents find on ${r.summary || 'that'}?` })),
  ].filter(a => Number.isFinite(a.at)).sort((a, b) => b.at - a.at);
  const activityPrefix: Record<string, string> = { Jira: 'j-', GitHub: 'p-', Mail: 'm-', Slack: 's-', Agents: 'a-' };
  const visibleActivity = activity.filter(a => activityFilter === 'All' || a.key.startsWith(activityPrefix[activityFilter])).slice(0, 8);
  const visibleMail = workMail.filter(m => mailFilter === 'All new' || (mailFilter === 'Receipts' ? m.category === 'receipt' : m.category !== 'receipt'));
  const filters = (labels: string[], active: string, change: (value: string) => void) => <div className="wsd-filters">{labels.map(label => <button type="button" key={label} aria-pressed={label === active} onClick={() => change(label)}>{label}</button>)}</div>;

  const pullNote = extras?.pullRequests.error ? PULL_NOTE[extras.pullRequests.error] : null;
  const epicNote = extras?.epics.error ? EPIC_NOTE[extras.epics.error] : null;

  return <div className="hp cp wp wsd" style={{ '--wp-tone': tone } as CSSProperties}>
    <div className="wsd-toolbar"><button type="button" className="hp-link wsd-back" onClick={onBack}><Icon name="chevronLeft" /> All workspaces</button>
    </div>
    <PageHeader eyebrow="WORKSPACE" title={<>{space.name}<DrawerButton className="wsd-edit" title="Edit workspace" aria-label={`Edit ${space.name}`} onClick={() => { setReturnTo(null); setDrawer({ kind: 'keys' }); }}><Icon name="pencil" /></DrawerButton></>}
      blurb={<>{space.role}{space.role && space.domain && <span className="wsd-separator">·</span>}{space.domain && <a href={`https://${space.domain}`} target="_blank" rel="noopener noreferrer">{space.domain}</a>}</>}
      backdrop="/assets/9305d092-84c7-431d-a55d-ebd4de02c079.png"
      aside={/vivacity/i.test(`${space.name} ${space.domain}`) ? <div className="wsd-business">
        {[['people', '5,321', 'Customers'], ['barcode', '2.9M', 'Devices'], ['cloud', '1.6M', 'Google Synced'], ['task', '248K', 'Repair Tickets']].map(([icon, value, label]) => <div key={label}><Icon name={icon} /><span><strong>{value}</strong><small>{label}</small></span></div>)}
        <button type="button" onClick={() => setTab('monitoring')}><i className="wp-live" /> All Systems Operational <Icon name="chevron" /></button><small className="wsd-preview">Preview data</small>
      </div> : undefined} />

    <SectionTabs tabs={WORKSPACE_TABS} active={tab} onChange={setTab} label="Workspace sections" panelId="workspace-panel" />

    <section className="stat-row" aria-label="Workspace at a glance">
      <Stat label="My Tasks" icon="Issues" value={jiraNote || !hasConn('jira') ? '—' : mine.length}
        note={jiraNote || !hasConn('jira') ? 'Jira unavailable' : `Open · ${mine.filter(i => i.due && i.due >= today && i.due <= weekOut).length} due this week`}
        onClick={() => setTab('jira')} />
      <Stat label="Pull Requests" icon="Work" value={!extras || pullNote || extrasError ? '—' : pulls.length}
        note={!extras ? extrasError || 'Reading GitHub' : pullNote || `Open PRs · ${pulls.filter(p => p.reviewRequested).length} reviewing`}
        onClick={() => setTab('github')} />
      <Stat label="Deployments" icon="Projects" value={3} note="This week · Preview data" onClick={() => setTab('deployments')} />
    </section>

    <div id="workspace-panel" role="tabpanel" tabIndex={0} aria-labelledby={`tab-${tab}`} className={`wsd-grid wsd-view-${tab}`}>
      <Card id="ws-activity" wide icon="pulse" title="Recent Activity" sub="Across this workspace">
        {filters(['All', 'Jira', 'GitHub', 'Mail', 'Slack', 'Agents'], activityFilter, setActivityFilter)}
        {!visibleActivity.length ? <p className="hp-empty">Nothing recent in this view.</p>
          : <ul className="wp-activity-list">{visibleActivity.map(a => <li key={a.key}><button type="button" onClick={() => onAsk(a.ask)}>
            <span className={`hp-badge hp-badge-lg ${a.tone}`}><Icon name={a.icon} /></span>
            <div><small>{ago(a.at)}</small><strong className="wp-clamp-1">{a.title}</strong><small className="wp-clamp-1">{a.sub}</small></div>
          </button></li>)}</ul>}
      </Card>

      <Card id="ws-email" wide icon="speech" tone="wp-violet" title="Workspace Email" sub={domains.length ? `From ${domains.join(', ')}` : undefined}>
        {filters(['All new', 'Other mail', 'Receipts'], mailFilter, setMailFilter)}
        {!domains.length ? <Fix icon="speech" title="No work address yet" text="Give this workspace a website or link a work email, and mail from it shows here." />
          : mail === null ? <p className="hp-empty">Loading…</p>
            : !visibleMail.length ? <p className="hp-empty">{hasConn('gmail') || mail.length ? 'No new mail in this view.' : 'No new mail to show. Connect Gmail to see it here.'}</p>
              : <ul className="wp-rows">{visibleMail.slice(0, 5).map(m => <li key={m.uuid}><button type="button" onClick={() => onAsk(`Help me with the email "${m.subject}" from ${m.from_name || m.from_address}.`)}>
                <span className="hp-badge hp-violet"><Icon name="speech" /></span>
                <div><strong>{m.subject || '(no subject)'}</strong><small className="wp-clamp-1">{m.from_name || m.from_address}</small></div>
                <small className="wp-when">{ago(m.received_at || m.created_at)}</small>
              </button></li>)}</ul>}
        {mail !== null && workMail.length > 5 && <p className="hp-footnote">{workMail.length - 5} more new from {domains[0]}.</p>}
      </Card>

      <Card id="ws-pulls" wide icon="code" tone="wp-green" title="Pull Requests" sub="Open PRs">
        {filters([`Open`, 'Reviewing', 'Drafts'], pullFilter, setPullFilter)}
        {extrasError ? <p className="hp-empty">{extrasError}</p>
          : !extras ? <p className="hp-empty">Loading…</p>
            : pullNote ? <Fix icon="code" title={extras.pullRequests.error === 'not_connected' ? 'GitHub not linked' : 'GitHub unavailable'} text={pullNote} />
              : !groups.length ? <p className="hp-empty">No pull requests in this view.</p>
                : groups.map(g => <div key={g.repo} className="wsd-repo">
                  <h3><button type="button" aria-label={`Review criteria for ${g.repo}`} onClick={() => { setReturnTo(null); setDrawer({ kind: 'repository', repository: g.list[0].repoFull }); }}>{g.repo} <span className="card-count">{g.list.length}</span></button></h3>
                  <ul className="wp-rows">{g.list.map(p => <li key={p.id}><button type="button" onClick={() => { setReturnTo(null); setDrawer({ kind: 'pull', repository: p.repoFull, number: p.number }); }}>
                    <span className="hp-badge hp-green"><Icon name="code" /></span>
                    <div><strong>{p.title}</strong><small className="wp-clamp-1">#{p.number} · {p.mine ? 'yours' : p.author}{p.comments ? ` · ${p.comments} comment${p.comments === 1 ? '' : 's'}` : ''}</small></div>
                    {p.reviewRequested && <em className="wp-chip wp-chip-violet">Review</em>}
                    {p.draft && <em className="wp-chip wp-chip-blue">Draft</em>}
                    <small className="wp-when">{ago(p.updatedAt)}</small>
                  </button></li>)}</ul>
                </div>)}
      </Card>

      <Card id="ws-deployments" icon="plane" title="Recent Deployments" sub="Preview data">
        <div className="wsd-table-wrap"><table className="wsd-table"><thead><tr>{['Environment', 'Version', 'Status', 'When', 'By'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{DEPLOYMENTS.map(([env, version, when, by]) => <tr key={env}><td>{env}</td><td>{version}</td><td className="wp-ok"><i className="wp-live" />Success</td><td>{when}</td><td>{by}</td></tr>)}</tbody></table></div>
      </Card>
      <Card id="ws-services" icon="cloud" title="Key Services" sub="Preview data · monitoring feed to follow">
        <ul className="wsd-services">{SERVICES.map((service, index) => <li key={service}><Icon name={['pulse', 'globe', 'cloud', 'barcode', 'speech'][index]} /><span>{service}</span><small><i className="wp-live" />Healthy</small><svg viewBox="0 0 120 24" aria-hidden="true"><path d={`M0 14l9 -2 6 5 8 -3 9 1 6 -2 9 3 8 -1 7 -7 5 ${index % 2 ? 1 : -4} 7 7 9 5 7 -3 8 2 8 -4 6 -1 8 -5`} /></svg></li>)}</ul>
      </Card>
      <Card id="ws-quick" icon="bolt" title="Quick Actions">
        <div className="wsd-quick">{[['list', 'Open Jira', 'jira'], ['code', 'Open GitHub', 'github'], ['plane', 'View Deployments', 'deployments'], ['pulse', 'Check Monitoring', 'monitoring'], ['calendar', 'Team Calendar', 'team'], ['book', 'Workspace Docs', 'docs']].map(([icon, label, target]) => <button type="button" key={label} onClick={() => setTab(target as WorkspaceTab)}><Icon name={icon} />{label}</button>)}</div>
      </Card>

      <Card id="ws-jira" icon="list" title="Jira" sub="Open issues" action={mine.length > 0 ? <small className="wp-sub">{mine.length}</small> : undefined}>
        {jiraNote ? jiraNote
          : !hasConn('jira') ? <Fix icon="list" title="Jira not linked" text="Link a Jira connection to this workspace and its issues show here." button="Connect an app" onClick={onConnect} />
            : !mine.length ? <p className="hp-empty">No open issues assigned to you here.</p>
              : <ul className="wp-issues">{mine.slice(0, 6).map(i => <li key={`${i.site}-${i.key}`}><button type="button" className="wi-open" onClick={() => onOpenIssue(i.url)}>
                <span className="wp-key">{i.key}</span>
                <div><strong>{i.title}</strong><small>{i.project}</small></div>
                <em className={`wp-chip ${PHASE_TONE[phaseOf(i)]}`}>{i.status}</em>
              </button></li>)}</ul>}
      </Card>

      <Card id="ws-slack" icon="chat" tone="wp-violet" title="Slack" sub="Messages that need you">
        {!hasConn('slack') ? <Fix icon="chat" title="Slack not linked" text="Link Slack to this workspace to see the messages that mention you." button="Connect an app" onClick={onConnect} />
          : slackNote ? <Fix icon="chat" title="Slack not connected" text="Reconnect Slack to see your mentions." button="Connect Slack" onClick={onConnect} />
            : !mentions.length ? <p className="hp-empty">No mentions in {slack?.workspace || 'Slack'} in the last 7 days.</p>
              : <ul className="wp-rows">{mentions.slice(0, 5).map(m => <li key={m.timestamp}><a href={m.url} target="_blank" rel="noopener noreferrer">
                <span className="hp-badge hp-violet"><Icon name="chat" /></span>
                <div><strong>#{m.channel}</strong><small className="wp-clamp">{m.text}</small></div>
                <small className="wp-when">{ago(slackTime(m.timestamp))}</small>
              </a></li>)}</ul>}
      </Card>

      <Card id="ws-sites" icon="globe" title="Sites" sub="Uptime">
        {!sites ? <p className="hp-empty">Loading…</p>
          : !mySites.length ? <p className="hp-empty">No sites are linked to this workspace. Use ⋮ on its card on Work to link some.</p>
            : <ul className="wp-site-list">{mySites.slice(0, 6).map(s => {
              const up = s.uptime;
              return <li key={s.uuid} title={up?.error || undefined}>
                <span className={`wp-site-state ${!up ? 'wp-site-idle' : up.ok ? 'wp-site-ok' : 'wp-site-bad'}`}><Icon name={!up ? 'minus' : up.ok ? 'check' : 'down'} /></span>
                <div><strong>{s.domain}</strong><small className={!up ? '' : up.ok ? 'wp-ok' : 'wp-bad'}>{!up ? 'Not checked yet' : up.ok ? 'Healthy' : up.error || 'Down'}</small>{up?.ms != null && <small>{up.ms} ms</small>}</div>
                <Spark values={(up?.recent || []).map(c => c.ms)} ok={!!up?.ok} />
              </li>;
            })}</ul>}
        {down > 0 && <p className="hp-footnote wp-bad">{down} site{down === 1 ? '' : 's'} down.</p>}
      </Card>

      <Card id="ws-projects" icon="folder" title="Projects" sub="Open Jira epics">
        {extrasError ? <p className="hp-empty">{extrasError}</p>
          : !extras ? <p className="hp-empty">Loading…</p>
            : epicNote ? <Fix icon="folder" title="Epics unavailable" text={epicNote} />
              : !extras.epics.items.length ? <p className="hp-empty">No open epics.</p>
                : <ul className="wp-project-list">{extras.epics.items.slice(0, 8).map(e => <li key={e.key}><a href={e.url} target="_blank" rel="noopener noreferrer" className="wsd-epic">
                  <span className="wp-key">{e.key}</span>
                  <span className="wp-project-name">{e.title}</span>
                  <span className="hp-bar hp-bar-thin wp-bar"><i style={{ width: `${e.total ? (e.done / e.total) * 100 : 0}%` }} /></span>
                  <span className="wp-count">{e.total ? `${e.done}/${e.total}` : '—'}</span>
                  <em className={`wp-chip ${e.statusCategory === 'indeterminate' ? 'wp-chip-amber' : 'wp-chip-blue'}`}>{e.status}</em>
                </a></li>)}</ul>}
      </Card>

      <Card id="ws-upcoming" icon="calendar" title="Upcoming" sub="Work events, next 7 days">
        {!meetings.length ? <p className="hp-empty">No work events in the next 7 days.</p>
          : <ul className="fp-dated wp-dated">{meetings.slice(0, 5).map((e, i) => {
            const d = new Date(e.start);
            const isToday = zonedDay(d, timeZone) === today;
            return <li key={`${e.id}-${i}`}><button type="button" onClick={() => onAsk(`Help me prepare for "${e.title}".`)}>
              <span className="fp-date"><small>{isToday ? 'TODAY' : d.toLocaleDateString(undefined, { timeZone, weekday: 'short' }).toUpperCase()}</small>{d.toLocaleDateString(undefined, { timeZone, day: 'numeric' })}</span>
              <div><strong>{e.title}</strong><small>{e.calendar || 'Calendar'}</small></div>
              <small className="wp-when">{clock(e.start, timeZone)}</small>
            </button></li>;
          })}</ul>}
      </Card>

      <Card id="ws-agents" icon="bot" title="Athena’s Agents" sub="Work in the background">
        {runs === null ? <p className="hp-empty">Loading…</p>
          : !runs.length ? <p className="hp-empty">No code investigations or fixes this week. Ask me to look into a bug and the agents’ work shows up here.</p>
            : <ul className="wp-rows">{runs.slice(0, 4).map(r => <AgentRow key={r.uuid} run={r} onOpen={() => r.kind === 'review' && r.repo && r.number ? setDrawer({ kind: 'pull', repository: r.repo, number: r.number }) : onAsk(`What did the agents find on ${r.summary || 'that'}?`)} />)}</ul>}
      </Card>
    </div>
    {drawer?.kind === 'repository' && <RepositoryReviewDrawer key={`${workspaceUuid}-${drawer.repository}`} workplaceUuid={workspaceUuid} repository={drawer.repository} onClose={() => { setDrawer(returnTo); setReturnTo(null); }} />}
    {drawer?.kind === 'keys' && <WorkspaceSettingsDrawer key={workspaceUuid} workplaceUuid={workspaceUuid} initial={own} onChanged={o => { setOwn(o); props.onWorkplaces(o); }} onConnect={() => { setDrawer(null); setReturnTo(null); onConnect(); }} onClose={() => { setDrawer(returnTo); setReturnTo(null); }} />}
    {drawer?.kind === 'pull' && <PullRequestReviewDrawer key={`${workspaceUuid}-${drawer.repository}-${drawer.number}`} workplaceUuid={workspaceUuid} repository={drawer.repository} number={drawer.number} onClose={() => setDrawer(null)} onReviewChanged={loadRuns}
      onManageKeys={() => { setReturnTo(drawer); setDrawer({ kind: 'keys' }); }} onRepository={() => { setReturnTo(drawer); setDrawer({ kind: 'repository', repository: drawer.repository }); }} />}
  </div>;
}
