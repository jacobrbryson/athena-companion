import { useState, type ReactNode } from 'react';
import { STATE_LABEL, PRIORITY_LABEL, type Project, type ProjectEntry } from '../api/projects';
import { ProjectList, StateChip, costLine, type ProjectsState } from './Projects';
import { Picture } from './ProjectJournal';
import { DrawerButton } from './ActionControls';
import { Icon } from './HealthPage';
import { Stat } from './SectionMetric';
import './propertyProjects.css';

const closed = (p: Project) => p.status === 'done' || p.status === 'dropped';
const target = (p: Project) => p.hardDeadline || p.endsOn;
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const category = (p: Project) => p.kind || 'Uncategorized';
const colors = ['#32b8f4', '#66d9cd', '#a58af6', '#e9b967', '#739bcb', '#df8ea8'];
const progress = (p: Project) => p.progress.contributors.total ? p.progress.contributors : p.progress.steps;
const needsAttention = (p: Project, today: string) => !closed(p) && (p.priority >= 4 || p.effectiveStatus === 'blocked' || !!p.execution?.dueFollowUps.length || !!(target(p) && target(p)! < today));

function ProjectIcon({ name }: { name: string }) {
  const glyph = name === 'search' ? <><circle cx="10" cy="10" r="6.5" /><path d="m15 15 5 5" /></>
    : name === 'alert' ? <><path d="m12 3 10 18H2Z" /><path d="M12 9v5m0 3v.5" /></>
      : name === 'play' ? <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></> : null;
  return glyph ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph}</svg> : <Icon name={name} />;
}

function Panel({ title, icon, count, action, children, className = '' }: { title: string; icon: string; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`pp-panel ${className}`}><header><ProjectIcon name={icon} /><h2>{title}</h2>{count !== undefined && <span className="pp-count">{count}</span>}{action}</header>{children}</section>;
}

function ProjectCard({ project: p, onOpen }: { project: Project; onOpen: (uuid: string) => void }) {
  const done = progress(p);
  const pct = done.total ? Math.round(done.done / done.total * 100) : null;
  const entry: ProjectEntry | null = p.media?.cover ? { uuid: p.media.cover, type: 'photo', phase: null, body: `${p.title} cover photo`, media: 'server', deviceRef: null, involvesChildren: p.involvesChildren, source: p.source, takenAt: null, createdAt: p.updatedAt } : null;
  return <button type="button" className={`pp-card pp-card-${p.effectiveStatus}`} onClick={() => onOpen(p.uuid)}>
    <span className="pp-cover">{entry ? <Picture project={p} entry={entry} /> : <span className="pp-cover-placeholder"><Icon name={p.indoor === true ? 'home' : p.indoor === false ? 'sun' : 'folder'} /><small>{p.indoor === true ? 'Indoor' : p.indoor === false ? 'Outdoor' : 'Project'}</small></span>}</span>
    <span className="pp-card-content"><span className="pp-card-top"><StateChip state={p.effectiveStatus} /><span className={p.priority >= 4 ? 'pp-priority pp-danger' : 'pp-priority'}>{PRIORITY_LABEL[p.priority]}</span></span>
      <strong>{p.title}</strong><span className="pp-description">{p.goal || p.waitingOn || 'Open project for details'}</span>
      <span className="pp-tags"><Icon name="folder" />{category(p)}{p.indoor !== null && <span>· {p.indoor ? 'Indoor' : 'Outdoor'}</span>}</span>
      <span className="pp-card-bottom"><span className="pp-progress"><span className="pp-track"><i style={{ width: `${pct ?? 0}%` }} /></span><small>{pct === null ? 'No steps yet' : `${pct}% · ${done.done}/${done.total}`}</small></span><small>{target(p) ? `Due ${dayLabel(target(p)!)}` : 'No date set'}</small></span>
    </span>
  </button>;
}

/** Property's project workspace; all counts, dates and photos come from the existing snapshot. */
export function PropertyProjects({ state, onOpen, onNew, onMap, onSeason }: {
  state: ProjectsState; onOpen: (uuid: string) => void; onNew: () => void; onMap: () => void; onSeason: () => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [priority, setPriority] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [view, setView] = useState<'cards' | 'list' | 'timeline'>('cards');
  const [expanded, setExpanded] = useState<string[]>([]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const month = now.getMonth() + 1;
  const season = ['Winter', 'Spring', 'Summer', 'Fall'][Math.floor(month % 12 / 3)];
  const projects = state.snap.projects.filter(p => p.primaryArea === 'home' && p.kind !== 'program');
  const open = projects.filter(p => !closed(p));
  const attention = open.filter(p => needsAttention(p, today));
  const seasonal = open.filter(p => p.seasonMonths?.includes(month));
  const active = open.filter(p => p.effectiveStatus === 'active');
  const planned = open.filter(p => ['idea', 'planning', 'ready'].includes(p.effectiveStatus));
  const held = open.filter(p => ['waiting', 'blocked'].includes(p.effectiveStatus));
  const complete = projects.filter(p => p.status === 'done');
  const budgets = open.filter(p => p.budget?.working != null);
  const budget = budgets.reduce((sum, p) => sum + p.budget.working!, 0);
  const categories = [...new Set(projects.map(category))].sort();
  const q = query.trim().toLowerCase();
  const filtered = projects.filter(p => (!q || `${p.title} ${p.goal || ''} ${p.refCode || ''}`.toLowerCase().includes(q))
    && (status === 'all' || (status === 'attention' ? needsAttention(p, today) : p.effectiveStatus === status))
    && (kind === 'all' || category(p) === kind) && (priority === 'all' || p.priority === Number(priority))
    && (seasonFilter === 'all' || (seasonFilter === 'current' ? p.seasonMonths?.includes(month) : !p.seasonMonths?.length)))
    .sort((a, b) => (b.rank ?? -1e9) - (a.rank ?? -1e9) || a.title.localeCompare(b.title));
  const deadlines = open.filter(p => target(p)).sort((a, b) => target(a)!.localeCompare(target(b)!));
  const updates = projects.filter(p => p.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const groups = [
    { id: 'attention', title: 'Needs Attention', icon: 'alert', match: (p: Project) => needsAttention(p, today) },
    { id: 'active', title: 'Active Projects', icon: 'play', match: (p: Project) => !needsAttention(p, today) && !closed(p) && p.effectiveStatus === 'active' },
    { id: 'planned', title: 'Planned / On Hold', icon: 'clock', match: (p: Project) => !needsAttention(p, today) && !closed(p) && p.effectiveStatus !== 'active' },
    { id: 'complete', title: 'Completed / Dropped', icon: 'check', match: closed },
  ];
  const segments = [active.length, planned.length, held.length, complete.length, projects.filter(p => p.status === 'dropped').length];
  const counts = categories.map(name => ({ name, count: projects.filter(p => category(p) === name).length }));
  let angle = 0;
  const gradient = counts.map((c, i) => { const start = angle; angle += c.count / Math.max(1, projects.length) * 360; return `${colors[i % colors.length]} ${start}deg ${angle}deg`; }).join(',');
  const showAll = (id: string) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const viewAll = (id: string) => <button type="button" className="pp-link" onClick={() => showAll(id)}>{expanded.includes(id) ? 'Show less' : 'View all'} <span aria-hidden="true">→</span></button>;
  const reset = () => { setQuery(''); setStatus('all'); setKind('all'); setPriority('all'); setSeasonFilter('all'); };
  const exportProjects = () => {
    const cell = (value: string | number) => { const text = String(value); return `"${(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`; };
    const csv = [['Project', 'Status', 'Category', 'Priority', 'Due', 'Working budget'], ...filtered.map(p => [p.title, STATE_LABEL[p.effectiveStatus], category(p), PRIORITY_LABEL[p.priority], target(p) || '', p.budget?.working ?? ''])].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'property-projects.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="pp-dashboard">
    {state.error && <p className="pp-message" role="alert">{state.error} <button type="button" onClick={state.reload}>Retry</button></p>}
    {state.loading && <p className="pp-message" role="status">Loading property projects…</p>}
    <div className="pp-summary">
      <div className="pp-summary-card"><Stat icon="Projects" label="Total Projects" value={state.loading ? '—' : projects.length} /><div className="pp-stacked" aria-hidden="true">{segments.map((n, i) => n > 0 && <i key={i} style={{ flex: n, background: colors[i] }} />)}</div><div className="pp-legend">{['Active', 'Planned', 'On hold', 'Complete', 'Dropped'].map((label, i) => segments[i] > 0 && <span key={label}><i style={{ background: colors[i] }} />{segments[i]} {label}</span>)}</div></div>
      <div className="pp-summary-card"><Stat icon="Calendar" label="Active Projects" value={state.loading ? '—' : active.length} note="Currently in progress" /><div className="pp-mini-bars" aria-label="Completed steps in active projects">{active.slice(0, 12).map(p => { const x = progress(p); return <span key={p.uuid} title={`${p.title}: ${x.done}/${x.total} steps or parts`}><i style={{ height: `${x.total ? x.done / x.total * 100 : 0}%` }} /></span>; })}</div></div>
      <div className="pp-summary-card pp-budget"><Stat icon="Home" label="Working Budgets" value={state.loading || !budgets.length ? '—' : money(budget)} note={`${budgets.length} of ${open.length} open projects have a budget`} /><small>Saved budgets · actual spending isn't tracked</small></div>
      <div className="pp-summary-card pp-attention"><Stat icon="Issues" label="Need Attention" value={state.loading ? '—' : attention.length} tone={attention.length ? 'alert' : 'good'} onClick={() => setStatus('attention')} /><ul>{attention.slice(0, 3).map(p => <li key={p.uuid}><button type="button" onClick={() => onOpen(p.uuid)}><i />{p.title}</button></li>)}</ul>{!attention.length && <small>No urgent or blocked projects</small>}</div>
      <div className="pp-summary-card pp-season"><Stat icon="Weather" label="Seasonal Focus" value={season} /><ul>{seasonal.slice(0, 3).map(p => <li key={p.uuid}><button type="button" onClick={() => onOpen(p.uuid)}>◦ {p.title}</button></li>)}</ul>{!seasonal.length && <small>No projects scheduled for this month</small>}<button type="button" className="pp-link" onClick={onSeason}>View season →</button></div>
    </div>

    <div className="pp-toolbar">
      <label className="pp-search"><ProjectIcon name="search" /><input aria-label="Search property projects" placeholder="Search projects…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All</option><option value="attention">Needs attention</option>{Object.entries(STATE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Category<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">All</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}><option value="all">All</option>{Object.entries(PRIORITY_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Season<select value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}><option value="all">All</option><option value="current">This month</option><option value="any">No seasonal restriction</option></select></label>
      <div className="pp-view" role="group" aria-label="Project view">{(['cards', 'list', 'timeline'] as const).map(v => <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}</div>
      <DrawerButton primary onClick={onNew}><span aria-hidden="true">＋</span>New Project</DrawerButton>
    </div>

    <div className="pp-layout"><div className="pp-main">
      {!filtered.length && !state.loading && <Panel title="Projects" icon="folder"><div className="pp-empty"><strong>{projects.length ? 'No projects match your filters' : 'Make room for your next project'}</strong><p>{projects.length ? 'Try another search or clear the filters.' : 'Add a property project to start tracking its steps, budget and deadlines.'}</p>{projects.length ? <button type="button" className="pp-link" onClick={reset}>Clear filters</button> : <DrawerButton primary onClick={onNew}>＋ New Project</DrawerButton>}</div></Panel>}
      {view === 'cards' && groups.map(group => { const items = filtered.filter(group.match); return items.length > 0 && <Panel key={group.id} title={group.title} icon={group.icon} count={items.length} className={`pp-group pp-group-${group.id}`} action={items.length > 3 ? viewAll(group.id) : undefined}><div className="pp-cards">{(expanded.includes(group.id) ? items : items.slice(0, 3)).map(p => <ProjectCard key={p.uuid} project={p} onOpen={onOpen} />)}</div></Panel>; })}
      {view === 'list' && filtered.length > 0 && <Panel title="All Projects" icon="list" count={filtered.length}><ProjectList projects={filtered} snap={state.snap} onOpen={onOpen} /></Panel>}
      {view === 'timeline' && filtered.length > 0 && <Panel title="Project Timeline" icon="calendar" count={filtered.length}><ol className="pp-timeline">{[...filtered].sort((a, b) => (target(a) || '9999').localeCompare(target(b) || '9999')).map(p => <li key={p.uuid}><button type="button" onClick={() => onOpen(p.uuid)}><time>{target(p) ? dayLabel(target(p)!) : 'Unscheduled'}</time><span><strong>{p.title}</strong><small>{p.startsOn ? `Starts ${dayLabel(p.startsOn)} · ` : ''}{costLine(p) || STATE_LABEL[p.effectiveStatus]}</small></span><StateChip state={p.effectiveStatus} /></button></li>)}</ol></Panel>}
    </div><aside className="pp-sidebar" aria-label="Property project overview">
      <Panel title="Quick Actions" icon="bolt"><div className="pp-actions">{[['plus', 'New Project', onNew], ['calendar', 'View Timeline', () => setView('timeline')], ['pin', 'Show Map', onMap], ['list', 'Seasonal Projects', onSeason], ['arrowRight', 'Export Filtered Projects', exportProjects]].map(([icon, label, action]) => <button type="button" key={String(label)} onClick={action as () => void}><Icon name={String(icon)} />{String(label)}<span>›</span></button>)}</div></Panel>
      <Panel title="Upcoming Deadlines" icon="calendar" action={deadlines.length > 5 ? viewAll('deadlines') : undefined}><ul className="pp-deadlines">{(expanded.includes('deadlines') ? deadlines : deadlines.slice(0, 5)).map(p => <li key={p.uuid}><button type="button" onClick={() => onOpen(p.uuid)}><i className={needsAttention(p, today) ? 'pp-dot-alert' : ''} /><span>{p.title}</span><time className={target(p)! < today ? 'pp-danger' : ''}>{dayLabel(target(p)!)}</time></button></li>)}</ul>{!deadlines.length && <p className="pp-muted">No project deadlines set.</p>}</Panel>
      <Panel title="Projects by Category" icon="folder"><div className="pp-category"><div className="pp-donut" role="img" aria-label={`${projects.length} projects by category`} style={{ background: gradient ? `conic-gradient(${gradient})` : '#163245' }}><span><strong>{projects.length}</strong>Total</span></div><ul>{counts.map((c, i) => <li key={c.name}><button type="button" onClick={() => setKind(c.name)}><i style={{ background: colors[i % colors.length] }} /><span>{c.name}</span><strong>{c.count}</strong></button></li>)}</ul></div></Panel>
      <Panel title={`This Season (${season})`} icon="sun" action={<button type="button" className="pp-link" onClick={onSeason}>View all →</button>}><ul className="pp-season-list">{seasonal.slice(0, 6).map(p => <li key={p.uuid}><button type="button" onClick={() => onOpen(p.uuid)}><Icon name="folder" /><span>{p.title}</span><small>{STATE_LABEL[p.effectiveStatus]}</small></button></li>)}</ul>{!seasonal.length && <p className="pp-muted">Set seasonal months in a project to see it here.</p>}</Panel>
      <Panel title="Recent Updates" icon="clock" className="pp-updates"><ul>{updates.map(p => <li key={p.uuid}><button type="button" onClick={() => onOpen(p.uuid)}><Icon name="folder" /><strong>{p.title}</strong><span>{STATE_LABEL[p.effectiveStatus]} · {progress(p).done}/{progress(p).total} steps or parts</span><time>{new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></button></li>)}</ul>{!updates.length && <p className="pp-muted">Your project updates will appear here.</p>}</Panel>
    </aside></div>
  </div>;
}
