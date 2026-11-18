import type { ReactNode } from 'react';
import type { RosterRow } from './familyRoster';
import { ContactAvatar } from './Community';
import { CardHeader } from './YourDay';
import './dayTasks.css';

/**
 * Home's Health & Performance and Family cards (owner mockup, 2026-11-17), in
 * the same family as Your Day, Tasks, Work and Projects. Every number is one
 * the dashboard already reads; nothing is filled in for looks.
 */

const svg = (art: ReactNode, className?: string) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art}</svg>;
const HEART = <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />;
const PULSE = <path d="M3 12h4l2-5 4 10 2-5h6" />;
const MOON = <path d="M19.5 14.5A7.8 7.8 0 1 1 9.5 4.5a6.2 6.2 0 0 0 10 10Z" />;
const BED = <><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="11" r="1.6" /></>;
const SCALE = <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.2-1.6" /></>;
const TARGET = <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.6" /></>;
const RUN = <><circle cx="14.5" cy="4.5" r="1.7" /><path d="m8 21 3-6 3 2.5V22M6 11.5l3-3 4 .5 2.5 3.5 3 1" /><path d="m11 15 1.5-6" /></>;
const PEOPLE = <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c0-3.2 2.5-5.4 5.5-5.4s5.5 2.2 5.5 5.4M14.5 14c3 0 6 1.6 6 5" /></>;
const CAL = <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3v4M15.5 3v4M8 14h2M14 14h2M8 17h2" /></>;
const CART = <><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>;
const ALERT = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2h.01" /></>;
const THERMO = <><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z" /><path d="M12 9v6" /></>;
const CAKE = <><path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7ZM4 15.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M12 11V8" /></>;
const CHEVRON = <path d="m9.5 6 6 6-6 6" />;

// --- Health & Performance ----------------------------------------------------

type Better = 'lower' | 'higher' | 'flat';
export interface HealthTrend { direction: 'up' | 'down' | 'steady'; delta: number }
export interface HealthTile {
  key: 'rhr' | 'hrv' | 'sleep' | 'weight'; label: string;
  /** Already formatted ("65", "7h 17m"); null when there's no reading. */
  value: string | null; unit: string;
  trend: HealthTrend | null; better: Better; decimals: number; deltaUnit: string;
  /** Oldest first; null where a day has no reading. */
  bars: (number | null)[];
}

const TILE_ICON: Record<HealthTile['key'], ReactNode> = { rhr: HEART, hrv: PULSE, sleep: BED, weight: SCALE };

/** Green when it moved the way that's better for you, amber when it didn't, plain when it's flat or either is fine. */
function trendTone(t: HealthTrend | null, better: Better) {
  if (!t || t.direction === 'steady' || better === 'flat') return 'dt-trend-flat';
  return (t.direction === 'up') === (better === 'higher') ? 'dt-trend-good' : 'dt-trend-bad';
}
function TrendText({ trend, better, decimals, unit }: { trend: HealthTrend | null; better: Better; decimals: number; unit: string }) {
  if (!trend) return <span className="dt-trend dt-trend-flat">no trend yet</span>;
  if (trend.direction === 'steady') return <span className="dt-trend dt-trend-flat">→ steady</span>;
  const n = Math.abs(trend.delta);
  return <span className={`dt-trend ${trendTone(trend, better)}`}>{trend.direction === 'up' ? '↑' : '↓'} {decimals ? n.toFixed(decimals) : Math.round(n)} {unit}</span>;
}

/** A row of bars, scaled to the range of the readings so a small change still shows. */
function Bars({ values, tone, label }: { values: (number | null)[]; tone: 'green' | 'violet'; label?: string }) {
  const real = values.filter((v): v is number => v != null);
  if (real.length < 2) return <span className="dt-bars-row dt-bars-empty">Not enough days yet</span>;
  const lo = Math.min(...real), hi = Math.max(...real);
  return <span className={`dt-bars-row dt-bars-${tone}`} role={label ? 'img' : undefined} aria-label={label}>
    {values.map((v, i) => <i key={i} className={v == null ? 'dt-bar-gap' : undefined} style={{ height: v == null ? '10%' : `${hi === lo ? 70 : 30 + ((v - lo) / (hi - lo)) * 70}%` }} />)}
  </span>;
}

function RecoveryDial({ score }: { score: number | null }) {
  const r = 42, c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const tone = score == null ? '#2f5468' : score >= 67 ? '#2fe0a8' : score >= 34 ? '#f0c35c' : '#ff7a6a';
  return <div className="dt-dial" role="img" aria-label={score == null ? 'No scored recovery' : `Recovery ${score}%`}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="dt-ring-track" />
      <circle cx="50" cy="50" r={r} stroke={tone} strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ filter: `drop-shadow(0 0 4px ${tone}aa)` }} />
    </svg>
    <span><strong>{score == null ? '—' : <>{score}<small>%</small></>}</strong><em>Recovery</em></span>
  </div>;
}

export function HealthCard({ unlinked, notes, score, date, readiness, change, recoveryBars, sleepPercent, hrv, rhr, tiles, onOpen }: {
  unlinked: boolean;
  /** WHOOP sources that can't be read, with their fix buttons. */
  notes?: ReactNode;
  score: number | null; date: string | null;
  readiness: { level: 'go' | 'rest' | 'warning'; label: string; reason: string } | null;
  change: { delta: number; previous: string } | null;
  /** Recovery over the last two weeks, oldest first. */
  recoveryBars: (number | null)[];
  sleepPercent: number | null;
  hrv: HealthTrend | null; rhr: HealthTrend | null;
  tiles: HealthTile[];
  onOpen: () => void;
}) {
  const signed = (t: HealthTrend | null, unit: string) => !t ? '—' : t.direction === 'steady' ? 'steady' : `${t.delta > 0 ? '+' : '−'}${Math.round(Math.abs(t.delta))} ${unit}`;
  return <section className="dh-section dt-card" id="dashboard-health">
    <CardHeader icon="Health" glyph={HEART} tone="rose" title="Health & Performance" subtitle="Recovery · Sleep · Fitness · Trends" action="View details" actionArrow="→" onAction={onOpen} />
    <div className="dh-section-body dt-body">
      {notes}
      {!unlinked && <div className="dt-health-top">
        <RecoveryDial score={score} />
        <div className="dt-health-verdict">
          {readiness && <span className={`dt-verdict dt-verdict-${readiness.level}`}>{readiness.label}</span>}
          <small>{date || 'No scored result'}</small>
          {change && <em className={change.delta >= 0 ? 'dt-trend-good' : 'dt-trend-bad'}>{change.delta >= 0 ? '↑ +' : '↓ '}{change.delta} pts vs {change.previous}</em>}
        </div>
        <Bars values={recoveryBars} tone="green" label="Recovery over the last two weeks" />
        <ul className="dt-health-side">
          <li>{svg(MOON)}<span>Sleep</span><b>{sleepPercent == null ? '—' : `${sleepPercent}%`}</b></li>
          <li>{svg(PULSE)}<span>HRV</span><b className={trendTone(hrv, 'higher')}>{signed(hrv, 'ms')}</b></li>
          <li>{svg(RUN)}<span>Resting HR</span><b className={trendTone(rhr, 'lower')}>{signed(rhr, 'bpm')}</b></li>
        </ul>
      </div>}
      {readiness && <button type="button" className={`dt-reason dt-reason-${readiness.level}`} onClick={onOpen}>{svg(TARGET)}<span>{readiness.reason}</span>{svg(CHEVRON, 'dt-chevron')}</button>}
      {tiles.length > 0 && <div className="dt-health-tiles">
        {tiles.map(t => <button type="button" key={t.key} className={`dt-htile dt-htile-${t.key}`} onClick={onOpen}>
          <span className="dt-htile-label">{svg(TILE_ICON[t.key])}{t.label}</span>
          <strong>{t.value ?? '—'}{t.value && t.unit && <small> {t.unit}</small>}</strong>
          <TrendText trend={t.trend} better={t.better} decimals={t.decimals} unit={t.deltaUnit} />
          <Bars values={t.bars} tone={t.key === 'sleep' ? 'violet' : 'green'} />
        </button>)}
      </div>}
    </div>
  </section>;
}

// --- Family ------------------------------------------------------------------

const SIGNAL_ICON: Record<RosterRow['signal']['kind'], ReactNode> = { sick: THERMO, birthday: CAKE, calendar: CAL, stale: ALERT, sparse: ALERT, ok: CAL };

export function FamilyCard({ roster, limit, loading, error, groceries, resolving, notice, onOpen, onRow, onAsk, onRetry }: {
  roster: RosterRow[]; limit: number; loading: boolean; error: boolean;
  /** What the family is out of, from the shared Keep lists. */
  groceries: string[];
  /** The health report being resolved, if any. */
  resolving: string | null;
  notice?: string;
  onOpen: () => void;
  /** The row's own button: resolves a sick report, or asks Athena what the signal asks. */
  onRow: (r: RosterRow) => void;
  onAsk: (text: string) => void;
  onRetry: () => void;
}) {
  return <section className="dh-section dt-card" id="dashboard-family">
    <CardHeader icon="Family" glyph={PEOPLE} tone="green" title="Family" subtitle="People · Plans · Updates" action="View all" actionArrow="→" onAction={onOpen} />
    <div className="dh-section-body dt-body">
      {error && !roster.length ? <p className="dashboard-empty">Memories couldn’t load. <button type="button" className="dt-link" onClick={onRetry}>Retry</button></p>
        : loading && !roster.length ? <p className="dashboard-empty">Loading…</p>
          : !roster.length ? <p className="dashboard-empty">Athena doesn’t know your people yet. <button type="button" className="dt-link" onClick={() => onAsk('Let me tell you about my family. Ask me about each person — who they are, birthdays, what is going on in their lives.')}>Tell her about your family</button></p>
            : <ul className="dt-family">
              {roster.slice(0, limit).map((r, i) => {
                const k = r.signal.kind;
                const busy = !!r.signal.healthUuid && resolving === r.signal.healthUuid;
                return <li key={r.id} className={`dt-person dt-person-${k}${i === 0 ? ' dt-person-lead' : ''}`}>
                  <ContactAvatar name={r.name} photoUrl={r.photoUrl} />
                  <button type="button" className="dt-person-main" onClick={onOpen}>
                    <span className="dt-person-name"><strong>{r.name}</strong>{(r.relation || r.isPet) && <em>{r.relation || 'Pet'}</em>}</span>
                    <small>{svg(SIGNAL_ICON[k])}{r.signal.label}</small>
                  </button>
                  {k === 'calendar' ? <button type="button" className="dt-person-go" onClick={onOpen} aria-label={`Open ${r.name} on the Family page`}>{svg(CHEVRON, 'dt-chevron')}</button>
                    : <button type="button" className="dt-person-action" disabled={busy} onClick={() => onRow(r)}>{busy ? 'Updating…' : r.signal.action}</button>}
                </li>;
              })}
            </ul>}
      {notice && <p className="dashboard-notice" role="status">{notice}</p>}
      {roster.length > limit && <p className="dt-more-note">+{roster.length - limit} more on the Family page</p>}
      {groceries.length > 0 && <p className="dt-caption dt-grocery">{svg(CART)}Grocery list: {groceries.slice(0, 3).join(', ')}{groceries.length > 3 ? ` +${groceries.length - 3} more` : ''}</p>}
      {roster.length > 0 && <button type="button" className="dt-link dt-add" onClick={() => onAsk('I want to add someone to my family. Ask me who they are and what you should know.')}>+ Add someone</button>}
    </div>
  </section>;
}
