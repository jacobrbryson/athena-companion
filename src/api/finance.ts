import { api } from './client';

/** Webull, read-only (core_api connectors/webull.js via /api/v1/finance/brokerage). Numbers are Webull's own; null where Webull sent none. */
export interface BrokerageBalance {
  currency: string;
  net_value: number | null; market_value: number | null; cash: number | null; settled_cash: number | null;
  buying_power: number | null; day_pl: number | null; open_pl: number | null;
  /** A count, or "UNLIMITED" — the pattern-day-trader allowance. */
  day_trades_left: string | null;
}
export interface BrokeragePosition {
  symbol: string; type: string | null; strategy: string | null; quantity: number | null;
  last_price: number | null; cost_price: number | null; market_value: number | null;
  unrealized_pl: number | null; unrealized_pl_percent: number | null;
  legs: { symbol: string; quantity: number | null; option_type: string; strike: number | null; expires: string | null }[];
}
export interface BrokerageOrder {
  id: string | null; symbol: string; side: string | null; type: string | null; status: string | null;
  quantity: number | null; filled_quantity: number | null; filled_price: number | null;
  limit_price: number | null; stop_price: number | null; time_in_force: string | null;
  placed_at: string | null; filled_at: string | null;
}
export interface BrokerageAccount {
  id: string; label: string; type: string | null; class: string | null; number_tail: string | null;
  balance: BrokerageBalance; positions: BrokeragePosition[]; open_orders: BrokerageOrder[]; recent_orders: BrokerageOrder[];
}
export type Brokerage =
  | { status: 'not_connected' | 'needs_reauth'; accounts: [] }
  | { status: 'ready'; environment: 'production' | 'sandbox'; checked_at: string; accounts: BrokerageAccount[];
      totals: { currency: string; net_value: number | null; market_value: number | null; cash: number | null; buying_power: number | null; day_pl: number | null; open_pl: number | null } | null };

export const financeApi = {
  brokerage: (fresh = false) => api.get<Brokerage>(`/api/v1/finance/brokerage${fresh ? '?fresh=1' : ''}`),
};

export function formatBrokerageMoney(value: number | null | undefined, currency = 'USD', signed = false) {
  if (value === null || value === undefined) return '—';
  const text = Math.abs(value).toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `−${text}` : signed && value > 0 ? `+${text}` : text;
}
