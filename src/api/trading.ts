import { api } from './client';

/**
 * Family → Trading (core_api services/trading via /api/v1/trading). Analysis
 * and records only — nothing here can place an order. Every price carries the
 * time it was observed; null means the source sent none, never a guess.
 */
export type SignalStatus = 'WATCH' | 'SETUP_FORMING' | 'ENTRY_CONFIRMED' | 'WAIT' | 'AVOID' | 'EXIT_INVALIDATED';
export type ConditionState = 'pass' | 'fail' | 'pending';

export interface Condition { id: string; label: string; state: ConditionState; detail: string; value: number | null; threshold: number | null }
export interface Sizing {
  ok: boolean; reasons: string[]; shares: number; limited_by?: 'risk' | 'cash';
  entry?: number; stop?: number; target?: number; risk_per_share: number | null;
  position_cost?: number; planned_loss?: number; est_loss_with_costs?: number; planned_gain?: number; est_gain_with_costs?: number; est_fees?: number;
  reward_risk?: number; room_to_resistance_r?: number | null; loss_pct_of_account?: number | null; gain_pct_of_account?: number | null;
}
export interface SignalData { feed: string; feed_can_confirm: boolean; last_bar_at: string | null; bar_age_s: number | null; quote_at: string | null; quote_age_s: number | null; quote_modelled: boolean; stale: boolean; problems: string[] }
export interface Signal {
  status: SignalStatus; reason: string; next_step?: string; evaluated_at?: string;
  conditions?: Condition[]; indicators?: Record<string, number | null | unknown>; levels?: Record<string, number>;
  sizing?: Sizing | null; data?: SignalData; confirmed?: { entry: number; stop: number; target: number; at: string } | null;
}
export interface NewsItem { headline: string; source: string | null; at?: string; created_at?: string; url: string | null }
export interface WatchRow {
  symbol: string; company_name: string | null; rank: number | null; score: number | null; reasons: string[]; source: 'scanner' | 'manual'; pinned: boolean;
  price: number | null; price_at: string | null; change: number | null;
  catalyst: { headline: string; source: string | null; at: string; url: string | null } | null; news: NewsItem[];
  signal: Signal | null; signal_uuid: string | null;
}
export interface IndexLeg { symbol: string; price: number | null; price_at: string | null; change: number | null; change_from_open: number | null; vwap: number | null; above_vwap: boolean | null; spark: number[]; note?: string }
export interface Overview {
  spy: IndexLeg; qqq: IndexLeg; volatility: IndexLeg; sectors: { symbol: string; name: string; change: number | null; above_vwap: boolean | null }[];
  breadth: { above_vwap: number; of: number; basis: string } | null;
  regime: 'bullish' | 'bearish' | 'mixed' | 'uncertain'; assessment: 'FAVORABLE' | 'CAUTION' | 'UNFAVORABLE'; reasons: string[];
}
export interface Position {
  id: number; uuid: string; mode: 'live' | 'paper'; symbol: string; setup_type: string; shares: number; entry_price: number; entry_at: string;
  planned_entry: number | null; planned_stop: number; planned_target: number | null; entry_fees: number; exit_price: number | null; exit_at: string | null;
  exit_fees: number | null; exit_reason: string | null; status: 'open' | 'closed'; unsettled_funds_used: number; funds_settle_on: string | null; regime_at_entry: string | null;
  conditions_at_entry: { status: string; at: string; conditions: Condition[] } | Condition[] | null;
  journal: { realized_pl: number; fees: number; planned_risk: number; realized_risk: number | null; r_multiple: number | null; entry_slippage: number | null; followed_plan: boolean | null; notes: string | null; chart_snapshot: { feed: string; bars: number[][] } | null } | null;
}
export interface AccountView {
  settings: { broker: string; account_type: string; starting_capital: number; max_risk_per_trade: number; max_daily_loss: number; max_trades_per_day: number; min_reward_risk: number; allow_fractional: boolean; alerts_enabled: boolean;
    costs: { commission_per_order: number; sec_fee_rate: number; taf_fee_per_share: number; slippage_per_share: number } };
  cash: { settled: number; unsettled: number; total: number; pending: { settles_on: string; amount: number }[]; usable_settled: number; broker_settled_today: number | null; ledger_vs_broker: number | null };
  today: { trades: number; realized_pl: number; open_planned_risk: number; risk_budget: number; daily_loss_left: number };
  broker: { cash: number | null; settled_cash: number | null; checked_at: string | null };
  open_positions: Position[];
}
export interface TradingAlert { id: number; kind: string; symbol: string | null; title: string; body: string; validated: boolean; delivery_state: string; created_at: string }
export interface MarketEvent { date: string; time: string; name: string; impact: string; at: string; source: string }
export interface Dashboard {
  generated_at: string;
  market: { phase: 'closed' | 'premarket' | 'open' | 'afterhours'; et_date: string; et_time: string; session: { trading: boolean; early_close: boolean; calendar_verified: boolean; open_at: string | null; close_at: string | null } };
  data: { source: string; configured: boolean; feed: 'iex' | 'sip' | 'delayed_sip' | null; can_confirm: boolean; realtime: boolean; delayed: boolean; stream: { status: string; last_message_at: string | null } };
  account: AccountView;
  events: { today: MarketEvent[]; coverage: string };
  strategy?: { key: string; version: number; status: string; params_hash: string; params: Record<string, unknown> };
  overview: Overview | null;
  watchlist: WatchRow[];
  scan?: { considered: number; skipped: number; scanned_at: string; source_partial: boolean } | null;
  no_trade_reason?: string | null;
  note?: string;
  alerts: TradingAlert[];
}
export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number; vw?: number | null; forming?: boolean }
export interface SymbolDetail { symbol: string; row: WatchRow | null; bars_1m: Bar[]; bars_5m: Bar[]; vwap_1m?: { t: number; v: number }[]; data: Dashboard['data'] }
export interface Stats { trades: number; wins: number; losses: number; net_pl: number; fees: number; win_rate: number | null; avg_win: number | null; avg_loss: number | null; profit_factor: number | null; max_drawdown: number; avg_r: number | null; expectancy: number | null; rule_compliance: number | null; judged: number }
export interface Performance {
  mode: 'live' | 'paper'; period: string; from: string; to: string; overall: Stats;
  by_setup: (Stats & { key: string })[]; by_regime: (Stats & { key: string })[];
  equity: { at: string; equity: number; pl: number }[]; days: { date: string; pl: number; trades: number }[];
  signals: { total: number; confirmed: number; measured: number; confirmed_target_first: number; confirmed_stop_first: number; rejected_measured: number; rejected_would_have_won: number; note: string };
}
export interface SignalRow { uuid: string; session_date: string; symbol: string; strategy_version: number | null; feed: string; initial_status: SignalStatus; initial_at: string; status: SignalStatus; ever_confirmed: boolean; outcome: string | null; outcome_r: number | null }
export interface Replay {
  signal: SignalRow & { params_hash: string; events: { seq: number; evaluated_at: string; from_status: string | null; to_status: SignalStatus; reason: string; conditions: Condition[]; levels: Record<string, number> | null; sizing: Sizing | null; indicators: Record<string, unknown> }[] };
  session: { open_at: string | null; close_at: string | null };
  frames: { seq: number; as_of: string; candle_count: number }[];
  candles: Bar[];
}

export const tradingApi = {
  dashboard: (fresh = false) => api.get<Dashboard>(`/api/v1/trading/dashboard${fresh ? '?fresh=1' : ''}`),
  symbol: (symbol: string) => api.get<SymbolDetail>(`/api/v1/trading/symbol/${encodeURIComponent(symbol)}`),
  watch: (symbol: string) => api.post<{ ok: true }>('/api/v1/trading/watchlist', { symbol }),
  unwatch: (symbol: string) => api.del<{ ok: true }>(`/api/v1/trading/watchlist/${encodeURIComponent(symbol)}`),
  saveSettings: (patch: Record<string, number | boolean>) => api.put<{ account: unknown }>('/api/v1/trading/account', patch),
  cash: (body: { kind: 'deposit' | 'withdrawal'; amount: number; settles_on?: string; note?: string }) => api.post<{ ok: true }>('/api/v1/trading/cash', body),
  reconcile: (apply = false) => api.post<{ broker: { cash: number | null; settled_cash: number | null; buying_power: number | null; checked_at: string; account: string }; ledger_settled: number; difference: number | null; applied: boolean }>('/api/v1/trading/reconcile', { apply }),
  positions: (mode: 'live' | 'paper') => api.get<{ positions: Position[] }>(`/api/v1/trading/positions?mode=${mode}`),
  enter: (body: Record<string, unknown>) => api.post<{ position: Position; warnings: string[] }>('/api/v1/trading/positions', body),
  exit: (uuid: string, body: Record<string, unknown>) => api.post<{ position: Position; warnings: string[] }>(`/api/v1/trading/positions/${uuid}/close`, body),
  journal: (uuid: string, body: { followed_plan?: boolean | null; notes?: string }) => api.patch<{ position: Position }>(`/api/v1/trading/positions/${uuid}/journal`, body),
  performance: (mode: 'live' | 'paper', period: 'day' | 'week' | 'month' | 'all') => api.get<Performance>(`/api/v1/trading/performance?mode=${mode}&period=${period}`),
  signals: () => api.get<{ signals: SignalRow[] }>('/api/v1/trading/signals'),
  replay: (uuid: string) => api.get<Replay>(`/api/v1/trading/signals/${uuid}/replay`),
  seen: (ids: number[]) => api.post<{ ok: true }>('/api/v1/trading/alerts/seen', { ids }),
  dismiss: (id: number) => api.post<{ ok: true }>(`/api/v1/trading/alerts/${id}/dismiss`),
};

export const STATUS_LABEL: Record<SignalStatus, string> = {
  WATCH: 'Watch', SETUP_FORMING: 'Setup forming', ENTRY_CONFIRMED: 'Entry confirmed', WAIT: 'Wait', AVOID: 'Avoid', EXIT_INVALIDATED: 'Exit / invalidated',
};

export const usd = (v: number | null | undefined, signed = false) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const t = `$${Math.abs(v).toFixed(2)}`;
  return v < 0 ? `−${t}` : signed && v > 0 ? `+${t}` : t;
};
export const pctText = (v: number | null | undefined, dp = 2) => v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(dp)}%`;
/** "10:02 AM ET" — market times are always shown in New York time. */
export const etTime = (iso: string | number | null | undefined) => iso === null || iso === undefined ? '—' : `${new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`;
export const ageText = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return 'no data';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
