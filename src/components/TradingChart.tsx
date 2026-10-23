import { useEffect, useMemo, useRef, useState } from 'react';
import { etTime, type Bar } from '../api/trading';

/**
 * Candlesticks for the Trading desk: closed candles solid, the one still
 * forming drawn hollow and dashed so nobody mistakes it for a finished bar.
 * VWAP as a line, the strategy's levels as labelled rules, volume beneath,
 * and a crosshair that reads out the candle under the pointer. Plain SVG —
 * no charting library.
 */
export interface ChartLevel { label: string; price: number; tone: 'or' | 'vwap' | 'entry' | 'stop' | 'target' | 'resist' | 'pre' }

const H = 320;
const PAD = { l: 8, r: 64, t: 10, b: 22 };
const VOL_H = 54;

export function TradingChart({ bars, vwap, levels, rangeStart, rangeEnd, label }: { bars: Bar[]; vwap?: { t: number; v: number }[]; levels: ChartLevel[]; rangeStart?: number | null; rangeEnd?: number | null; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (!bars.length) return null;
    const prices = bars.flatMap(b => [b.h, b.l]).concat(levels.map(l => l.price)).concat((vwap || []).map(p => p.v)).filter(Number.isFinite);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    const pad = (hi - lo) * 0.06 || hi * 0.002 || 1;
    lo -= pad; hi += pad;
    const plotW = w - PAD.l - PAD.r;
    const priceH = H - PAD.t - PAD.b - VOL_H - 6;
    const step = plotW / bars.length;
    const x = (i: number) => PAD.l + step * (i + 0.5);
    const y = (p: number) => PAD.t + (hi - p) / (hi - lo) * priceH;
    const vmax = Math.max(1, ...bars.map(b => b.v));
    const vy = (v: number) => H - PAD.b - (v / vmax) * VOL_H;
    const index = new Map(bars.map((b, i) => [b.t, i]));
    return { lo, hi, step, x, y, vy, priceH, plotW, index };
  }, [bars, levels, vwap, w]);

  if (!bars.length || !geo) return <div ref={box} className="tc-empty">No candles yet for {label}.</div>;
  const { step, x, y, vy, index } = geo;
  const body = Math.max(1, Math.min(9, step * 0.68));
  const ticks = Array.from({ length: 5 }, (_, i) => geo.lo + (geo.hi - geo.lo) * (i + 0.5) / 5);
  const timeTicks = bars.map((b, i) => ({ b, i })).filter(({ b }) => new Date(b.t).getUTCMinutes() % 30 === 0);
  const vwapPath = (vwap || []).filter(p => index.has(p.t)).map((p, k) => `${k ? 'L' : 'M'}${x(index.get(p.t)!).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const rangeX = rangeEnd ? bars.findIndex(b => b.t >= rangeEnd) : -1;
  const rangeX0 = rangeStart ? Math.max(0, bars.findIndex(b => b.t >= rangeStart)) : 0;
  // Labels of levels a few pixels apart would print on top of each other: push each one clear of the one above.
  const placed: { l: ChartLevel; ly: number }[] = [];
  for (const l of [...levels].sort((a, b) => b.price - a.price)) {
    const prev = placed[placed.length - 1];
    placed.push({ l, ly: prev ? Math.max(y(l.price), prev.ly + 17) : y(l.price) });
  }
  const hb = hover !== null ? bars[hover] : null;

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = (e.clientX - r.left) * (w / r.width);
    const i = Math.floor((px - PAD.l) / step);
    setHover(i >= 0 && i < bars.length ? i : null);
  }

  return <div ref={box} className="tc">
    <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" aria-label={`${label} candlestick chart`} onPointerMove={move} onPointerLeave={() => setHover(null)}>
      {rangeX > rangeX0 && <rect x={x(rangeX0) - step / 2} y={PAD.t} width={x(rangeX) - x(rangeX0)} height={geo.priceH} className="tc-range" />}
      {ticks.map(p => <g key={p}><line x1={PAD.l} x2={w - PAD.r} y1={y(p)} y2={y(p)} className="tc-grid" /><text x={w - PAD.r + 6} y={y(p) + 4} className="tc-axis">{p.toFixed(2)}</text></g>)}
      {timeTicks.map(({ b, i }) => <text key={b.t} x={x(i)} y={H - 6} className="tc-axis" textAnchor="middle">{etTime(b.t).replace(' ET', '')}</text>)}
      {bars.map((b, i) => {
        const up = b.c >= b.o;
        const top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c));
        const cls = `${up ? 'tc-up' : 'tc-down'}${b.forming ? ' tc-forming' : ''}`;
        return <g key={b.t} className={cls}>
          <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} />
          <rect x={x(i) - body / 2} y={top} width={body} height={Math.max(1, bot - top)} />
          <rect x={x(i) - body / 2} y={vy(b.v)} width={body} height={H - PAD.b - vy(b.v)} className="tc-vol" />
        </g>;
      })}
      {vwapPath && <path d={vwapPath} className="tc-vwap" />}
      {placed.map(({ l, ly }) => <g key={`${l.label}-${l.price}`} className={`tc-level tc-${l.tone}`}>
        <line x1={PAD.l} x2={w - PAD.r} y1={y(l.price)} y2={y(l.price)} />
        <rect x={w - PAD.r + 2} y={ly - 8} width={PAD.r - 4} height={16} rx={3} />
        <text x={w - PAD.r + 6} y={ly + 4}>{l.label} {l.price.toFixed(2)}</text>
      </g>)}
      {hb && <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} className="tc-cross" />}
    </svg>
    {hb && <div className="tc-tip" style={{ left: `${Math.min(78, (x(hover!) / w) * 100)}%` }}>
      <strong>{etTime(hb.t)}{hb.forming ? ' · forming' : ''}</strong>
      <span>O {hb.o.toFixed(2)} H {hb.h.toFixed(2)} L {hb.l.toFixed(2)} C {hb.c.toFixed(2)}</span>
      <span>Vol {hb.v.toLocaleString()}</span>
    </div>}
  </div>;
}
