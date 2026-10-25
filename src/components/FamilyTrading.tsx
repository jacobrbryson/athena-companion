import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  STATUS_LABEL, ageText, etTime, pctText, tradingApi, usd,
  type Condition, type Dashboard, type NotificationEvent, type NotificationsStatus, type Performance, type Position, type Replay, type SetupCheck, type SignalRow, type SymbolDetail, type TradingNotification, type WatchRow,
} from '../api/trading';
import { initiativeApi } from '../api/companion';
import { useWebPush } from '../athena/useWebPush';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import { TradingChart, type ChartLevel } from './TradingChart';
import './familyFinance.css';
import './trading.css';

/**
 * Family → Trading (2026-10-23): Athena as a disciplined intraday analyst
 * for a small cash account. Everything shown is either a market fact with its
 * timestamp, a verdict of the deterministic rule engine (core_api
 * services/trading/strategy.js), or the person's own records. Athena places
 * no orders; every decision and execution is the person's.
 * See core_api docs/capabilities/trading.md.
 */
type View = 'desk' | 'journal' | 'history' | 'settings';
const VIEWS: { id: View; label: string }[] = [
  { id: 'desk', label: 'Desk' }, { id: 'journal', label: 'Journal' }, { id: 'history', label: 'History' }, { id: 'settings', label: 'Settings' },
];

const statusClass = (s?: string | null) => `tr-status tr-${(s || 'none').toLowerCase()}`;
const tone = (v: number | null | undefined) => v === null || v === undefined || v === 0 ? '' : v > 0 ? 'ff-up' : 'ff-down';
const errText = (e: unknown) => (e as { body?: { message?: string } })?.body?.message || (e as Error)?.message || 'Something went wrong.';

function StatusChip({ status }: { status?: string | null }) {
  return <span className={statusClass(status)}>{status ? STATUS_LABEL[status as keyof typeof STATUS_LABEL] || status : 'Not evaluated'}</span>;
}

function Check({ c }: { c: Condition }) {
  return <li className={`tr-check tr-check-${c.state}`}>
    <span className="tr-check-state">{c.state.toUpperCase()}</span>
    <span><strong>{c.label}</strong><small>{c.detail}</small></span>
  </li>;
}

// ---------------------------------------------------------------------------
// Desk
// ---------------------------------------------------------------------------

function DataBadge({ d, generated }: { d: Dashboard['data']; generated: string }) {
  if (!d.configured) return <span className="tr-badge tr-badge-bad">Market data not connected</span>;
  const label = d.feed === 'sip' ? 'Real-time · full market (SIP)' : d.feed === 'iex' ? 'Real-time · IEX only' : 'Delayed 15 min';
  return <span className={`tr-badge ${d.can_confirm ? 'tr-badge-ok' : 'tr-badge-warn'}`} title={d.can_confirm ? 'This feed can confirm entries.' : 'This feed can watch but cannot confirm an entry.'}>
    {label}{!d.can_confirm && ' · can\'t confirm'} · stream {d.stream.status} · updated {ageText(generated)}
  </span>;
}

function Overview({ dash }: { dash: Dashboard }) {
  const o = dash.overview;
  if (!o) return null;
  const leg = (l: typeof o.spy, name: string) => <div className="tr-leg">
    <span>{name}</span><strong>{usd(l.price)}</strong>
    <small className={tone(l.change)}>{pctText(l.change)} day</small>
    <small>{l.above_vwap === null ? 'VWAP —' : l.above_vwap ? `above VWAP ${usd(l.vwap)}` : `below VWAP ${usd(l.vwap)}`}</small>
    <small className="tr-dim">{etTime(l.price_at)}</small>
  </div>;
  return <section className="hp-panel ff-wide tr-overview">
    <header><h2>Market</h2><span className={`tr-assess tr-assess-${o.assessment.toLowerCase()}`}>{o.assessment}</span><span className="ff-meta">Regime: {o.regime}</span></header>
    <div className="tr-legs">
      {leg(o.spy, 'SPY')}{leg(o.qqq, 'QQQ')}
      <div className="tr-leg"><span>Volatility ({o.volatility.symbol})</span><strong>{usd(o.volatility.price)}</strong><small className={tone(o.volatility.change === null ? null : -o.volatility.change)}>{pctText(o.volatility.change)} day</small><small className="tr-dim">VIX-futures ETF, not the VIX</small></div>
      <div className="tr-leg"><span>Breadth</span><strong>{o.breadth ? `${o.breadth.above_vwap}/${o.breadth.of}` : '—'}</strong><small>{o.breadth?.basis || 'unavailable'}</small></div>
    </div>
    <p className="tr-reasons">{o.reasons.join(' ')}</p>
    <div className="tr-sectors">{o.sectors.map(s => <span key={s.symbol} className={tone(s.change)} title={s.above_vwap === null ? '' : s.above_vwap ? 'above VWAP' : 'below VWAP'}>{s.name} {pctText(s.change, 1)}</span>)}</div>
    <p className="ff-note">
      {dash.events.today.length ? <>Today: {dash.events.today.map(e => `${e.name} ${etTime(e.at)}`).join(' · ')}. </> : 'No scheduled high-impact events known today. '}
      Calendar covers {dash.events.coverage}. Earnings dates aren't included.
    </p>
  </section>;
}

function AccountStrip({ dash }: { dash: Dashboard }) {
  const a = dash.account;
  return <section className="cp-stats" aria-label="Trading account">
    <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-green"><Icon name="check" /></span>
      <div><span>Settled cash</span><strong>{usd(a.cash.usable_settled)}</strong><small>{a.cash.unsettled ? `${usd(a.cash.unsettled)} unsettled` : 'nothing unsettled'}</small></div></div>
    <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-blue"><Icon name="shield" /></span>
      <div><span>Risk available</span><strong>{usd(a.today.risk_budget)}</strong><small>{usd(a.settings.max_risk_per_trade)}/trade · {usd(a.today.daily_loss_left)} of {usd(a.settings.max_daily_loss)} day left</small></div></div>
    <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-blue"><Icon name="bolt" /></span>
      <div><span>Trades today</span><strong>{a.today.trades} / {a.settings.max_trades_per_day}</strong><small>Realized <span className={tone(a.today.realized_pl)}>{usd(a.today.realized_pl, true)}</span></small></div></div>
    <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-green"><Icon name="up" /></span>
      <div><span>Open positions</span><strong>{a.open_positions.length}</strong><small>{a.open_positions.map(p => p.symbol).join(', ') || 'flat'}</small></div></div>
  </section>;
}

function Alerts({ dash, onChange }: { dash: Dashboard; onChange: () => void }) {
  const list = dash.alerts.filter(a => a.delivery_state !== 'dismissed').slice(0, 8);
  useEffect(() => {
    const fresh = list.filter(a => a.delivery_state === 'pending').map(a => a.id);
    if (fresh.length) tradingApi.seen(fresh).catch(() => {});
  }, [list.map(a => a.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;
  return <section className="hp-panel ff-wide tr-alerts">
    <header><h2>Alerts</h2><span className="ff-meta">Analytical signals, not orders.</span></header>
    <ul>{list.map(a => <li key={a.id} className={a.delivery_state === 'pending' ? 'tr-alert-new' : ''}>
      <span className="tr-dim">{etTime(a.created_at)}</span>
      <span><strong>{a.title}</strong><small>{a.body}</small></span>
      <button type="button" className="hp-link" onClick={() => tradingApi.dismiss(a.id).then(onChange)}>Dismiss</button>
    </li>)}</ul>
  </section>;
}

function Watchlist({ dash, selected, onSelect, onChange }: { dash: Dashboard; selected: string | null; onSelect: (s: string) => void; onChange: () => void }) {
  const [add, setAdd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await tradingApi.watch(add.trim().toUpperCase());
      setAdd('');
      onChange();
    } catch (x) { setErr(errText(x)); }
  }
  return <section className="hp-panel ff-wide">
    <header><h2>Watchlist <span>{dash.scan ? `scanned ${etTime(dash.scan.scanned_at)}, ${dash.scan.considered} passed filters` : ''}</span></h2>
      <form className="tr-inline" onSubmit={submit}><input value={add} onChange={e => setAdd(e.target.value)} placeholder="Add symbol" maxLength={5} aria-label="Add a symbol to watch" /><button type="submit" className="hp-link" disabled={!add.trim()}>Watch</button></form></header>
    {err && <p role="alert" className="dashboard-empty">{err}</p>}
    {dash.no_trade_reason && <p className="tr-notrade">{dash.no_trade_reason}</p>}
    {!dash.watchlist.length ? <p className="dashboard-empty">{dash.market.phase === 'open' || dash.market.phase === 'premarket' ? 'Nothing passed the scanner yet. An empty list is a valid answer.' : 'The scanner runs from 7:00 AM ET on trading days.'}</p>
      : <div className="ff-table-wrap"><table className="ff-table tr-watch">
        <thead><tr><th>Symbol</th><th className="ff-num">Price</th><th className="ff-num">RVOL</th><th>VWAP</th><th>Catalyst</th><th>Signal</th><th className="ff-num">Plan R:R</th><th>Data</th><th>Next</th></tr></thead>
        <tbody>{dash.watchlist.map(w => {
          const s = w.signal;
          const ind = (s?.indicators || {}) as Record<string, number | null>;
          const above = typeof ind.price === 'number' && typeof ind.vwap === 'number' ? ind.price > ind.vwap : null;
          return <tr key={w.symbol} className={selected === w.symbol ? 'tr-row-on' : ''} onClick={() => onSelect(w.symbol)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && onSelect(w.symbol)}>
            <td><strong>{w.symbol}</strong>{w.source === 'manual' && <small> · yours</small>}<small className="ff-legs">{w.company_name || ''}</small></td>
            <td className="ff-num">{usd(w.price)}<small className={`ff-legs ${tone(w.change)}`}>{pctText(w.change)}</small></td>
            <td className="ff-num">{typeof ind.relative_volume === 'number' ? `${ind.relative_volume.toFixed(1)}×` : '—'}</td>
            <td>{above === null ? '—' : above ? 'Above' : 'Below'}</td>
            <td className="tr-cat">{w.catalyst ? <span title={w.catalyst.headline}>{w.catalyst.headline}</span> : <small>none found</small>}</td>
            <td><StatusChip status={s?.status} /></td>
            <td className="ff-num">{s?.sizing?.ok ? `${s.sizing.reward_risk}:1` : '—'}</td>
            <td><small className={s?.data?.stale ? 'ff-down' : ''}>{s?.data ? (s.data.stale ? 'stale' : `bar ${s.data.bar_age_s ?? '—'}s`) : ageText(w.price_at)}</small></td>
            <td className="tr-next"><small>{s?.next_step || w.reasons[0] || ''}</small></td>
          </tr>;
        })}</tbody>
      </table></div>}
  </section>;
}

function Decision({ symbol, dash, onAsk, onRecord }: { symbol: string; dash: Dashboard; onAsk: (t: string) => void; onRecord: (prefill: Record<string, string>) => void }) {
  const [detail, setDetail] = useState<SymbolDetail | null>(null);
  const [frame, setFrame] = useState<'1m' | '5m'>('1m');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => tradingApi.symbol(symbol).then(d => { if (live) { setDetail(d); setErr(null); } }).catch(e => live && setErr(errText(e)));
    load();
    const id = window.setInterval(load, 15_000);
    return () => { live = false; window.clearInterval(id); };
  }, [symbol]);
  const row: WatchRow | undefined = dash.watchlist.find(w => w.symbol === symbol);
  const s = row?.signal || detail?.row?.signal || null;
  const lv = s?.levels || {};
  const levels: ChartLevel[] = useMemo(() => {
    const out: ChartLevel[] = [];
    if (lv.or_high) out.push({ label: 'OR H', price: lv.or_high, tone: 'or' });
    if (lv.or_low) out.push({ label: 'OR L', price: lv.or_low, tone: 'or' });
    if (lv.premarket_high) out.push({ label: 'PM H', price: lv.premarket_high, tone: 'pre' });
    if (lv.resistance) out.push({ label: 'Res', price: lv.resistance, tone: 'resist' });
    const plan = s?.confirmed || (s?.sizing?.ok ? s.sizing : null);
    if (plan?.entry) out.push({ label: 'Entry', price: plan.entry, tone: 'entry' });
    if (plan?.stop) out.push({ label: 'Stop', price: plan.stop, tone: 'stop' });
    if (plan?.target) out.push({ label: 'Target', price: plan.target, tone: 'target' });
    return out;
  }, [JSON.stringify(lv), JSON.stringify(s?.sizing), JSON.stringify(s?.confirmed)]); // eslint-disable-line react-hooks/exhaustive-deps
  const bars = frame === '1m' ? detail?.bars_1m || [] : detail?.bars_5m || [];
  const openAt = dash.market.session.open_at ? Date.parse(dash.market.session.open_at) : null;
  const sessionBars = openAt ? bars.filter(b => b.t >= openAt - 30 * 60_000) : bars;
  const z = s?.sizing;
  const plan = s?.confirmed ? { entry: s.confirmed.entry, stop: s.confirmed.stop, target: s.confirmed.target } : z?.ok ? { entry: z.entry!, stop: z.stop!, target: z.target! } : null;
  return <section className="hp-panel ff-wide tr-decision">
    <header><h2>{symbol} <span>{row?.company_name || ''}</span></h2><StatusChip status={s?.status} />
      <div className="tr-seg" role="tablist" aria-label="Candle size">{(['1m', '5m'] as const).map(f => <button key={f} type="button" role="tab" aria-selected={frame === f} className={frame === f ? 'on' : ''} onClick={() => setFrame(f)}>{f}</button>)}</div></header>
    {err && <p role="alert" className="dashboard-empty">{err}</p>}
    <TradingChart bars={sessionBars} vwap={frame === '1m' ? detail?.vwap_1m : undefined} levels={levels} rangeStart={openAt} rangeEnd={openAt ? openAt + 15 * 60_000 : null} label={symbol} />
    <p className="ff-note">Shaded: the 9:30–9:45 opening range. A hollow dashed candle is still forming and counts for nothing. VWAP line on 1-minute view.</p>
    <div className="tr-dgrid">
      <div>
        <h3>Conditions</h3>
        {s?.conditions?.length ? <ul className="tr-checks">{s.conditions.map(c => <Check key={c.id} c={c} />)}</ul> : <p className="dashboard-empty">{s?.reason || 'Not evaluated yet.'}</p>}
      </div>
      <div>
        <h3>Plan</h3>
        {plan && z?.ok ? <dl className="tr-plan">
          <dt>Entry</dt><dd>{usd(plan.entry)}</dd><dt>Stop</dt><dd className="ff-down">{usd(plan.stop)}</dd><dt>Target</dt><dd className="ff-up">{usd(plan.target)}</dd>
          <dt>Shares</dt><dd>{z.shares} <small>({z.limited_by === 'cash' ? 'cash-limited' : 'risk-limited'}, whole shares)</small></dd>
          <dt>Capital</dt><dd>{usd(z.position_cost)}</dd>
          <dt>Max loss</dt><dd className="ff-down">{usd(z.planned_loss)} <small>· {usd(z.est_loss_with_costs)} with costs · {z.loss_pct_of_account?.toFixed(2)}% of account</small></dd>
          <dt>Target gain</dt><dd className="ff-up">{usd(z.planned_gain)} <small>· {usd(z.est_gain_with_costs)} after costs</small></dd>
          <dt>Reward/risk</dt><dd>{z.reward_risk}:1{z.room_to_resistance_r !== null && z.room_to_resistance_r !== undefined ? <small> · resistance at {z.room_to_resistance_r.toFixed(1)}R</small> : null}</dd>
        </dl> : <p className="dashboard-empty">{z?.reasons?.length ? z.reasons.join(' ') : 'No plan until there is a structural stop.'}</p>}
        <div className="tr-assessment">
          <h3>Athena's assessment</h3>
          <p><strong>Engine:</strong> {s?.reason || '—'}</p>
          {s?.next_step && <p><strong>Next:</strong> {s.next_step}</p>}
          {row?.catalyst && <p><strong>Catalyst:</strong> {row.catalyst.headline} <small>({row.catalyst.source || 'news'}, {etTime(row.catalyst.at)})</small></p>}
          {s?.data && <p className="tr-dim">Data: {s.data.feed.toUpperCase()}, last closed candle {etTime(s.data.last_bar_at)}, quote {s.data.quote_age_s ?? '—'}s old{s.data.stale ? ` — STALE: ${s.data.problems.join('; ')}` : ''}.</p>}
          <div className="tr-actions">
            <button type="button" className="hp-link" onClick={() => onAsk(`Look at ${symbol} with me. Is this a good entry? What are we waiting for, and what's our downside?`)}>Ask Athena</button>
            <button type="button" className="hp-link" onClick={() => onRecord({ symbol, price: plan ? String(plan.entry) : '', stop: plan ? String(plan.stop) : '', target: plan ? String(plan.target) : '', shares: z?.ok ? String(z.shares) : '' })}>Record a trade I made</button>
          </div>
          <p className="ff-note">An analytical signal, not a prediction or an instruction. Athena places no orders. A stop order can fill worse than its price in a fast move, a gap or a halt.</p>
        </div>
      </div>
    </div>
  </section>;
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="tr-field"><span>{label}</span>{children}</label>;
}

function EntryForm({ prefill, onDone }: { prefill: Record<string, string>; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ symbol: '', shares: '', price: '', stop: '', target: '', fees: '0', at: '', ...prefill });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(cur => ({ ...cur, ...prefill })), [JSON.stringify(prefill)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const out = await tradingApi.enter({ ...f, at: f.at ? new Date(f.at).toISOString() : undefined, mode: 'live' });
      setMsg(out.warnings.length ? `Recorded. ${out.warnings.join(' ')}` : 'Recorded.');
      setF({ symbol: '', shares: '', price: '', stop: '', target: '', fees: '0', at: '' });
      onDone();
    } catch (x) { setMsg(errText(x)); } finally { setBusy(false); }
  }
  return <form className="tr-form" onSubmit={submit}>
    <Field label="Symbol"><input value={f.symbol} onChange={set('symbol')} maxLength={5} required /></Field>
    <Field label="Shares"><input value={f.shares} onChange={set('shares')} inputMode="decimal" required /></Field>
    <Field label="Fill price"><input value={f.price} onChange={set('price')} inputMode="decimal" required /></Field>
    <Field label="Stop"><input value={f.stop} onChange={set('stop')} inputMode="decimal" required /></Field>
    <Field label="Target"><input value={f.target} onChange={set('target')} inputMode="decimal" /></Field>
    <Field label="Fees"><input value={f.fees} onChange={set('fees')} inputMode="decimal" /></Field>
    <Field label="Filled at (blank = now)"><input type="datetime-local" value={f.at} onChange={set('at')} /></Field>
    <button type="submit" className="hp-link" disabled={busy}>{busy ? 'Saving…' : 'Record buy'}</button>
    {msg && <p role="status" className="tr-msg">{msg}</p>}
  </form>;
}

function ExitForm({ p, onDone }: { p: Position; onDone: () => void }) {
  const [f, setF] = useState({ price: '', fees: '0', reason: 'manual', followed_plan: '', notes: '', at: '' });
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const out = await tradingApi.exit(p.uuid, { ...f, at: f.at ? new Date(f.at).toISOString() : undefined, followed_plan: f.followed_plan === '' ? null : f.followed_plan === 'yes' });
      setMsg(out.warnings.join(' ') || null);
      onDone();
    } catch (x) { setMsg(errText(x)); }
  }
  return <form className="tr-form tr-form-row" onSubmit={submit}>
    <Field label="Exit price"><input value={f.price} onChange={e => setF({ ...f, price: e.target.value })} inputMode="decimal" required /></Field>
    <Field label="Fees"><input value={f.fees} onChange={e => setF({ ...f, fees: e.target.value })} inputMode="decimal" /></Field>
    <Field label="Why"><select value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })}><option value="stop">Stop</option><option value="target">Target</option><option value="invalidated">Setup invalidated</option><option value="end_of_day">End of day</option><option value="manual">Other</option></select></Field>
    <Field label="Followed the plan?"><select value={f.followed_plan} onChange={e => setF({ ...f, followed_plan: e.target.value })}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
    <Field label="Notes"><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
    <Field label="Sold at (blank = now)"><input type="datetime-local" value={f.at} onChange={e => setF({ ...f, at: e.target.value })} /></Field>
    <button type="submit" className="hp-link">Record sale</button>
    {msg && <p role="status" className="tr-msg">{msg}</p>}
  </form>;
}

function Journal({ prefill, onChange }: { prefill: Record<string, string>; onChange: () => void }) {
  const [mode, setMode] = useState<'live' | 'paper'>('live');
  const [list, setList] = useState<Position[]>([]);
  const [closing, setClosing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => tradingApi.positions(mode).then(r => { setList(r.positions); setErr(null); }).catch(e => setErr(errText(e))), [mode]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setClosing(null); load(); onChange(); };
  const open = list.filter(p => p.status === 'open');
  const closed = list.filter(p => p.status === 'closed');
  return <>
    <section className="hp-panel ff-wide">
      <header><h2>Record a trade</h2><span className="ff-meta">Your own executions at Webull. Athena records them; she never places them.</span></header>
      <EntryForm prefill={prefill} onDone={done} />
    </section>
    <section className="hp-panel ff-wide">
      <header><h2>{mode === 'live' ? 'Your trades' : 'Paper forward test'}</h2>
        <div className="tr-seg">{(['live', 'paper'] as const).map(m => <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'live' ? 'Real' : 'Paper'}</button>)}</div></header>
      {err && <p role="alert" className="dashboard-empty">{err}</p>}
      {mode === 'paper' && <p className="ff-note">Simulated: every ENTRY CONFIRMED opens a paper position at the plan, closed at its stop, target, invalidation or the close. Kept apart from real trades and from backtests.</p>}
      {open.length > 0 && <div className="tr-open">{open.map(p => <div key={p.uuid} className="tr-open-row">
        <div><strong>{p.symbol}</strong> {p.shares} sh @ {usd(p.entry_price)} · stop {usd(p.planned_stop)}{p.planned_target ? ` · target ${usd(p.planned_target)}` : ''} · {etTime(p.entry_at)}
          {p.unsettled_funds_used > 0 && <small className="ff-down"> · bought with unsettled funds; selling before {p.funds_settle_on} is a good-faith violation</small>}</div>
        {mode === 'live' && (closing === p.uuid ? <ExitForm p={p} onDone={done} /> : <button type="button" className="hp-link" onClick={() => setClosing(p.uuid)}>Record sale</button>)}
      </div>)}</div>}
      {!closed.length ? <p className="dashboard-empty">No closed {mode === 'live' ? 'trades' : 'paper trades'} yet.</p> : <div className="ff-table-wrap"><table className="ff-table">
        <thead><tr><th>Date</th><th>Symbol</th><th>Setup</th><th className="ff-num">Sh</th><th className="ff-num">Entry</th><th className="ff-num">Stop</th><th className="ff-num">Exit</th><th className="ff-num">Planned risk</th><th className="ff-num">Fees</th><th className="ff-num">Slip</th><th className="ff-num">P/L</th><th className="ff-num">R</th><th>Plan?</th><th>Notes</th></tr></thead>
        <tbody>{closed.map(p => <tr key={p.uuid}>
          <td>{new Date(p.entry_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<small className="ff-legs">{etTime(p.entry_at)}–{etTime(p.exit_at)}</small></td>
          <td><strong>{p.symbol}</strong></td><td><span className="ff-chip">{p.setup_type.replace(/_/g, ' ')}</span><small className="ff-legs">{p.exit_reason?.replace(/_/g, ' ')}</small></td>
          <td className="ff-num">{p.shares}</td><td className="ff-num">{usd(p.entry_price)}</td><td className="ff-num">{usd(p.planned_stop)}</td><td className="ff-num">{usd(p.exit_price)}</td>
          <td className="ff-num">{usd(p.journal?.planned_risk)}</td><td className="ff-num">{usd(p.journal?.fees)}</td><td className="ff-num">{p.journal?.entry_slippage === null || p.journal?.entry_slippage === undefined ? '—' : usd(p.journal.entry_slippage)}</td>
          <td className={`ff-num ${tone(p.journal?.realized_pl)}`}>{usd(p.journal?.realized_pl, true)}</td><td className="ff-num">{p.journal?.r_multiple ?? '—'}</td>
          <td>{mode === 'live' ? <select aria-label="Followed the plan" value={p.journal?.followed_plan === null || p.journal?.followed_plan === undefined ? '' : p.journal.followed_plan ? 'yes' : 'no'} onChange={e => tradingApi.journal(p.uuid, { followed_plan: e.target.value === '' ? null : e.target.value === 'yes' }).then(load)}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select> : 'sim'}</td>
          <td><small>{p.journal?.notes || ''}</small></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function EquityCurve({ points, start }: { points: Performance['equity']; start: number }) {
  if (!points.length) return <p className="dashboard-empty">No closed trades in this period.</p>;
  const vals = [start, ...points.map(p => p.equity)];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const W = 640, Hh = 160;
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * (W - 20) + 10;
  const y = (v: number) => 10 + (hi === lo ? 0.5 : (hi - v) / (hi - lo)) * (Hh - 20);
  return <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" height={Hh} role="img" aria-label="Equity curve" className="tr-equity">
    <line x1={10} x2={W - 10} y1={y(start)} y2={y(start)} className="tc-grid" />
    <path d={vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} />
    <text x={W - 10} y={y(vals[vals.length - 1]) - 6} textAnchor="end" className="tc-axis">{usd(vals[vals.length - 1])}</text>
  </svg>;
}

function CalendarGrid({ days }: { days: Performance['days'] }) {
  if (!days.length) return null;
  return <div className="tr-cal">{days.map(d => <div key={d.date} className={`tr-cal-day ${tone(d.pl)}`} title={`${d.trades} trade${d.trades === 1 ? '' : 's'}`}>
    <small>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small><strong>{usd(d.pl, true)}</strong></div>)}</div>;
}

function StatsTiles({ s }: { s: Performance['overall'] }) {
  const item = (label: string, value: ReactNode, cls = '') => <div className="tr-stat"><span>{label}</span><strong className={cls}>{value}</strong></div>;
  return <div className="tr-stats">
    {item('Net P/L', usd(s.net_pl, true), tone(s.net_pl))}{item('Trades', s.trades)}{item('Win rate', s.win_rate === null ? '—' : `${Math.round(s.win_rate * 100)}%`)}
    {item('Avg win / loss', `${usd(s.avg_win)} / ${usd(s.avg_loss)}`)}{item('Profit factor', s.profit_factor ?? '—')}{item('Max drawdown', usd(s.max_drawdown))}
    {item('Avg R', s.avg_r ?? '—')}{item('Rule compliance', s.rule_compliance === null ? '—' : `${Math.round(s.rule_compliance * 100)}% of ${s.judged}`)}
  </div>;
}

function ReplayView({ uuid, onClose }: { uuid: string; onClose: () => void }) {
  const [r, setR] = useState<Replay | null>(null);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { tradingApi.replay(uuid).then(x => { setR(x); setStep(x.signal.events.length - 1); }).catch(e => setErr(errText(e))); }, [uuid]);
  if (err) return <p role="alert" className="dashboard-empty">{err}</p>;
  if (!r) return <p className="dashboard-empty">Loading replay…</p>;
  const ev = r.signal.events[step];
  const asOf = ev ? Date.parse(ev.evaluated_at) : Date.now();
  // Only candles that had closed by this event: what Athena knew then.
  const known = r.candles.filter(c => c.t + 60_000 <= asOf);
  const levels: ChartLevel[] = [];
  const lv = ev?.levels || {};
  if (lv.or_high) levels.push({ label: 'OR H', price: lv.or_high, tone: 'or' });
  if (lv.or_low) levels.push({ label: 'OR L', price: lv.or_low, tone: 'or' });
  if (lv.stop) levels.push({ label: 'Stop', price: lv.stop, tone: 'stop' });
  if (lv.target) levels.push({ label: 'Target', price: lv.target, tone: 'target' });
  return <section className="hp-panel ff-wide">
    <header><h2>Replay {r.signal.symbol} <span>{r.signal.session_date} · strategy v{r.signal.strategy_version} · {r.signal.feed.toUpperCase()}</span></h2><button type="button" className="hp-link" onClick={onClose}>Close</button></header>
    <div className="tr-seg tr-steps">{r.signal.events.map((e, i) => <button key={e.seq} type="button" className={i === step ? 'on' : ''} onClick={() => setStep(i)}>{etTime(e.evaluated_at)} {STATUS_LABEL[e.to_status]}</button>)}</div>
    <TradingChart bars={known} levels={levels} rangeStart={r.session.open_at ? Date.parse(r.session.open_at) : null} rangeEnd={r.session.open_at ? Date.parse(r.session.open_at) + 15 * 60_000 : null} label={`${r.signal.symbol} as of ${etTime(ev?.evaluated_at)}`} />
    {ev && <><p><StatusChip status={ev.to_status} /> {ev.reason}</p><ul className="tr-checks">{(ev.conditions || []).map(c => <Check key={c.id} c={c} />)}</ul></>}
    <p className="ff-note">Built only from what was recorded at the time and candles that had closed by then. Outcome, measured afterwards: {r.signal.outcome ? `${r.signal.outcome.replace(/_/g, ' ')}${r.signal.outcome_r !== null ? ` (${r.signal.outcome_r}R)` : ''}` : 'not measured yet'}.</p>
  </section>;
}

function History() {
  const [notes, setNotes] = useState<TradingNotification[]>([]);
  useEffect(() => { tradingApi.notifications().then(s => setNotes(s.history)).catch(() => {}); }, []);
  const [mode, setMode] = useState<'live' | 'paper'>('live');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'all'>('month');
  const [perf, setPerf] = useState<Performance | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [replay, setReplay] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { tradingApi.performance(mode, period).then(p => { setPerf(p); setErr(null); }).catch(e => setErr(errText(e))); }, [mode, period]);
  useEffect(() => { tradingApi.signals().then(r => setSignals(r.signals)).catch(() => {}); }, []);
  return <>
    <section className="hp-panel ff-wide">
      <header><h2>Performance</h2>
        <div className="tr-seg">{(['live', 'paper'] as const).map(m => <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'live' ? 'Real' : 'Paper'}</button>)}</div>
        <div className="tr-seg">{(['day', 'week', 'month', 'all'] as const).map(p => <button key={p} type="button" className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{p}</button>)}</div></header>
      {err && <p role="alert" className="dashboard-empty">{err}</p>}
      {perf && <>
        <StatsTiles s={perf.overall} />
        <h3>Equity</h3><EquityCurve points={perf.equity} start={mode === 'live' ? (perf.equity[0] ? perf.equity[0].equity - perf.equity[0].pl : 0) : 0} />
        <h3>Days</h3><CalendarGrid days={perf.days} />
        <div className="ff-grid">
          {(['by_setup', 'by_regime'] as const).map(k => <div key={k}><h3>{k === 'by_setup' ? 'By setup' : 'By market regime'}</h3>
            {perf[k].length ? <table className="ff-table"><thead><tr><th>{k === 'by_setup' ? 'Setup' : 'Regime'}</th><th className="ff-num">Trades</th><th className="ff-num">Win</th><th className="ff-num">Avg R</th><th className="ff-num">Net</th></tr></thead>
              <tbody>{perf[k].map(g => <tr key={g.key}><td>{g.key.replace(/_/g, ' ')}</td><td className="ff-num">{g.trades}</td><td className="ff-num">{g.win_rate === null ? '—' : `${Math.round(g.win_rate * 100)}%`}</td><td className="ff-num">{g.avg_r ?? '—'}</td><td className={`ff-num ${tone(g.net_pl)}`}>{usd(g.net_pl, true)}</td></tr>)}</tbody></table>
              : <p className="dashboard-empty">Nothing yet.</p>}</div>)}
        </div>
        <h3>Signal outcomes</h3>
        <p className="hp-sub">{perf.signals.total} setups evaluated, {perf.signals.confirmed} confirmed. Of measured confirmations, {perf.signals.confirmed_target_first} reached target first and {perf.signals.confirmed_stop_first} stop first. Of {perf.signals.rejected_measured} setups the rules passed on, {perf.signals.rejected_would_have_won} would have reached 2R. <small>{perf.signals.note}</small></p>
        <p className="ff-note">Past results describe the past. A small sample says little; nothing here promises future results.</p>
      </>}
    </section>
    <NotificationHistory items={notes} />
    {replay && <ReplayView uuid={replay} onClose={() => setReplay(null)} />}
    <section className="hp-panel ff-wide">
      <header><h2>Signals, last 30 days</h2><span className="ff-meta">Every evaluated setup, rejected ones too.</span></header>
      {!signals.length ? <p className="dashboard-empty">No signals recorded yet.</p> : <div className="ff-table-wrap"><table className="ff-table">
        <thead><tr><th>Date</th><th>Symbol</th><th>First</th><th>Last</th><th>Confirmed</th><th>Outcome</th><th /></tr></thead>
        <tbody>{signals.map(s => <tr key={s.uuid}><td>{s.session_date}</td><td><strong>{s.symbol}</strong></td><td><StatusChip status={s.initial_status} /></td><td><StatusChip status={s.status} /></td>
          <td>{s.ever_confirmed ? 'Yes' : '—'}</td><td>{s.outcome ? `${s.outcome.replace(/_/g, ' ')}${s.outcome_r !== null ? ` · ${s.outcome_r}R` : ''}` : '—'}</td>
          <td><button type="button" className="hp-link" onClick={() => setReplay(s.uuid)}>Replay</button></td></tr>)}</tbody>
      </table></div>}
    </section>
  </>;
}

// ---------------------------------------------------------------------------
// Notifications — push for setups (core_api services/trading/notifications.js)
// ---------------------------------------------------------------------------

const EVENT_LABEL: Record<NotificationEvent, string> = {
  SETUP_FORMING: 'Setup forming', ENTRY_CONFIRMED: 'Entry confirmed', SETUP_INVALIDATED: 'Invalidated', SETUP_EXPIRED: 'Expired', RISK_LIMIT_REACHED: 'Risk limit', TEST: 'Test',
};
const STATE_LABEL: Record<TradingNotification['state'], string> = {
  pending: 'Queued', held: 'Held', sending: 'Sending', sent: 'Sent', failed: 'Not delivered', lapsed: 'Lapsed — not sent', skipped: 'Skipped',
};

/**
 * Opened from a notification: the setup re-checked against the market now.
 * The notified figures are shown as history; only the verdict says whether
 * anything is still actionable.
 */
function SetupCheckPanel({ uuid, notification, onClose }: { uuid: string; notification: string | null; onClose: () => void }) {
  const [out, setOut] = useState<SetupCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const check = useCallback(() => { setErr(null); tradingApi.setup(uuid, notification).then(setOut).catch(e => setErr(errText(e))); }, [uuid, notification]);
  useEffect(() => { check(); }, [check]);
  const plan = out?.plan;
  const v = out?.check;
  return <section className="hp-panel ff-wide tr-setupcheck" aria-live="polite">
    <header><h2>{out ? `${out.signal.symbol} setup — checked now` : 'Checking the setup…'}</h2>
      <div className="tr-actions"><button type="button" className="hp-link" onClick={check}>Check again</button><button type="button" className="hp-link" onClick={onClose}>Close</button></div></header>
    {err && <p role="alert" className="dashboard-empty">{err}</p>}
    {v && <p className={`tr-verdict ${v.actionable ? 'tr-verdict-ok' : 'tr-verdict-no'}`}>
      {v.actionable
        ? `${v.mode === 'live' ? 'Still valid' : 'Still lines up (PAPER / EXPERIMENTAL)'} as of ${etTime(v.checked_at)}. Your decision; Athena places nothing.`
        : `Not actionable as of ${etTime(v.checked_at)}: ${v.blocking.join(' ')}`}
    </p>}
    {v && v.mode === 'paper' && v.paper_because.length > 0 && <p className="ff-note">Paper only: {v.paper_because.join('; ')}.</p>}
    {v?.ledger_only && <p className="ff-note">Sizing relies on Athena's internal ledger; Webull's balance hasn't been verified today.</p>}
    {plan && <dl className="tr-plan">
      <dt>As notified</dt><dd>{out?.notification ? `${etTime(out.notification.created_at)}${out.notification.mode === 'paper' ? ' · paper' : ''}` : 'no notification'}</dd>
      <dt>Entry</dt><dd>{usd(plan.entry)}</dd><dt>Stop</dt><dd>{usd(plan.stop)}</dd><dt>Target</dt><dd>{usd(plan.target)}</dd>
      <dt>Shares</dt><dd>{plan.shares ?? '—'}</dd><dt>Capital</dt><dd>{usd(plan.position_cost)}</dd><dt>Planned risk</dt><dd>{usd(plan.planned_risk)}</dd>
      <dt>Reward/risk</dt><dd>{plan.reward_risk ?? '—'}:1</dd><dt>Signal</dt><dd>{etTime(plan.signal_at)}</dd><dt>Entry window ends</dt><dd>{etTime(plan.expires_at)}</dd>
    </dl>}
    {v && v.checks.length > 0 && <ul className="tr-checks">{v.checks.map(c =>
      <Check key={c.id} c={{ id: c.id, label: c.label, detail: c.live_only && !c.ok ? `${c.detail} (paper only, not a blocker)` : c.detail, state: c.ok ? 'pass' : c.live_only ? 'pending' : 'fail', value: null, threshold: null }} />)}</ul>}
    {out && <p className="ff-note">Current status: {out.current ? `${STATUS_LABEL[out.current.status] || out.current.status} — ${out.current.reason}` : STATUS_LABEL[out.signal.status] || out.signal.status}. {out.signal.expiry_policy ? `Expiry policy: ${out.signal.expiry_policy}.` : ''}</p>}
  </section>;
}

/** Delivery history: every notification Athena derived, including the ones she didn't send and why. */
function NotificationHistory({ items }: { items: TradingNotification[] }) {
  return <section className="hp-panel ff-wide tr-alerts">
    <header><h2>Notification history</h2><span className="ff-meta">Lapsed and skipped ones are kept with the reason.</span></header>
    {!items.length ? <p className="dashboard-empty">No trading notifications yet.</p> : <ul>{items.map(n => <li key={n.uuid}>
      <span className="tr-dim">{etTime(n.created_at)}</span>
      <span><strong>{n.title || `${EVENT_LABEL[n.event]}${n.symbol ? ` · ${n.symbol}` : ''}`}</strong>
        {n.body && <small>{n.body}</small>}
        <small>{STATE_LABEL[n.state]}{n.mode === 'paper' ? ' · paper' : ''}{n.sent_at ? ` ${etTime(n.sent_at)}` : ''}{n.state_reason ? ` — ${n.state_reason}` : ''}{n.acknowledged_at ? ` · opened ${etTime(n.acknowledged_at)}` : ''}</small>
        {!!n.deliveries?.length && <small>{n.deliveries.map(d => `${d.device || 'device'}: ${d.ok ? 'accepted' : d.reason || 'refused'}`).join(' · ')}</small>}
      </span>
      <span className={`tr-status tr-n-${n.state}`}>{EVENT_LABEL[n.event]}</span>
    </li>)}</ul>}
  </section>;
}

function NotificationSettings({ dash }: { dash: Dashboard }) {
  const [st, setSt] = useState<NotificationsStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState('');
  const browser = useWebPush();
  const load = useCallback(() => tradingApi.notifications().then(s => { setSt(s); setCooldown(String(s.prefs.cooldown_min)); }).catch(e => setMsg(errText(e))), []);
  useEffect(() => { load(); }, [load, browser.state]);
  async function save(patch: Parameters<typeof tradingApi.saveNotificationPrefs>[0]) {
    try { await tradingApi.saveNotificationPrefs(patch); setMsg(null); load(); } catch (x) { setMsg(errText(x)); }
  }
  async function test() {
    setMsg('Sending…');
    try {
      const r = await tradingApi.testNotification();
      setMsg(r.ok ? `Sent to ${r.deliveries?.filter(d => d.ok).map(d => d.device).join(', ') || 'your devices'}.` : `Not delivered: ${r.reason}`);
      load();
    } catch (x) { setMsg(errText(x)); }
  }
  if (!st) return <section className="hp-panel ff-wide"><header><h2>Notifications</h2></header><p className="dashboard-empty">{msg || 'Loading…'}</p></section>;
  const p = st.prefs;
  const validated = dash.strategy?.status === 'validated';
  const live = p.live_strategies.includes(dash.strategy?.key || 'orb_vwap');
  const sw = (key: 'enabled' | 'setup_forming' | 'entry_confirmed' | 'invalidation' | 'paper' | 'risk_limit', label: string, disabled = false) =>
    <label className="tr-toggle"><input type="checkbox" checked={p[key]} disabled={disabled} onChange={e => save({ [key]: e.target.checked })} /> {label}</label>;
  return <section className="hp-panel ff-wide">
    <header><h2>Notifications</h2><span className="ff-meta">Pushed to your phone and browsers, even with Athena closed.</span></header>
    {sw('enabled', 'Enable trading push notifications')}
    {sw('setup_forming', 'Setup-forming alerts (market hours only)', !p.enabled)}
    {sw('entry_confirmed', 'Confirmed-setup alerts', !p.enabled)}
    {sw('invalidation', 'Invalidation and expiry alerts', !p.enabled)}
    {sw('paper', 'Paper-trading alerts (labelled PAPER / EXPERIMENTAL)', !p.enabled)}
    {sw('risk_limit', 'Daily risk-limit alerts', !p.enabled)}
    <label className="tr-toggle"><input type="checkbox" checked={live} disabled={!p.enabled || (!validated && !live)} onChange={e => save({ live_strategy: e.target.checked })} />
      Live alerts for this strategy {validated ? '' : '(needs a validated strategy version; until then every alert is paper)'}</label>
    <div className="tr-form">
      <Field label="Sound"><select value={p.sound} disabled={!p.enabled} onChange={e => save({ sound: e.target.value as 'default' | 'silent' })}><option value="default">Device default</option><option value="silent">Silent (browsers)</option></select></Field>
      <Field label={`Cooldown, minutes (0–${st.cooldown_max_min})`}><input value={cooldown} disabled={!p.enabled} inputMode="numeric" onChange={e => setCooldown(e.target.value)} onBlur={() => Number(cooldown) !== p.cooldown_min && save({ cooldown_min: Number(cooldown) })} /></Field>
      <button type="button" className="hp-link" onClick={test}>Send a test notification</button>
      {msg && <p role="status" className="tr-msg">{msg}</p>}
    </div>
    <p className="ff-note">The cooldown spaces out forming and paper alerts by holding them, then re-checking; confirmed live setups, invalidations and risk limits are never held by it. Quiet hours (Settings → Notifications) hold everything until they end. One alert per setup; a confirmed entry is good for {st.entry_window_min} minutes.</p>
    <h3>Devices</h3>
    {!st.push?.available && <p className="dashboard-empty">Push isn't configured on this server.</p>}
    {st.push && !st.push.enabled && <p className="ff-note">Push notifications are off for your account. <button type="button" className="hp-link" onClick={() => initiativeApi.setPref({ push_enabled: true }).then(load).catch(x => setMsg(errText(x)))}>Allow push notifications</button></p>}
    <ul className="tr-devices">{(st.push?.devices || []).map(d => <li key={d.uuid}>{d.name} <small>{d.platform} · {d.provider}</small></li>)}
      {!st.push?.devices.length && <li className="tr-dim">No phone or browser is subscribed yet.</li>}</ul>
    <p className="hp-sub">This browser: {{ unsupported: 'notifications aren\'t supported here', unconfigured: 'browser push isn\'t configured on the server', denied: 'notifications are blocked — allow them in the browser\'s site settings', off: 'not subscribed', on: 'subscribed', working: 'checking…' }[browser.state]}
      {browser.state === 'off' && <> <button type="button" className="hp-link" onClick={browser.enable}>Subscribe this browser</button></>}
      {browser.state === 'on' && <> <button type="button" className="hp-link" onClick={browser.disable}>Unsubscribe</button></>}</p>
    {browser.error && <p role="alert" className="tr-msg">{browser.error}</p>}
    <p className="ff-note">{st.monitor.configured ? `Watched server-side every ${st.monitor.interval_s}s, ${st.monitor.window}.${st.monitor.last_tick_at ? ` Last check ${etTime(st.monitor.last_tick_at)}.` : ''}` : st.monitor.note}</p>
  </section>;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function Settings({ dash, onChange }: { dash: Dashboard; onChange: () => void }) {
  const st = dash.account.settings;
  const [f, setF] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [cash, setCash] = useState({ kind: 'deposit', amount: '', settles_on: '', note: '' });
  const [rec, setRec] = useState<string | null>(null);
  useEffect(() => setF({
    max_risk_per_trade: String(st.max_risk_per_trade), max_daily_loss: String(st.max_daily_loss), max_trades_per_day: String(st.max_trades_per_day), min_reward_risk: String(st.min_reward_risk),
    slippage_per_share: String(st.costs.slippage_per_share), commission_per_order: String(st.costs.commission_per_order),
  }), [JSON.stringify(st)]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await tradingApi.saveSettings(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])));
      setMsg('Saved.'); onChange();
    } catch (x) { setMsg(errText(x)); }
  }
  async function toggle(key: 'allow_fractional' | 'alerts_enabled', value: boolean) {
    await tradingApi.saveSettings({ [key]: value }).catch(() => {}); onChange();
  }
  async function addCash(e: FormEvent) {
    e.preventDefault();
    try {
      await tradingApi.cash({ kind: cash.kind as 'deposit' | 'withdrawal', amount: Number(cash.amount), settles_on: cash.settles_on || undefined, note: cash.note || undefined });
      setCash({ kind: 'deposit', amount: '', settles_on: '', note: '' }); onChange();
    } catch (x) { setMsg(errText(x)); }
  }
  async function reconcile(apply: boolean) {
    try {
      const r = await tradingApi.reconcile(apply);
      setRec(`Webull ${r.broker.account}: cash ${usd(r.broker.cash)}, settled ${usd(r.broker.settled_cash)} (checked ${etTime(r.broker.checked_at)}). Ledger settled ${usd(r.ledger_settled)}${r.difference === null ? '' : `; difference ${usd(r.difference, true)}`}${r.applied ? ' — adjustment recorded.' : '.'}`);
      onChange();
    } catch (x) { setRec(errText(x)); }
  }
  const c = dash.account.cash;
  return <>
    <section className="hp-panel">
      <header><h2>Risk rules</h2></header>
      <form className="tr-form" onSubmit={save}>
        <Field label="Max risk per trade ($)"><input value={f.max_risk_per_trade || ''} onChange={e => setF({ ...f, max_risk_per_trade: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Max daily loss ($)"><input value={f.max_daily_loss || ''} onChange={e => setF({ ...f, max_daily_loss: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Max trades per day"><input value={f.max_trades_per_day || ''} onChange={e => setF({ ...f, max_trades_per_day: e.target.value })} inputMode="numeric" /></Field>
        <Field label="Minimum reward/risk"><input value={f.min_reward_risk || ''} onChange={e => setF({ ...f, min_reward_risk: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Slippage per share ($)"><input value={f.slippage_per_share || ''} onChange={e => setF({ ...f, slippage_per_share: e.target.value })} inputMode="decimal" /></Field>
        <Field label="Commission per order ($)"><input value={f.commission_per_order || ''} onChange={e => setF({ ...f, commission_per_order: e.target.value })} inputMode="decimal" /></Field>
        <button type="submit" className="hp-link">Save</button>
        {msg && <p role="status" className="tr-msg">{msg}</p>}
      </form>
      <label className="tr-toggle"><input type="checkbox" checked={st.allow_fractional} onChange={e => toggle('allow_fractional', e.target.checked)} /> Allow fractional shares (only if your order type supports them)</label>
      <label className="tr-toggle"><input type="checkbox" checked={st.alerts_enabled} onChange={e => toggle('alerts_enabled', e.target.checked)} /> Show trading alerts</label>
      <p className="ff-note">{st.broker === 'webull' ? 'Webull' : st.broker} {st.account_type} account. Long-only stocks: no margin, options, shorting or overnight holds.</p>
    </section>
    <NotificationSettings dash={dash} />
    <section className="hp-panel">
      <header><h2>Cash</h2></header>
      <dl className="tr-plan">
        <dt>Settled (ledger)</dt><dd>{usd(c.settled)}</dd><dt>Unsettled</dt><dd>{usd(c.unsettled)}</dd>
        {c.pending.map(p => <Fragment key={p.settles_on}><dt>Settles {p.settles_on}</dt><dd>{usd(p.amount)}</dd></Fragment>)}
        <dt>Webull settled</dt><dd>{dash.account.broker.settled_cash === null ? 'not checked' : `${usd(dash.account.broker.settled_cash)} · ${ageText(dash.account.broker.checked_at)}`}</dd>
        <dt>Used for sizing</dt><dd>{usd(c.usable_settled)}</dd>
      </dl>
      <div className="tr-actions"><button type="button" className="hp-link" onClick={() => reconcile(false)}>Check Webull</button><button type="button" className="hp-link" onClick={() => reconcile(true)}>Match ledger to Webull</button></div>
      {rec && <p role="status" className="tr-msg">{rec}</p>}
      <form className="tr-form" onSubmit={addCash}>
        <Field label="Movement"><select value={cash.kind} onChange={e => setCash({ ...cash, kind: e.target.value })}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select></Field>
        <Field label="Amount ($)"><input value={cash.amount} onChange={e => setCash({ ...cash, amount: e.target.value })} inputMode="decimal" required /></Field>
        <Field label="Settles on (deposits)"><input type="date" value={cash.settles_on} onChange={e => setCash({ ...cash, settles_on: e.target.value })} /></Field>
        <Field label="Note"><input value={cash.note} onChange={e => setCash({ ...cash, note: e.target.value })} /></Field>
        <button type="submit" className="hp-link">Record</button>
      </form>
      <p className="ff-note">Sale proceeds settle the next trading day (T+1) and aren't used for sizing until then. Unrealized gains are never counted as cash.</p>
    </section>
    <section className="hp-panel ff-wide">
      <header><h2>Data and strategy</h2></header>
      <p className="hp-sub">Source: Alpaca market data, {dash.data.feed ? dash.data.feed.toUpperCase() : 'not configured'} feed. {dash.data.can_confirm ? 'This feed can confirm entries.' : 'Entries can\'t be confirmed on this feed: the free IEX feed carries a few percent of volume, and the delayed feed is 15 minutes late. A confirmation needs full-market real-time (SIP) data.'}</p>
      {dash.strategy && <p className="hp-sub">Strategy {dash.strategy.key.replace(/_/g, ' ')} v{dash.strategy.version} — {dash.strategy.status === 'validated' ? 'validated' : 'not yet validated: ENTRY CONFIRMED alerts are marked paper until backtests and paper trading support it'}. Parameters hash {dash.strategy.params_hash.slice(0, 12)}.</p>}
      {dash.strategy && <details><summary>Parameters</summary><div className="tr-params">{Object.entries(dash.strategy.params).map(([k, v]) => <span key={k}><code>{k}</code> {Array.isArray(v) ? v.join(', ') : String(v)}</span>)}</div></details>}
    </section>
  </>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function FamilyTrading({ onAsk, tabs }: { onAsk: (text: string) => void; tabs?: ReactNode }) {
  const [view, setView] = useState<View>('desk');
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  // Opened from a push: /family/trading?setup=<signal>&n=<notification>.
  const [opened, setOpened] = useState<{ setup: string; n: string | null } | null>(() => {
    const q = new URLSearchParams(window.location.search);
    const setup = q.get('setup');
    return setup ? { setup, n: q.get('n') } : null;
  });
  useEffect(() => {
    if (opened && window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [opened]);
  useEffect(() => {
    // A tap while this tab is already open: the service worker hands it over.
    const onMessage = (e: MessageEvent) => {
      const d = e.data?.data;
      if (e.data?.type !== 'athena-notification-click' || d?.kind !== 'trading' || typeof d.url !== 'string') return;
      const q = new URL(d.url, window.location.origin).searchParams;
      if (q.get('setup')) { setOpened({ setup: q.get('setup') as string, n: q.get('n') }); setView('desk'); }
      else if (q.get('n')) tradingApi.ackNotification(q.get('n') as string).catch(() => {});
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('n');
    if (n && !opened) {
      tradingApi.ackNotification(n).catch(() => {});
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback((fresh = false) => tradingApi.dashboard(fresh).then(d => { setDash(d); setErr(null); }).catch(e => setErr(errText(e))), []);
  useEffect(() => {
    load();
    // Live while the market is: every 15 s in premarket and the session, every minute otherwise, never while hidden.
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    const fast = dash && (dash.market.phase === 'open' || dash.market.phase === 'premarket');
    const id = window.setInterval(tick, fast ? 15_000 : 60_000);
    return () => window.clearInterval(id);
  }, [load, dash?.market.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected && dash?.watchlist.length) setSelected(dash.watchlist[0].symbol);
  }, [dash, selected]);

  const watching = dash?.watchlist.map(w => `${w.symbol} (${w.signal ? STATUS_LABEL[w.signal.status] : 'not evaluated'})`) || [];
  const take = !dash ? ['Reading the market…']
    : !dash.data.configured ? ['Market data isn\'t connected yet, so I can\'t watch prices. Your journal and settings work in the meantime.']
      : dash.market.phase === 'open' ? [dash.no_trade_reason || `Watching ${watching.join(', ') || 'nothing yet'}.`, `Market ${dash.overview?.assessment.toLowerCase() || 'unclear'}: ${dash.overview?.reasons.join(' ') || ''}`]
        : [`Market ${dash.market.phase}. ${watching.length ? `Today's list: ${watching.join(', ')}.` : ''}`];

  return <div className="hp cp ff tr">
    <PageHeader eyebrow="INTRADAY RESEARCH · YOU DECIDE, YOU EXECUTE" title="Trading" blurb="A disciplined read of the market for a small cash account: what's setting up, what it would risk, and why to act or wait."
      take={{ lines: take, ask: 'What are we watching today, and is there a trade worth taking right now?', onAsk }} />
    {dash && <AccountStrip dash={dash} />}
    {tabs}
    <div className="tr-bar">
      <div className="tr-seg" role="tablist" aria-label="Trading views">{VIEWS.map(v => <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>{v.label}</button>)}</div>
      {dash && <span className="ff-meta">{dash.market.et_time} ET · market {dash.market.phase}{dash.market.session.early_close ? ' · closes 1:00 PM' : ''}{!dash.market.session.calendar_verified ? ' · holiday table ends before today' : ''}</span>}
      {dash && <DataBadge d={dash.data} generated={dash.generated_at} />}
      <button type="button" className="hp-link" onClick={() => load(true)}>Refresh</button>
    </div>
    {err && <p role="alert" className="dashboard-empty">{err}</p>}
    {!dash && !err && <p className="dashboard-empty">Reading the market…</p>}
    {dash && <div className="ff-grid">
      {view === 'desk' && <>
        {!dash.data.configured && <section className="hp-panel ff-wide section-unavailable"><p className="dashboard-empty">{dash.note}</p>
          <p className="source-detail">The owner creates an Alpaca account (a paper account is enough for data) and stores its keys as the ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY secrets. The free plan watches with IEX data; confirming entries needs the full-market SIP feed (Algo Trader Plus).</p></section>}
        {opened && <SetupCheckPanel uuid={opened.setup} notification={opened.n} onClose={() => setOpened(null)} />}
        <Alerts dash={dash} onChange={() => load(true)} />
        <Overview dash={dash} />
        <Watchlist dash={dash} selected={selected} onSelect={setSelected} onChange={() => load(true)} />
        {selected && <Decision symbol={selected} dash={dash} onAsk={onAsk} onRecord={p => { setPrefill(p); setView('journal'); }} />}
      </>}
      {view === 'journal' && <Journal prefill={prefill} onChange={() => load(true)} />}
      {view === 'history' && <History />}
      {view === 'settings' && <Settings dash={dash} onChange={() => load(true)} />}
    </div>}
    <p className="ff-note tr-foot">Research, not advice: statuses are rule-based analytical signals, not predictions or instructions. Athena is not a licensed advisor and never places, changes or cancels orders. Trading can lose money; nothing here promises profit.</p>
  </div>;
}
