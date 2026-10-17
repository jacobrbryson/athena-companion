import { useEffect, useState, type ReactNode } from 'react';
import { dashboardApi, dreamsApi, type Dream, type DreamQuestion, type SystemHealthStatus } from '../api/dashboard';
import { localDay } from '../api/healthPlan';
import { useSystemRead, type OpenPanel } from './Dashboard';
import { DreamImage, Paragraphs, STATUS_LINE, nightLabel, statChips } from './Dreams';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import { SectionTabs } from './Property';
import './system.css';

/**
 * The System page (redesigned 2026-10-16 from the owner's concept): one place
 * for the things that keep Athena — and the person's inboxes and lists —
 * running. Calendar, Mail, Projects, News and Dreams left the left nav to
 * become its tabs; the costs and time-saved figures that used to be this page
 * are its Finance tab.
 *
 * The Overview is a glance at every tab, built from the same reads the tabs
 * use. Nothing is drawn that wasn't read: a source that can't be read says so
 * on its tile instead of showing a plausible number.
 */

export const SYSTEM_TABS = [
  { id: 'System', label: 'Overview', icon: 'SystemOverview' },
  { id: 'Calendar', label: 'Calendar', icon: 'SystemCalendar' },
  { id: 'Mail', label: 'Mail', icon: 'Mail' },
  { id: 'Projects', label: 'Projects', icon: 'SystemProjects' },
  { id: 'News', label: 'News', icon: 'SystemNews' },
  { id: 'Dreams', label: 'Dreams', icon: 'Dreams' },
  { id: 'Finance', label: 'Finance', icon: 'Finance' },
] as const;
export type SystemTab = typeof SYSTEM_TABS[number]['id'];
export const SYSTEM_TAB_IDS: readonly string[] = SYSTEM_TABS.map(t => t.id);

export function SystemTabs({ active, onChange }: { active: SystemTab; onChange: (tab: SystemTab) => void }) {
  return <SectionTabs tabs={SYSTEM_TABS} active={active} onChange={onChange} label="System sections" panelId="system-tab-panel" />;
}

/** Stroke glyphs the Health icon set has no entry for. */
const GLYPHS: Record<string, ReactNode> = {
  mail: <><rect x="3.5" y="6" width="17" height="12" rx="1.6" /><path d="m4.2 7 7.8 6 7.8-6" /></>,
  list: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>,
  news: <><path d="M6 3.5h8.5L19 8v12.5H6Z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7" /></>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="2.6" /><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" /></>,
  question: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.5M12 16.8h.01" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  chart: <path d="M5 20v-6M10 20V9M15 20v-4M20 20V5" />,
  warning: <><path d="m12 3.5 9 16H3Z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  book: <><path d="M4 5.5c2.5-1 5.5-1 8 .8 2.5-1.8 5.5-1.8 8-.8v13c-2.5-1-5.5-1-8 .8-2.5-1.8-5.5-1.8-8-.8Z" /><path d="M12 6.3v13" /></>,
};
function Glyph({ name }: { name: string }) {
  if (!GLYPHS[name]) return <Icon name={name} />;
  return <svg className="hp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{GLYPHS[name]}</svg>;
}

/** A headline number for one tab, and the shape of what's behind it. */
export interface SystemTile {
  id: SystemTab; title: string; icon: string; tone: 'blue' | 'red' | 'green' | 'violet';
  value: ReactNode; unit: string; sub: ReactNode;
  /** One bar per day or category; `title` is what hovering says. */
  bars?: { key: string; value: number; title: string }[];
  /** A single stacked bar: how the whole divides. */
  segments?: { key: string; value: number; tone: string; title: string }[];
}

function Bars({ bars, tone }: { bars: { key: string; value: number; title: string }[]; tone: string }) {
  const max = Math.max(1, ...bars.map(b => b.value));
  return <div className={`sys-bars sys-${tone}`} aria-hidden="true">{bars.map(b => <i key={b.key} title={b.title} style={{ height: `${b.value ? Math.max(12, (b.value / max) * 100) : 6}%` }} className={b.value ? '' : 'sys-bar-empty'} />)}</div>;
}

function Tile({ tile, onOpen }: { tile: SystemTile; onOpen: () => void }) {
  const total = tile.segments?.reduce((n, s) => n + s.value, 0) ?? 0;
  return <button type="button" className={`hp-tile sys-tile sys-tile-${tile.tone}`} onClick={onOpen}>
    <div className="sys-tile-head">
      <span className={`hp-badge hp-badge-lg sys-badge-${tile.tone}`}><Glyph name={tile.icon} /></span>
      <div>
        <header>{tile.title}<Icon name="chevron" className="hp-chev" /></header>
        <strong className="hp-big">{tile.value}<small> {tile.unit}</small></strong>
        <p className="hp-sub">{tile.sub}</p>
      </div>
    </div>
    {tile.bars && <Bars bars={tile.bars} tone={tile.tone} />}
    {tile.segments && <div className="sys-segments" aria-hidden="true">{total ? tile.segments.filter(s => s.value).map(s => <i key={s.key} className={`sys-seg-${s.tone}`} style={{ flexGrow: s.value }} title={s.title} />) : <i className="sys-seg-idle" />}</div>}
  </button>;
}

const WORD: Record<SystemHealthStatus, string> = { ok: 'OK', degraded: 'Degraded', down: 'Down' };
/** "$14.86": a tile has room for the symbol, not the ISO code the Finance tab spells out. */
const cash = (currency: string | null | undefined, value: number | null | undefined) =>
  value == null || !currency ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Seven days of spend, oldest first; days the provider didn't bill are zero. */
function weekOf(daily?: { date: string; cost: number }[]) {
  const byDate = new Map((daily || []).map(d => [d.date, d.cost]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    const value = byDate.get(date) ?? 0;
    return { key: date, value, title: `${date}: ${value.toFixed(2)}` };
  });
}

export function SystemOverview({ tiles, integrations, onTab, onAsk, onPanel, onNewTask }: {
  tiles: SystemTile[];
  /** Linked providers read for the dashboard, and the ones that can't be read. */
  integrations: { connected: number; attention: string[] };
  onTab: (tab: SystemTab) => void;
  onAsk: (text: string) => void;
  onPanel: OpenPanel;
  onNewTask: () => void;
}) {
  const health = useSystemRead(dashboardApi.systemHealth);
  const openai = useSystemRead(dashboardApi.systemOpenAI);
  const gcp = useSystemRead(dashboardApi.systemGcp);
  const twilio = useSystemRead(dashboardApi.systemTwilio);
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [dreamError, setDreamError] = useState('');
  const [questions, setQuestions] = useState<DreamQuestion[]>([]);
  const [healthOpen, setHealthOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    dreamsApi.list().then(r => { if (alive) setDreams(r.dreams); }).catch(e => { if (alive) { setDreams([]); setDreamError((e as Error).message || 'The Dreams log couldn’t load.'); } });
    dreamsApi.questions().then(r => { if (alive) setQuestions(r.questions); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const h = health.data;
  const failing = h?.checks.filter(c => c.status !== 'ok') ?? [];
  const overall = health.loading ? { word: 'Checking…', tone: 'idle' }
    : !h ? { word: 'The health check didn’t answer', tone: 'bad' }
      : h.status === 'down' ? { word: 'Something is down', tone: 'bad' }
        : failing.length || integrations.attention.length ? { word: 'Some things need attention', tone: 'ok' }
          : { word: 'All systems operational', tone: 'good' };

  const ai = openai.data?.configured ? openai.data : null;
  const cloud = gcp.data?.configured ? gcp.data : null;
  const sms = twilio.data?.configured ? twilio.data : null;
  const costsLoading = openai.loading || gcp.loading || twilio.loading;
  // A provider that couldn't be read is named under the total, never counted as zero.
  const parts = [
    { name: 'OpenAI', currency: ai?.currency, value: ai?.costThisMonth },
    { name: 'Google Cloud', currency: cloud?.currency, value: cloud?.costThisMonth },
    { name: 'Twilio', currency: sms?.balance?.currency, value: sms?.smsCostThisMonth },
  ];
  const read = parts.filter(p => p.value != null && p.currency);
  const oneCurrency = read.length > 0 && new Set(read.map(p => p.currency)).size === 1;
  const total = {
    value: oneCurrency ? cash(read[0].currency, read.reduce((n, p) => n + (p.value as number), 0)) : '—',
    missing: parts.filter(p => !oneCurrency || !read.includes(p)).map(p => p.name),
  };
  const costs = [
    { name: 'OpenAI', value: openai.loading ? '…' : cash(ai?.currency, ai?.costThisMonth), bars: ai ? weekOf(ai.daily) : null, tone: 'violet', note: ai ? null : 'not configured' },
    { name: 'Google Cloud', value: gcp.loading ? '…' : cash(cloud?.currency, cloud?.costThisMonth), bars: cloud ? weekOf(cloud.daily) : null, tone: 'blue', note: cloud ? null : 'export not ready' },
    { name: 'Twilio', value: twilio.loading ? '…' : sms?.smsCostThisMonth != null ? cash(sms.balance?.currency, sms.smsCostThisMonth) : '—', bars: null, tone: 'orange', note: sms ? `${sms.smsMessagesSent ?? 0} texts` : 'not configured' },
  ];

  const nights = dreams || [];
  const dreamt = nights.filter(d => d.status !== 'skipped');
  const steps = dreamt.reduce((n, d) => n + (d.stats?.steps_ok ?? 0) + (d.stats?.steps_failed ?? 0), 0);
  const waiting = questions.filter(q => q.status === 'pending');
  const stepsOn = new Map(dreamt.map(d => [d.date, (d.stats?.steps_ok ?? 0) + (d.stats?.steps_failed ?? 0)]));
  const month = Array.from({ length: 30 }, (_, i) => {
    const date = localDay(new Date(Date.now() - (29 - i) * 86400000));
    const value = stepsOn.get(date) ?? 0;
    return { key: date, value, title: stepsOn.has(date) ? `${date}: ${value} step${value === 1 ? '' : 's'}` : `${date}: no dream` };
  });
  const latest = nights[0];

  return <div className="sys">
    <PageHeader eyebrow="SYSTEM OVERVIEW" title="System"
      blurb="Everything at a glance. Athena keeps it all running so you can focus on what matters most."
      art="/assets/43721b93-7535-4ade-82e0-ed9db90d2f12.png"
      controls={<div className="sys-status">
        <i className={`sys-dot sys-dot-${overall.tone}`} />
        <span>{integrations.connected} service{integrations.connected === 1 ? '' : 's'} connected</span>
        {h && <span>{h.checks.length - failing.length} of {h.checks.length} checks passing</span>}
        {h && <span>Last check {clock(h.checkedAt)}</span>}
      </div>} />

    <SystemTabs active="System" onChange={onTab} />

    <div id="system-tab-panel" role="tabpanel" aria-labelledby="tab-System" className="sys-body">
      <section className="sys-tiles" aria-label="Each tab at a glance">
        {tiles.map(t => <Tile key={t.id} tile={t} onOpen={() => onTab(t.id)} />)}
      </section>

      <div className="sys-grid">
        <section className="hp-panel sys-dreams">
          <header><span className="hp-badge hp-badge-lg hp-violet"><Icon name="moon" /></span><h2>Dreams</h2><button type="button" className="hp-link" onClick={() => onTab('Dreams')}>View all dreams <Icon name="arrowRight" /></button></header>
          <p className="sys-lead">Each night I go back over what you’ve told me and give it shape — tables, connections, the odd tidy-up.</p>
          <ul className="sys-facts">
            <li className="sys-fact"><span className="hp-badge hp-badge-lg hp-violet"><Icon name="moon" /></span><div><strong>{dreams ? dreamt.length : '…'}<small> nights</small></strong><span>in the last 30 days</span></div></li>
            <li className="sys-fact"><span className="hp-badge hp-badge-lg hp-violet"><Glyph name="db" /></span><div><strong>{dreams ? steps : '…'}<small> steps</small></strong><span>statements run in my own database</span></div></li>
            <li><button type="button" className="sys-fact" onClick={() => waiting.length ? onAsk('You had a question for me from your dreaming — go ahead and ask.') : onTab('Dreams')}><span className="hp-badge hp-badge-lg hp-blue"><Glyph name="question" /></span><div><strong>{waiting.length}<small> question{waiting.length === 1 ? '' : 's'}</small></strong><span>{waiting.length ? 'waiting — tap to answer' : 'currently waiting'}</span></div></button></li>
          </ul>
          <div className="sys-month"><Bars bars={month} tone="violet" /><small>Last 30 days</small></div>
        </section>

        <section className="hp-panel sys-latest">
          <header><span className="hp-badge hp-badge-lg hp-violet"><Icon name="moon" /></span><h2>Most Recent Dream</h2>{latest && <button type="button" className="hp-link" onClick={() => onTab('Dreams')}>View night details <Icon name="arrowRight" /></button>}</header>
          {!dreams ? <p className="hp-empty">Remembering…</p>
            : dreamError ? <p className="hp-empty" role="status">{dreamError}</p>
              : !latest ? <p className="hp-empty">I haven’t dreamed yet. Once I do, I’ll tell you about it here.</p>
                : <>
                  <div className="sys-latest-date"><strong>{nightLabel(latest.date)}</strong><em className={`sys-night sys-night-${latest.status}`}>{STATUS_LINE[latest.status]}</em></div>
                  {latest.hasImage && <DreamImage uuid={latest.uuid} className="sys-dream-image" />}
                  {latest.narrative && <div className="sys-narrative"><Paragraphs text={latest.narrative} /></div>}
                  {latest.summary && <div className="sys-happened"><h3>What actually happened</h3><Paragraphs text={latest.summary} /></div>}
                  {statChips(latest).length > 0 && <ul className="sys-chips">{statChips(latest).map(c => <li key={c}>{c}</li>)}</ul>}
                </>}
        </section>
      </div>

      <div className="sys-grid sys-grid-status">
        <section className="hp-panel sys-health" id="system-health">
          <header>
            <span className={`hp-badge hp-badge-lg sys-health-${overall.tone}`}><Icon name={overall.tone === 'good' ? 'check' : overall.tone === 'idle' ? 'clock' : 'pulse'} /></span>
            <div className="sys-health-head"><h2>System Health</h2><p className={`sys-tone-${overall.tone}`}>{overall.word}</p>{h && <small>Last check {clock(h.checkedAt)}</small>}</div>
            {h && <button type="button" className="hp-link" aria-expanded={healthOpen} onClick={() => setHealthOpen(v => !v)}>{healthOpen ? 'Hide details' : 'View details'} <Icon name="arrowRight" /></button>}
          </header>
          {!h && !health.loading && <p className="hp-empty">{health.error || 'The health check did not answer.'} If this persists, Athena’s API itself may be down.</p>}
          {h && <ul className="sys-checks">
            {h.checks.map(c => <li key={c.id} className={`sys-check-${c.status}`} title={c.detail}><Icon name={c.status === 'ok' ? 'check' : 'minus'} /><div><strong>{c.label}</strong><small>{c.status === 'ok' ? c.detail : WORD[c.status]}</small></div></li>)}
            <li className={integrations.attention.length ? 'sys-check-degraded' : 'sys-check-ok'} title={integrations.attention.length ? `Needs attention: ${integrations.attention.join(', ')}` : undefined}>
              <Icon name={integrations.attention.length ? 'minus' : 'check'} />
              <button type="button" onClick={() => onPanel('integrations')}><strong>Integrations</strong><small>{integrations.attention.length ? `${integrations.attention.length} need attention` : `${integrations.connected} connected`}</small></button>
            </li>
          </ul>}
          {h && healthOpen && <ul className="dashboard-data-list sys-health-detail">
            {h.checks.map(c => <li key={c.id}><strong>{WORD[c.status]} · {c.label}</strong><small>{c.detail}</small></li>)}
            {integrations.attention.length > 0 && <li><strong>Needs attention · Integrations</strong><small>{integrations.attention.join(', ')}</small></li>}
          </ul>}
        </section>

        <section className="hp-panel sys-costs">
          <header><span className="hp-badge hp-badge-lg hp-blue"><Glyph name="chart" /></span><h2>Service Costs <small>({new Date().toLocaleDateString(undefined, { month: 'long' })})</small></h2><button type="button" className="hp-link" onClick={() => onTab('Finance')}>View details <Icon name="arrowRight" /></button></header>
          <div className="sys-cost-grid">
            <div className="sys-cost sys-cost-total"><span>Total</span><strong>{costsLoading ? '…' : total.value}</strong><small>{total.missing.length ? `without ${total.missing.join(', ')}` : 'month to date'}</small></div>
            {costs.map(c => <div key={c.name} className="sys-cost"><span>{c.name}</span><strong>{c.value}</strong>{c.bars ? <Bars bars={c.bars} tone={c.tone} /> : <small>{c.note}</small>}</div>)}
          </div>
        </section>
      </div>

      <section className="hp-panel sys-quick">
        <header><span className="hp-badge hp-badge-lg hp-blue"><Icon name="bolt" /></span><h2>Quick Actions</h2></header>
        <div className="sys-quick-row">
          <button type="button" onClick={() => onAsk('')}><Icon name="speech" /><span>Ask a question</span></button>
          <button type="button" onClick={() => onAsk('Add an event to my calendar: ')}><Icon name="calendar" /><span>Add a calendar event</span></button>
          <button type="button" onClick={onNewTask}><Icon name="check" /><span>Create a task</span></button>
          <button type="button" className="sys-quick-warn" onClick={() => onAsk('Something isn’t working right in Athena: ')}><Glyph name="warning" /><span>Report an issue</span></button>
          <button type="button" onClick={() => onPanel('memory')}><Glyph name="book" /><span>Explore memories</span></button>
        </div>
      </section>
    </div>
  </div>;
}
