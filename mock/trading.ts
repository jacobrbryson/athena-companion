/**
 * DEV-ONLY illustrative data for Family → Trading under `npm run dev:mock`.
 * Shapes match core_api services/trading; the numbers are made up for the
 * layout and never reach a real build (vite.mock.config.ts only).
 */
const M = 60_000;

function etOpen(): number {
  // 9:30 ET today, assuming EDT for the mock.
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 13, 30);
}

function bars(seed: number, base: number, n = 120) {
  const open = etOpen();
  let p = base;
  const out = [];
  for (let i = -20; i < n; i++) {
    const drift = Math.sin((i + seed) / 9) * 0.0015 + (i > 18 && i < 40 ? 0.0012 : 0.0002) * (seed % 2 ? 1 : -1);
    const o = p;
    const c = +(p * (1 + drift + (Math.sin(i * 7.3 + seed) * 0.0009))).toFixed(2);
    out.push({ t: open + i * M, o: +o.toFixed(2), h: +(Math.max(o, c) * 1.0012).toFixed(2), l: +(Math.min(o, c) * 0.9988).toFixed(2), c, v: Math.round((i < 15 ? 60_000 : 25_000) * (1 + Math.abs(Math.sin(i + seed)))), ...(i === n - 1 ? { forming: true } : {}) });
    p = c;
  }
  return out;
}

const cond = (id: string, label: string, state: 'pass' | 'fail' | 'pending', detail: string) => ({ id, label, state, detail, value: null, threshold: null });

function rows(now: number) {
  const at = new Date(now - 4_000).toISOString();
  const data = { feed: 'iex', feed_can_confirm: false, last_bar_at: new Date(now - 62_000).toISOString(), bar_age_s: 2, quote_at: at, quote_age_s: 4, quote_modelled: false, stale: false, problems: [] };
  return [
    {
      symbol: 'INTC', company_name: 'Intel Corporation', rank: 1, score: 6.2, source: 'scanner', pinned: false, reasons: ['volume pace 2.4× a typical day so far', 'gapped 4.1% vs prior close', 'below VWAP', 'news in the last day'],
      price: 24.18, price_at: at, change: 0.031, catalyst: { headline: 'Intel wins foundry customer for 18A process', source: 'benzinga', at: new Date(now - 3 * 3600_000).toISOString(), url: null }, news: [], signal_uuid: 'mock-sig-1',
      signal: {
        status: 'WAIT', reason: 'Below VWAP $24.31; buyers don\'t have control.', next_step: 'Needs a close back above VWAP $24.31 and a higher low.', evaluated_at: at, data,
        indicators: { price: 24.18, vwap: 24.31, relative_volume: 2.4, atr_1m: 0.06, spread: 0.01 }, levels: { or_high: 24.62, or_low: 24.05, vwap: 24.31, premarket_high: 24.7 },
        conditions: [cond('above_vwap', 'Price above VWAP', 'fail', 'Last close $24.18 vs VWAP $24.31.'), cond('vwap_rising', 'VWAP flat to rising', 'fail', 'VWAP moved -0.120% over 10 min.'), cond('higher_lows', 'Higher lows', 'fail', 'Swing lows $24.12 → $24.08.'), cond('breakout', 'Closed above opening-range high', 'pending', 'No closed candle above $24.62 yet.'), cond('retest_hold', 'Pullback held the breakout level', 'pending', 'Needs a breakout first.'), cond('volume', 'Volume confirms', 'pass', 'Relative volume 2.40× so far.'), cond('spread', 'Spread acceptable', 'pass', '$0.01 (0.041% of price).'), cond('risk_budget', 'Stop fits the risk budget', 'pending', 'Needs a structural stop.'), cond('reward_risk', 'Reward/risk at least 2:1', 'pending', 'Needs entry and stop.'), cond('event_data', 'No event or data issue', 'fail', 'The IEX feed can watch but not confirm (allowed: sip).')],
        sizing: null,
      },
    },
    {
      symbol: 'SOFI', company_name: 'SoFi Technologies', rank: 2, score: 5.1, source: 'scanner', pinned: false, reasons: ['volume pace 1.9× a typical day so far', 'gapped 2.2% vs prior close', 'outperforming SPY by 2.6 pts', 'above VWAP'],
      price: 15.42, price_at: at, change: 0.029, catalyst: null, news: [], signal_uuid: 'mock-sig-2',
      signal: {
        status: 'SETUP_FORMING', reason: 'Broke $15.35 at 10:04 AM.', next_step: 'Still needed: pullback held the breakout level, event or data issue.', evaluated_at: at, data,
        indicators: { price: 15.42, vwap: 15.21, relative_volume: 1.9, atr_1m: 0.03, spread: 0.01 }, levels: { or_high: 15.35, or_low: 15.08, vwap: 15.21, stop: 15.27, target: 15.74 },
        conditions: [cond('above_vwap', 'Price above VWAP', 'pass', 'Last close $15.42 vs VWAP $15.21.'), cond('vwap_rising', 'VWAP flat to rising', 'pass', 'VWAP moved +0.090% over 10 min.'), cond('higher_lows', 'Higher lows', 'pass', 'Swing lows $15.18 → $15.27.'), cond('breakout', 'Closed above opening-range high', 'pass', '10:04 AM candle closed $15.39 above $15.35.'), cond('retest_hold', 'Pullback held the breakout level', 'pending', 'Waiting for a pullback toward $15.35 that holds.'), cond('volume', 'Volume confirms', 'pass', 'Relative volume 1.90× (need 1.5×); breakout candle 1.60× the average candle (need 1.2×).'), cond('spread', 'Spread acceptable', 'pass', '$0.01 (0.065% of price).'), cond('risk_budget', 'Stop fits the risk budget', 'pass', '24 shares, stop $15.27 ($0.16/share), about $3.98 at risk with costs.'), cond('reward_risk', 'Reward/risk at least 2:1', 'pass', 'Target $15.74 (2R); no resistance overhead in view.'), cond('event_data', 'No event or data issue', 'fail', 'The IEX feed can watch but not confirm (allowed: sip).')],
        sizing: { ok: true, reasons: [], shares: 24, limited_by: 'risk', entry: 15.43, stop: 15.27, target: 15.75, risk_per_share: 0.16, position_cost: 370.32, planned_loss: 3.84, est_loss_with_costs: 3.99, planned_gain: 7.68, est_gain_with_costs: 7.19, est_fees: 0.01, reward_risk: 2, room_to_resistance_r: null, loss_pct_of_account: 0.94, gain_pct_of_account: 1.7 },
      },
    },
    {
      symbol: 'F', company_name: 'Ford Motor Company', rank: 3, score: 3.4, source: 'scanner', pinned: false, reasons: ['volume pace 1.6× a typical day so far', 'gapped 1.3% vs prior close', 'above VWAP'],
      price: 11.02, price_at: at, change: 0.014, catalyst: null, news: [], signal_uuid: null,
      signal: { status: 'WATCH', reason: 'Above VWAP, below the range high $11.10.', next_step: 'Needs a closed candle above $11.10.', evaluated_at: at, data, indicators: { price: 11.02, vwap: 10.97, relative_volume: 1.6 }, levels: { or_high: 11.1, or_low: 10.9 }, conditions: [], sizing: null },
    },
  ];
}

export function mockTrading(method: string, p: string): unknown {
  if (!p.startsWith('/api/v1/trading')) return undefined;
  const now = Date.now();
  const open = etOpen();
  if (p === '/api/v1/trading/dashboard') {
    const leg = (symbol: string, price: number, change: number, above: boolean, vwap: number) => ({ symbol, price, price_at: new Date(now - 3000).toISOString(), change, change_from_open: change / 2, vwap, above_vwap: above, spark: [] });
    return {
      generated_at: new Date(now).toISOString(),
      market: { phase: 'open', et_date: new Date().toISOString().slice(0, 10), et_time: '10:12 AM', session: { trading: true, early_close: false, calendar_verified: true, open_at: new Date(open).toISOString(), close_at: new Date(open + 390 * M).toISOString() } },
      data: { source: 'alpaca', configured: true, feed: 'iex', can_confirm: false, realtime: true, delayed: false, stream: { status: 'live', last_message_at: new Date(now - 1000).toISOString() } },
      account: {
        settings: { broker: 'webull', account_type: 'cash', starting_capital: 423, max_risk_per_trade: 4, max_daily_loss: 8, max_trades_per_day: 2, min_reward_risk: 2, allow_fractional: false, alerts_enabled: true, costs: { commission_per_order: 0, sec_fee_rate: 0.0000278, taf_fee_per_share: 0.000166, slippage_per_share: 0.01 } },
        cash: { settled: 423, unsettled: 0, total: 423, pending: [], usable_settled: 423, broker_settled_today: 423, ledger_vs_broker: 0 },
        today: { trades: 0, realized_pl: 0, open_planned_risk: 0, risk_budget: 4, daily_loss_left: 8 },
        broker: { cash: 423, settled_cash: 423, checked_at: new Date(now - 3600_000).toISOString() }, open_positions: [],
      },
      events: { today: [], coverage: 'FOMC decisions built in; CPI, jobs and earnings dates only if added to the owner\'s event list' },
      strategy: { key: 'orb_vwap', version: 1, status: 'paper', params_hash: 'a3f9c2e1b7d40000', params: { openingRangeMinutes: 15, minRelativeVolume: 1.5, maxSpreadPct: 0.002, confirmFeeds: ['sip'] } },
      overview: {
        spy: leg('SPY', 671.2, 0.0042, true, 670.4), qqq: leg('QQQ', 601.8, 0.0061, true, 600.2), volatility: { ...leg('VIXY', 38.1, -0.021, false, 38.4), note: 'VIXY' },
        sectors: [{ symbol: 'XLK', name: 'Technology', change: 0.009, above_vwap: true }, { symbol: 'XLF', name: 'Financials', change: 0.004, above_vwap: true }, { symbol: 'XLE', name: 'Energy', change: -0.006, above_vwap: false }, { symbol: 'XLV', name: 'Health care', change: 0.001, above_vwap: true }],
        breadth: { above_vwap: 8, of: 11, basis: 'sector ETFs above their VWAP' }, regime: 'bullish', assessment: 'FAVORABLE', reasons: ['SPY above VWAP, QQQ above VWAP.'],
      },
      watchlist: rows(now), scan: { considered: 9, skipped: 41, scanned_at: new Date(now - 8 * M).toISOString(), source_partial: false }, no_trade_reason: null,
      alerts: [{ id: 1, kind: 'approaching', symbol: 'SOFI', title: 'SOFI setup forming', body: 'Broke $15.35 at 10:04 AM. Still needed: pullback held the breakout level.', validated: false, delivery_state: 'pending', created_at: new Date(now - 6 * M).toISOString() }],
    };
  }
  const sym = p.match(/^\/api\/v1\/trading\/symbol\/([A-Z]+)/)?.[1];
  if (sym) {
    const b = bars(sym.length * 3, sym === 'INTC' ? 24.4 : sym === 'SOFI' ? 15.1 : 11);
    let pv = 0, vol = 0;
    const vw = b.filter(x => x.t >= open && !x.forming).map(x => { pv += x.c * x.v; vol += x.v; return { t: x.t, v: +(pv / vol).toFixed(3) }; });
    const five: typeof b = [];
    for (let i = 20; i + 5 <= b.length - 1; i += 5) { const s = b.slice(i, i + 5); five.push({ t: s[0].t, o: s[0].o, h: Math.max(...s.map(x => x.h)), l: Math.min(...s.map(x => x.l)), c: s[4].c, v: s.reduce((a, x) => a + x.v, 0) }); }
    return { symbol: sym, row: null, bars_1m: b, bars_5m: five, vwap_1m: vw, data: { configured: true, feed: 'iex' } };
  }
  if (p === '/api/v1/trading/positions') return { positions: [] };
  if (p === '/api/v1/trading/signals') return { signals: [{ uuid: 'mock-sig-1', session_date: new Date().toISOString().slice(0, 10), symbol: 'INTC', strategy_version: 1, feed: 'iex', initial_status: 'WATCH', initial_at: new Date(now - 30 * M).toISOString(), status: 'WAIT', ever_confirmed: false, outcome: null, outcome_r: null }] };
  if (p === '/api/v1/trading/performance') return {
    mode: 'live', period: 'month', from: '', to: '', overall: { trades: 0, wins: 0, losses: 0, net_pl: 0, fees: 0, win_rate: null, avg_win: null, avg_loss: null, profit_factor: null, max_drawdown: 0, avg_r: null, expectancy: null, rule_compliance: null, judged: 0 },
    by_setup: [], by_regime: [], equity: [], days: [], summaries: [],
    signals: { total: 6, confirmed: 0, measured: 4, confirmed_target_first: 0, confirmed_stop_first: 0, rejected_measured: 4, rejected_would_have_won: 1, note: 'Outcomes of rejected setups are hypothetical.' },
  };
  if (method !== 'GET') return { ok: true, warnings: [] };
  return undefined;
}
