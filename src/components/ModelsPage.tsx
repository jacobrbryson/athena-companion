import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  labApi, type LabCompareRow, type LabDrillResult, type LabEvalRow, type LabOverview, type LabPing, type LabPreview, type LabStats, type LlmOutage,
} from '../api/companion';
import { BRAIN_REFRESH_EVENT } from './BrainStatus';
import { Panel, SectionPage, type SectionContext } from './Dashboard';
import { Stat } from './SectionMetric';
import './models.css';

/**
 * System → Models: which model answers what and why, how each is doing, and
 * the owner's tools for proving the fallback works (2026-11-14, after Gemini
 * ran out of quota and most of the app went with it).
 *
 * Every number here comes from the server: the call log (real traffic only —
 * drills and comparisons are logged as tests), the eval store, and the
 * router's own reasoning. The tools are owner-only on the server; anyone else
 * sees a short note instead.
 */

const NAMES: Record<string, string> = { gemini: 'Gemini', openai: 'OpenAI' };
const nameOf = (id: string, tier?: string) => NAMES[id] || (tier === 'orcwood' ? `Desktop (${id})` : id);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const secs = (ms: number | null | undefined) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const REASON: Record<string, string> = { quota: 'out of quota', rate_limit: 'rate-limited', timeout: 'not responding', auth: 'refusing its key', errors: 'failing' };

const TASKS = [
  { id: 'chat', urgency: 'interactive', label: 'Typed chat' },
  { id: 'chat', urgency: 'voice', label: 'Spoken turn' },
  { id: 'extract', urgency: 'background', label: 'Memory extraction' },
  { id: 'critique', urgency: 'interactive', label: 'Second look (critique)' },
  { id: 'vision', urgency: 'interactive', label: 'Photo understanding' },
  { id: 'tts', urgency: 'voice', label: 'Her voice' },
] as const;

function errText(e: unknown) {
  return (e as Error)?.message || 'Something went wrong.';
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    load().then(data => setState({ data, error: null, loading: false })).catch(e => setState(s => ({ data: s.data, error: errText(e), loading: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

function Badge({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'idle' | 'info'; children: ReactNode }) {
  return <span className={`mdl-badge mdl-${tone}`}>{children}</span>;
}

function OutageNotice({ outage, onStop, busy }: { outage: LlmOutage; onStop: () => void; busy: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!outage.drill) return;
    const t = window.setInterval(() => tick(n => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [outage.drill]);
  if (outage.level === 'ok' && !outage.drill && !outage.backupDown.length) return null;
  const left = outage.drill ? Math.max(0, outage.drill.endsAt - Date.now()) : 0;
  return <div className={`mdl-outage mdl-outage-${outage.drill ? 'drill' : outage.level}`} role="status">
    <div>
      <strong>{outage.drill ? `Drill running: ${outage.drill.label}` : outage.level === 'ok' ? 'A backup is offline' : outage.level === 'down' ? 'Athena can’t answer' : 'Running on a fallback'}</strong>
      {outage.message && <p>{outage.message}</p>}
      {outage.level === 'ok' && outage.backupDown.map(d => <p key={d.endpointId}>{d.name} is {REASON[d.reason] || d.reason}. Nothing changes for anyone until it’s needed.</p>)}
      {outage.drill && <p>Every request on this server instance sees the simulated outage. Ends in {Math.floor(left / 60_000)}:{String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}.</p>}
    </div>
    {outage.drill && <button className="source-fix" onClick={onStop} disabled={busy}>Stop drill</button>}
  </div>;
}

function Chain({ p }: { p: LabPreview }) {
  return <ol className="mdl-chain">
    {p.chain.map((c, i) => <li key={c.endpointId} className={c.available ? '' : 'mdl-off'}>
      <span>{i + 1}</span>{nameOf(c.endpointId, c.tier)} <small>{c.model || ''}</small>
      {!c.available && <Badge tone={c.drilled ? 'info' : 'bad'}>{c.drilled ? 'drilled out' : REASON[c.openReason || 'errors'] || 'down'}</Badge>}
      {p.serving?.endpointId === c.endpointId && <Badge tone="good">answers</Badge>}
    </li>)}
  </ol>;
}

function Checks({ p }: { p: LabPreview }) {
  if (p.decision.excluded) return <p className="dashboard-empty">{p.decision.excluded.why}.</p>;
  if (!p.decision.local.length) return null;
  return <ul className="mdl-checks">
    {p.decision.local.flatMap(l => l.checks.map((c, i) => <li key={`${l.endpointId}-${c.rule}-${i}`} className={c.ok ? 'mdl-pass' : 'mdl-fail'}>
      <span aria-hidden>{c.ok ? '✓' : '✗'}</span><b>{c.rule}</b> {c.detail}
    </li>))}
  </ul>;
}

/** "Right now": what each kind of call would go to, and why. */
function RightNow({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<(LabPreview | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(TASKS.map(t => labApi.preview({ task: t.id, urgency: t.urgency }).catch(() => null)))
      .then(r => { if (alive) { setRows(r); setError(r.every(x => !x) ? 'Couldn’t read the router.' : null); } });
    return () => { alive = false; };
  }, [refreshKey]);
  return <Panel title="Right now" note="who answers each kind of call" wide>
    {error && <p className="dashboard-empty" role="status">{error}</p>}
    <div className="mdl-now">
      {TASKS.map((t, i) => {
        const p = rows[i];
        return <div key={t.label} className="mdl-now-card">
          <small>{t.label}</small>
          <strong>{p?.serving ? nameOf(p.serving.endpointId, p.serving.tier) : p ? 'Nothing available' : '…'}</strong>
          {p && <p>{p.decision.lead?.why}</p>}
        </div>;
      })}
    </div>
  </Panel>;
}

function MixTable({ stats }: { stats: LabStats }) {
  if (!stats.byEndpoint.length) return <p className="dashboard-empty">No real model calls in this window.</p>;
  return <>
    <div className="ff-table-wrap"><table className="ff-table mdl-table">
      <thead><tr><th>Model</th><th>Calls</th><th>Share</th><th>As fallback</th><th>Errors</th><th>Bad output</th><th>Median</th><th>Slowest 5%</th></tr></thead>
      <tbody>{stats.byEndpoint.map(r => <tr key={r.key}>
        <td>{nameOf(r.key || '', r.tier)}</td><td>{r.calls}</td><td>{pct(r.ok, stats.totals.ok)}</td><td>{r.fallbackOk}</td>
        <td className={r.errors / Math.max(1, r.calls) > 0.25 ? 'mdl-bad-cell' : ''}>{pct(r.errors, r.calls)}</td><td>{pct(r.invalid, r.calls)}</td><td>{secs(r.p50)}</td><td>{secs(r.p95)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="source-note">By task</p>
    <div className="ff-table-wrap"><table className="ff-table mdl-table">
      <thead><tr><th>Task</th><th>Model</th><th>Calls</th><th>As fallback</th><th>Errors</th><th>Median</th><th>Slowest 5%</th></tr></thead>
      <tbody>{stats.byTask.slice(0, 24).map(r => <tr key={`${r.task}-${r.endpointId}`}>
        <td>{r.task}</td><td>{nameOf(r.endpointId || '', r.tier)}</td><td>{r.calls}</td><td>{r.fallbackOk}</td><td>{pct(r.errors, r.calls)}</td><td>{secs(r.p50)}</td><td>{secs(r.p95)}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

function Scorecard({ latest, history }: { latest: LabEvalRow[]; history: LabEvalRow[] }) {
  if (!latest.length) return <p className="dashboard-empty">No eval scores yet. Run them now, or wait for tonight’s review. Until a local model has scores at least as good as Gemini’s, it only answers as a fallback.</p>;
  const suites = [...new Set(latest.map(r => r.suite))];
  const endpoints = [...new Set(latest.map(r => r.endpointId))];
  const trend = (endpointId: string, suite: string) => history.filter(h => h.endpointId === endpointId && h.suite === suite).slice(-14);
  return <div className="ff-table-wrap"><table className="ff-table mdl-table">
    <thead><tr><th>Model</th>{suites.map(s => <th key={s}>{s}</th>)}</tr></thead>
    <tbody>{endpoints.map(id => {
      const row = latest.find(r => r.endpointId === id);
      return <tr key={id}>
        <td>{nameOf(id, row?.tier)}<small className="mdl-sub">{row?.model || ''}</small></td>
        {suites.map(s => {
          const r = latest.find(x => x.endpointId === id && x.suite === s);
          if (!r) return <td key={s}>—</td>;
          const t = trend(id, s);
          return <td key={s} title={`${r.passed}/${r.total}, ${ago(r.at)}`}>
            <span className={r.passed === r.total ? 'mdl-pass' : 'mdl-fail'}>{r.passed}/{r.total}</span>
            {t.length > 1 && <span className="mdl-spark" aria-label={`${t.length} runs`}>{t.map((h, i) => <i key={i} style={{ height: `${Math.max(2, (h.passed / Math.max(1, h.total)) * 14)}px` }} />)}</span>}
            <small className="mdl-sub">{ago(r.at)}</small>
          </td>;
        })}
      </tr>;
    })}</tbody>
  </table></div>;
}

function Incidents({ stats }: { stats: LabStats }) {
  if (!stats.incidents.length) return <p className="dashboard-empty">No outages in the last week: no hour where a model failed half its calls.</p>;
  return <ul className="dashboard-data-list">{stats.incidents.map(i => <li key={`${i.endpointId}-${i.startsAt}`}>
    <strong>{nameOf(i.endpointId)} {i.quota ? 'ran out of quota' : 'was failing'}</strong>
    <small>{when(i.startsAt)} – {when(i.endsAt)} · {i.errors} failed calls</small>
  </li>)}</ul>;
}

function DrillTool({ scenarios, onDone }: { scenarios: LabOverview['scenarios']; onDone: () => void }) {
  const [scenario, setScenario] = useState(scenarios[0]?.id || 'gemini-quota');
  const [urgency, setUrgency] = useState('interactive');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabDrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try { setResult(await labApi.drillTest(scenario, message, urgency)); onDone(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return <div className="mdl-tool">
    <h3>Outage drill</h3>
    <p className="dashboard-empty">Sends one test message as if the outage were real. Only this request sees it; everyone else’s traffic is untouched, and the call is logged as a test.</p>
    <div className="dashboard-form mdl-form">
      <label>Outage<select value={scenario} onChange={e => setScenario(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label>As a<select value={urgency} onChange={e => setUrgency(e.target.value)}><option value="interactive">typed message</option><option value="voice">spoken turn</option></select></label>
      <label>Message<input value={message} maxLength={500} placeholder="Quick check: what’s one thing I could do to unwind tonight?" onChange={e => setMessage(e.target.value)} /></label>
      <button className="source-fix" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run drill'}</button>
    </div>
    {error && <p className="dashboard-empty" role="alert">{error}</p>}
    {result && <div className={`mdl-result ${result.passed ? 'mdl-result-pass' : 'mdl-result-fail'}`} role="status">
      <strong>{result.passed ? `Passed: ${nameOf(result.servedBy!.endpointId, result.servedBy!.tier)} answered in ${secs(result.latencyMs)}` : 'Failed: nothing answered'}</strong>
      {result.reply && <blockquote>{result.reply}</blockquote>}
      {result.servedBy && <p>{result.servedBy.why}</p>}
      {result.attempts.length > 0 && <ul>{result.attempts.map((a, i) => <li key={i}>{nameOf(a.endpointId)}: {a.drill ? 'drilled out' : a.error}</li>)}</ul>}
      {result.error && <p>{result.error}</p>}
      {result.wouldLose.length > 0 && <p>Also unavailable in this outage: {result.wouldLose.join(', ')}.</p>}
    </div>}
  </div>;
}

function ServerDrillTool({ overview, onChange }: { overview: LabOverview; onChange: () => void }) {
  const [scenario, setScenario] = useState(overview.scenarios[0]?.id || 'gemini-quota');
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    const label = overview.scenarios.find(s => s.id === scenario)?.label || scenario;
    if (!window.confirm(`Simulate “${label}” for everyone on this server for ${minutes} minutes? The family will see the outage banner and get fallback answers until it ends or you stop it.`)) return;
    setBusy(true); setError(null);
    try {
      await labApi.startDrill(scenario, minutes);
      onChange();
      window.dispatchEvent(new Event(BRAIN_REFRESH_EVENT));
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return <div className="mdl-tool">
    <h3>Server-wide drill</h3>
    <p className="dashboard-empty">The only way to see the real banner on the phone and in the Guardians app. It affects everyone, applies to this server instance (a deploy ends it), and stops by itself after at most {overview.maxDrillMinutes} minutes.</p>
    <div className="dashboard-form mdl-form">
      <label>Outage<select value={scenario} onChange={e => setScenario(e.target.value)}>{overview.scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label>Minutes<input type="number" min={1} max={overview.maxDrillMinutes} value={minutes} onChange={e => setMinutes(Math.min(overview.maxDrillMinutes, Math.max(1, Number(e.target.value) || 1)))} /></label>
      <button className="source-fix" onClick={start} disabled={busy || !!overview.outage.drill}>{overview.outage.drill ? 'A drill is running' : busy ? 'Starting…' : 'Start for everyone'}</button>
    </div>
    {error && <p className="dashboard-empty" role="alert">{error}</p>}
  </div>;
}

function PreviewTool({ scenarios }: { scenarios: LabOverview['scenarios'] }) {
  const [q, setQ] = useState({ task: 'chat', audience: 'adult', urgency: 'interactive', chars: 2000, scenario: '' });
  const [p, setP] = useState<LabPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    labApi.preview(q).then(r => { if (alive) { setP(r); setError(null); } }).catch(e => alive && setError(errText(e)));
    return () => { alive = false; };
  }, [q]);
  const set = (k: keyof typeof q) => (e: { target: { value: string } }) => setQ(s => ({ ...s, [k]: k === 'chars' ? Number(e.target.value) || 0 : e.target.value }));
  return <div className="mdl-tool">
    <h3>What would answer?</h3>
    <p className="dashboard-empty">The router’s decision for a call like this, with its reasoning. No model is called.</p>
    <div className="dashboard-form mdl-form">
      <label>Task<select value={q.task} onChange={set('task')}>{['chat', 'json', 'extract', 'critique', 'review', 'vision', 'tts', 'search', 'embed'].map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Who<select value={q.audience} onChange={set('audience')}><option value="adult">an adult</option><option value="child">a child</option></select></label>
      <label>As a<select value={q.urgency} onChange={set('urgency')}><option value="interactive">typed turn</option><option value="voice">spoken turn</option><option value="background">background job</option></select></label>
      <label>Prompt size<select value={q.chars} onChange={set('chars')}>{[2000, 12000, 30000, 80000].map(n => <option key={n} value={n}>{n.toLocaleString()} characters</option>)}</select></label>
      <label>During<select value={q.scenario} onChange={set('scenario')}><option value="">normal operation</option>{scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
    </div>
    {error && <p className="dashboard-empty" role="alert">{error}</p>}
    {p && <div className="mdl-result">
      <strong>{p.serving ? `${nameOf(p.serving.endpointId, p.serving.tier)} answers` : 'Nothing can answer this'}</strong>
      <p>{p.decision.lead?.why}</p>
      <Chain p={p} />
      <Checks p={p} />
    </div>}
  </div>;
}

function CompareTool({ onDone }: { onDone: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<LabCompareRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { setRows((await labApi.compare(message)).results); onDone(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return <div className="mdl-tool mdl-tool-wide">
    <h3>Side by side</h3>
    <p className="dashboard-empty">The same message to every model on its own, with no fallback. Logged as a test.</p>
    <div className="dashboard-form mdl-form mdl-form-row">
      <label>Message<input value={message} maxLength={500} placeholder="Quick check: what’s one thing I could do to unwind tonight?" onChange={e => setMessage(e.target.value)} /></label>
      <button className="source-fix" onClick={run} disabled={busy}>{busy ? 'Asking…' : 'Ask every model'}</button>
    </div>
    {error && <p className="dashboard-empty" role="alert">{error}</p>}
    {rows && <div className="mdl-compare">{rows.map(r => <div key={r.endpointId} className={`mdl-result ${r.valid ? 'mdl-result-pass' : 'mdl-result-fail'}`}>
      <strong>{nameOf(r.endpointId, r.tier)} · {secs(r.latencyMs)}</strong>
      <small className="mdl-sub">{r.model}</small>
      {r.reply ? <blockquote>{r.reply}</blockquote> : <p>{r.error}</p>}
    </div>)}</div>}
  </div>;
}

function PingTool() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<LabPing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { setRows((await labApi.ping()).endpoints); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return <div className="mdl-tool">
    <h3>Ping the desktop</h3>
    <p className="dashboard-empty">Is the local model reachable over Tailscale, what has it loaded, and does its gate refuse a request without the token? Reads the model list only.</p>
    <button className="source-fix" onClick={run} disabled={busy}>{busy ? 'Pinging…' : 'Ping'}</button>
    {error && <p className="dashboard-empty" role="alert">{error}</p>}
    {rows && !rows.length && <p className="dashboard-empty">No local model is configured on the server yet.</p>}
    {rows?.map(r => <div key={r.endpointId} className={`mdl-result ${r.reachable && r.gate === 'enforced' && !r.missing.length ? 'mdl-result-pass' : 'mdl-result-fail'}`}>
      <strong>{r.endpointId}: {r.reachable ? `reachable in ${secs(r.latencyMs)}` : 'unreachable'}</strong>
      <small className="mdl-sub">{r.baseUrl}{r.viaTailnet ? ' · via Tailscale' : ''}</small>
      <p>Token gate: {r.gate === 'enforced' ? 'enforced' : r.gate === 'open' ? 'OPEN: answers without a token' : r.gate}</p>
      {r.reachable && <p>Loaded: {r.models.join(', ') || 'nothing'}{r.missing.length ? ` · missing: ${r.missing.join(', ')}` : ''}</p>}
      {r.error && <p>{r.error}</p>}
    </div>)}
  </div>;
}

export function ModelsPage({ ctx, tabs }: { ctx: SectionContext; tabs?: ReactNode }) {
  const [days, setDays] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey(k => k + 1);
  const overview = useLoad(() => labApi.overview(), [refreshKey]);
  const stats = useLoad(() => labApi.stats(days), [days, refreshKey]);
  const evals = useLoad(() => labApi.evals(), [refreshKey]);
  const [evalBusy, setEvalBusy] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [stopBusy, setStopBusy] = useState(false);

  const forbidden = /owner/i.test(overview.error || '');
  const o = overview.data;
  const s = stats.data;

  const runEvals = async () => {
    setEvalBusy(true); setEvalError(null);
    try { await labApi.runEvals(); bump(); } catch (e) { setEvalError(errText(e)); } finally { setEvalBusy(false); }
  };
  const stopDrill = async () => {
    setStopBusy(true);
    try {
      await labApi.stopDrill();
      bump();
      window.dispatchEvent(new Event(BRAIN_REFRESH_EVENT));
    } finally { setStopBusy(false); }
  };

  if (forbidden) {
    return <SectionPage ctx={ctx} tabs={tabs} eyebrow="HOW I THINK" title="Models" blurb="Which model is answering, and how they’re doing." ask="Which model are you running on right now?">
      <Panel title="Owner only" wide><p className="dashboard-empty">The model stats and test tools are for the owner. The brain pill at the top shows which model is answering right now.</p></Panel>
    </SectionPage>;
  }

  const answering = o?.outage.answering;
  return <SectionPage ctx={ctx} tabs={tabs}
    eyebrow="HOW I THINK" title="Models"
    blurb="Which model answers each kind of call and why, how each one is doing, and tools to prove the fallback works before an outage does it for you."
    ask="Which model are you running on right now, and why?"
    stats={<>
      <Stat label="Answering" value={answering ? nameOf(answering.endpointId, answering.tier) : o ? 'Nothing' : '…'} note={o ? (o.outage.level === 'ok' ? `policy ${o.policy}` : o.outage.level === 'down' ? 'no model available' : 'on a fallback') : undefined} tone={!o ? 'idle' : o.outage.level === 'ok' ? 'good' : o.outage.level === 'down' ? 'alert' : 'ok'} />
      <Stat label="Answered locally" value={s ? `${Math.round(s.totals.localShare * 100)}%` : '…'} note={s ? `${s.totals.localOk} of ${s.totals.ok} in ${days === 1 ? '24 h' : `${days} days`}` : undefined} tone={s && s.totals.localShare > 0 ? 'good' : 'idle'} />
      <Stat label="Fallbacks" value={s ? s.totals.fallbackOk : '…'} note="answered after another model failed" tone={s && s.totals.fallbackOk ? 'ok' : 'idle'} />
      <Stat label="Saved (est.)" value={s ? `$${s.savings.usd.toFixed(2)}` : '…'} note={s ? `${s.savings.tokens.toLocaleString()} tokens kept off the cloud` : undefined} />
    </>}
  >
    {o && <div className="section-panel-wide mdl-outage-slot"><OutageNotice outage={o.outage} onStop={stopDrill} busy={stopBusy} /></div>}
    {overview.error && !forbidden && <Panel title="Model lab" wide><p className="dashboard-empty" role="status">{overview.error}</p></Panel>}

    <RightNow refreshKey={refreshKey} />

    <Panel title="Routing mix" note={<span className="mdl-toggle">{[1, 7].map(d => <button key={d} className={d === days ? 'mdl-on' : ''} onClick={() => setDays(d)}>{d === 1 ? '24 h' : '7 days'}</button>)}</span>} wide>
      {stats.error ? <p className="dashboard-empty" role="status">{stats.error}</p> : !s ? <p className="source-note">Reading the call log…</p> : <MixTable stats={s} />}
      {s && <p className="source-note">Tests set aside: {s.tests.smoke} drill and comparison calls, {s.tests.evals} eval calls.</p>}
    </Panel>

    <Panel title="Eval scorecard" note="the evidence for answering locally" wide>
      {evals.error ? <p className="dashboard-empty" role="status">{evals.error}</p> : !evals.data ? <p className="source-note">Reading scores…</p> : <Scorecard latest={evals.data.latest} history={evals.data.history} />}
      <button className="source-fix" onClick={runEvals} disabled={evalBusy}>{evalBusy ? 'Running evals… (up to a minute)' : 'Run evals now'}</button>
      {evalError && <p className="dashboard-empty" role="alert">{evalError}</p>}
    </Panel>

    <Panel title="Outages" note="last 7 days">
      {!s ? <p className="source-note">Reading…</p> : <Incidents stats={s} />}
    </Panel>

    <Panel title="Ping" note="desktop model box"><PingTool /></Panel>

    {o && <Panel title="Test tools" note="owner only · logged as tests" wide>
      <div className="mdl-tools">
        <DrillTool scenarios={o.scenarios} onDone={bump} />
        <PreviewTool scenarios={o.scenarios} />
        <ServerDrillTool overview={o} onChange={bump} />
        <CompareTool onDone={bump} />
      </div>
    </Panel>}
  </SectionPage>;
}
