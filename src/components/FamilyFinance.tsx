import { useEffect, useState } from 'react';
import { financeApi, type Brokerage, type BrokerageAccount, type BrokerageOrder } from '../api/finance';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import './familyFinance.css';

/**
 * Family → Finance (2026-10-20): the signed-in adult's own Webull accounts,
 * read-only — balances, positions, open and recent orders. Nothing here can
 * trade. Numbers are Webull's; a blank is a figure Webull didn't send, never
 * a guess. See core_api docs/capabilities/webull.md.
 */
const usd = (v: number | null | undefined, currency = 'USD', signed = false) => {
  if (v === null || v === undefined) return '—';
  const text = Math.abs(v).toLocaleString(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `−${text}` : signed && v > 0 ? `+${text}` : text;
};
const tone = (v: number | null | undefined) => v === null || v === undefined || v === 0 ? '' : v > 0 ? 'ff-up' : 'ff-down';
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
const qty = (n: number | null) => n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 4 });

function useBrokerage() {
  const [state, setState] = useState<{ data: Brokerage | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    financeApi.brokerage(fresh > 0).then(data => { if (alive) setState({ data, loading: false, error: null }); })
      .catch(e => { if (alive) setState(s => ({ data: s.data, loading: false, error: (e as Error).message || 'Unavailable' })); });
    return () => { alive = false; };
  }, [fresh]);
  return { ...state, refresh: () => setFresh(n => n + 1) };
}

function OrdersTable({ orders, empty }: { orders: BrokerageOrder[]; empty: string }) {
  if (!orders.length) return <p className="dashboard-empty">{empty}</p>;
  return <div className="ff-table-wrap"><table className="ff-table">
    <thead><tr><th>Placed</th><th>Symbol</th><th>Side</th><th>Type</th><th className="ff-num">Qty</th><th className="ff-num">Price</th><th>Status</th></tr></thead>
    <tbody>{orders.map((o, i) => <tr key={o.id || i}>
      <td className="ff-num ff-left" title={o.placed_at ? new Date(o.placed_at).toLocaleString() : undefined}>{day(o.placed_at)}</td><td><strong>{o.symbol}</strong></td>
      <td className={o.side === 'BUY' ? 'ff-up' : o.side === 'SELL' ? 'ff-down' : ''}>{o.side || '—'}</td>
      <td>{o.type?.toLowerCase().replace(/_/g, ' ') || '—'}</td>
      <td className="ff-num">{o.filled_quantity && o.quantity && o.filled_quantity !== o.quantity ? `${qty(o.filled_quantity)}/${qty(o.quantity)}` : qty(o.quantity)}</td>
      <td className="ff-num">{usd(o.filled_price ?? o.limit_price ?? o.stop_price)}</td>
      <td><span className="ff-chip">{o.status?.toLowerCase().replace(/_/g, ' ') || '—'}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

function AccountPanels({ account }: { account: BrokerageAccount }) {
  const b = account.balance;
  const name = `${account.label}${account.number_tail ? ` ····${account.number_tail}` : ''}`;
  return <>
    <section className="hp-panel ff-wide">
      <header><h2>Positions <span>{name}</span></h2><small className="ff-meta">Cash {usd(b.cash, b.currency)} · Buying power {usd(b.buying_power, b.currency)} · Day trades left {b.day_trades_left ?? '—'}</small></header>
      {account.positions.length ? <div className="ff-table-wrap"><table className="ff-table">
        <thead><tr><th>Symbol</th><th className="ff-num">Qty</th><th className="ff-num">Last</th><th className="ff-num">Cost</th><th className="ff-num">Value</th><th className="ff-num">Unrealized</th></tr></thead>
        <tbody>{account.positions.map((p, i) => <tr key={`${p.symbol}-${i}`}>
          <td><strong>{p.symbol}</strong>{p.type && p.type !== 'STOCK' && <small> {p.strategy?.toLowerCase().replace(/_/g, ' ') || p.type.toLowerCase()}</small>}
            {p.legs.length > 0 && <small className="ff-legs">{p.legs.map(l => `${l.option_type} ${l.strike ?? '?'} ${l.expires ?? ''}`).join(' · ')}</small>}</td>
          <td className="ff-num">{qty(p.quantity)}</td><td className="ff-num">{usd(p.last_price)}</td><td className="ff-num">{usd(p.cost_price)}</td>
          <td className="ff-num">{usd(p.market_value)}</td>
          <td className={`ff-num ${tone(p.unrealized_pl)}`}>{usd(p.unrealized_pl, 'USD', true)}{p.unrealized_pl_percent !== null && <small> {p.unrealized_pl_percent > 0 ? '+' : ''}{p.unrealized_pl_percent}%</small>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="dashboard-empty">No positions in this account.</p>}
    </section>
    <section className="hp-panel">
      <header><h2>Open orders <span>{name}</span></h2></header>
      <OrdersTable orders={account.open_orders} empty="No open orders." />
    </section>
    <section className="hp-panel">
      <header><h2>Last 30 days <span>{name}</span></h2></header>
      <OrdersTable orders={account.recent_orders.slice(0, 15)} empty="No orders in the last 30 days." />
    </section>
  </>;
}

export function FamilyFinance({ onAsk }: { onAsk: (text: string) => void }) {
  const { data, loading, error, refresh } = useBrokerage();
  const ready = data?.status === 'ready' ? data : null;
  const t = ready?.totals;
  const currency = t?.currency || 'USD';
  const take = !ready ? ['Link a Webull account and I can keep an eye on balances, positions and orders with you.']
    : t ? [`Your Webull accounts are worth ${usd(t.net_value, currency)}, ${t.day_pl !== null ? `${t.day_pl >= 0 ? 'up' : 'down'} ${usd(Math.abs(t.day_pl), currency)} today` : 'with no change reported today'}.`]
      : ['Your accounts are in different currencies, so I list them one by one.'];
  return <div className="hp cp ff">
    <PageHeader eyebrow="WHAT THE FAMILY HAS PUT AWAY" title="Finance" blurb="Your brokerage accounts — balances, holdings and orders, read-only."
      take={{ lines: take, ask: 'Look at my Webull portfolio with me. What changed recently and what stands out?', onAsk }} />

    {ready && <section className="cp-stats" aria-label="Your accounts at a glance">
      <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-blue"><Icon name="shield" /></span>
        <div><span>Net value</span><strong>{usd(t?.net_value, currency)}</strong><small>{ready.accounts.length} account{ready.accounts.length === 1 ? '' : 's'}{ready.environment === 'sandbox' ? ' · sandbox' : ''}</small></div></div>
      <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-green"><Icon name="up" /></span>
        <div><span>Today</span><strong className={tone(t?.day_pl)}>{usd(t?.day_pl, currency, true)}</strong><small>Day's P&amp;L</small></div></div>
      <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-blue"><Icon name="bolt" /></span>
        <div><span>Open P&amp;L</span><strong className={tone(t?.open_pl)}>{usd(t?.open_pl, currency, true)}</strong><small>Unrealized, all positions</small></div></div>
      <div className="hp-tile cp-stat"><span className="hp-badge hp-badge-lg hp-green"><Icon name="check" /></span>
        <div><span>Buying power</span><strong>{usd(t?.buying_power, currency)}</strong><small>Cash {usd(t?.cash, currency)}</small></div></div>
    </section>}

    <div className="ff-grid">
      <section className="hp-panel ff-wide ff-status">
        <header><h2>Webull</h2>
          {ready && <small className="ff-meta">Checked {when(ready.checked_at)}</small>}
          <button type="button" className="hp-link" onClick={refresh} disabled={loading}>{loading ? 'Reading…' : 'Refresh'}</button></header>
        {error && <p role="alert" className="dashboard-empty">{error}</p>}
        {!data && loading && <p className="dashboard-empty">Reading your Webull accounts…</p>}
        {data?.status === 'not_connected' && <div className="section-unavailable"><p className="dashboard-empty">No Webull account is linked.</p>
          <p className="source-detail">Webull doesn't offer a sign-in link for personal accounts. The owner applies for API access at developer.webull.com, generates an App Key and Secret, and runs <code>scripts/addWebullLogin.js</code> once.</p></div>}
        {data?.status === 'needs_reauth' && <div className="section-unavailable"><p className="dashboard-empty">Webull needs re-linking.</p>
          <p className="source-detail">The saved key was refused or its approval token lapsed (Webull ends it after 15 days without use). Re-running the link script fixes it.</p></div>}
        {ready && !ready.accounts.length && <p className="dashboard-empty">The linked key lists no brokerage accounts.</p>}
        {ready && ready.accounts.length > 0 && <ul className="ff-accounts">{ready.accounts.map(a => <li key={a.id}>
          <strong>{a.label}{a.number_tail && <small> ····{a.number_tail}</small>}</strong>
          <span>{usd(a.balance.net_value, a.balance.currency)}</span>
          <small className={tone(a.balance.day_pl)}>{usd(a.balance.day_pl, a.balance.currency, true)} today</small>
        </li>)}</ul>}
        <p className="ff-note">Read-only. Athena can't buy, sell or cancel anything here.</p>
      </section>
      {ready?.accounts.map(a => <AccountPanels key={a.id} account={a} />)}
    </div>
  </div>;
}
