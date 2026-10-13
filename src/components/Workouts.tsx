import { useEffect, useMemo, useState } from 'react';
import { workoutsApi, type Workout } from '../api/workouts';
import './workouts.css';

/**
 * Workouts on the Health & Performance page — Athena's own record of every
 * WHOOP workout (athena_workout), so it reaches back past WHOOP's week.
 *
 * WHOOP reports the heart-rate side of a session only. A lifting session has
 * no sets, reps or weights here because WHOOP's API has none, and the panel
 * says so rather than leaving the gap to be guessed at.
 */

const ZONES = ['zone_zero', 'zone_one', 'zone_two', 'zone_three', 'zone_four', 'zone_five'] as const;
const ZONE_NAMES = ['Zone 0', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];
const LIFTING = /lifting/;
const RANGES = [
  { id: '3m', label: '3 mo', days: 91, bucket: 'week' },
  { id: '6m', label: '6 mo', days: 182, bucket: 'week' },
  { id: '1y', label: '1 yr', days: 365, bucket: 'month' },
  { id: 'all', label: 'All', days: Infinity, bucket: 'month' },
] as const;
type RangeId = typeof RANGES[number]['id'];

const SPORT_NAMES: Record<string, string> = {
  weightlifting_msk: 'Strength Trainer', weightlifting: 'Weightlifting', powerlifting: 'Powerlifting',
  hiit: 'HIIT', activity: 'Activity', spin: 'Spin', 'hiking-rucking': 'Hiking / rucking',
};
export const sportName = (sport: string | null) => !sport ? 'Workout'
  : SPORT_NAMES[sport] ?? sport.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());

const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const dayLabel = (date: string) => noon(date).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const hours = (minutes: number) => minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;

/** Monday of the week a local date falls in, as YYYY-MM-DD. */
function weekOf(date: string) {
  const d = noon(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Every bucket in the window, oldest first, empty ones included — a gap is information. */
function buckets(kind: 'week' | 'month', from: string, to: string) {
  const out: string[] = [];
  const d = noon(kind === 'week' ? weekOf(from) : `${from.slice(0, 7)}-01`);
  const end = noon(to);
  while (d <= end && out.length < 120) {
    out.push(d.toISOString().slice(0, kind === 'week' ? 10 : 7));
    if (kind === 'week') d.setUTCDate(d.getUTCDate() + 7); else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function zoneTotals(rows: Workout[]) {
  const totals = ZONES.map(() => 0);
  for (const w of rows) ZONES.forEach((z, i) => { totals[i] += w.minutes_in_zone?.[z] ?? 0; });
  return totals;
}

function ZoneBar({ minutes, label }: { minutes: number[]; label: string }) {
  const total = minutes.reduce((a, b) => a + b, 0);
  if (!total) return <span className="zone-bar zone-bar-empty" aria-label={`${label}: no heart-rate zones recorded`} />;
  return <span className="zone-bar" role="img" aria-label={`${label}: ${minutes.map((m, i) => `${ZONE_NAMES[i]} ${Math.round(m)} min`).join(', ')}`}>
    {minutes.map((m, i) => m > 0 && <i key={i} className={`zone-${i}`} style={{ width: `${(m / total) * 100}%` }} title={`${ZONE_NAMES[i]} · ${hours(m)}`} />)}
  </span>;
}

export function WorkoutsPanel({ onAsk }: { onAsk?: (text: string) => void }) {
  const [state, setState] = useState<{ workouts: Workout[] | null; error: string | null }>({ workouts: null, error: null });
  const [sport, setSport] = useState<string>('all');
  const [range, setRange] = useState<RangeId>('3m');
  const [shown, setShown] = useState(10);

  useEffect(() => {
    let alive = true;
    workoutsApi.list().then(r => { if (alive) setState({ workouts: r.workouts, error: null }); })
      .catch(err => { if (alive) setState({ workouts: null, error: (err as Error).message || 'Unavailable' }); });
    return () => { alive = false; };
  }, []);

  const all = state.workouts ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const r = RANGES.find(x => x.id === range)!;
  const from = r.days === Infinity ? (all[all.length - 1]?.date ?? today)
    : new Date(Date.now() - r.days * 86400000).toISOString().slice(0, 10);

  /** Sport filters: All, Lifting when there is any, then the most frequent others. */
  const sports = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of all) if (w.sport && !LIFTING.test(w.sport)) counts.set(w.sport, (counts.get(w.sport) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s]) => ({ id: s, label: sportName(s) }));
    return [{ id: 'all', label: 'All' }, ...(all.some(w => LIFTING.test(w.sport ?? '')) ? [{ id: 'lifting', label: 'Lifting' }] : []), ...top];
  }, [all]);

  const rows = useMemo(() => all.filter(w => w.date >= from
    && (sport === 'all' || (sport === 'lifting' ? LIFTING.test(w.sport ?? '') : w.sport === sport))), [all, from, sport]);

  const series = useMemo(() => {
    const keys = buckets(r.bucket, from, today);
    const byKey = new Map(keys.map(k => [k, { count: 0, minutes: 0 }]));
    for (const w of rows) {
      const b = byKey.get(r.bucket === 'week' ? weekOf(w.date) : w.date.slice(0, 7));
      if (b) { b.count++; b.minutes += w.minutes; }
    }
    return keys.map(k => ({ key: k, ...byKey.get(k)! }));
  }, [rows, r.bucket, from, today]);

  if (state.error) return <section className="section-panel section-panel-wide"><header><h2>Workouts</h2></header>
    <div className="section-unavailable"><p className="dashboard-empty">Workout history · {state.error}</p></div></section>;
  if (!state.workouts) return <section className="section-panel section-panel-wide"><header><h2>Workouts</h2></header>
    <p className="dashboard-empty">Reading your workouts…</p></section>;
  if (!all.length) return <section className="section-panel section-panel-wide"><header><h2>Workouts</h2><span>WHOOP</span></header>
    <p className="dashboard-empty">No workouts recorded yet. Athena keeps every WHOOP workout once WHOOP is connected and health data sharing is on.</p></section>;

  const minutes = rows.reduce((a, w) => a + w.minutes, 0);
  const strains = rows.flatMap(w => w.strain == null ? [] : [w.strain]);
  const weeks = Math.max(1, (noon(today).getTime() - noon(from).getTime()) / (7 * 86400000));
  const zones = zoneTotals(rows);
  const zoneTotal = zones.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...series.map(s => s.count));
  const label = sports.find(s => s.id === sport)?.label ?? 'All';
  const bucketLabel = (key: string) => r.bucket === 'week'
    ? noon(key).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'numeric', day: 'numeric' })
    : noon(`${key}-15`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', ...(r.id === 'all' ? { year: '2-digit' } : {}) });
  const lifting = sport === 'lifting' || LIFTING.test(sport);

  return <section className="section-panel section-panel-wide workouts-panel">
    <header><h2>Workouts</h2><span>WHOOP · {all.length} recorded since {noon(all[all.length - 1].date).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', year: 'numeric' })}</span></header>

    <div className="workout-controls">
      <div className="workout-chips" role="group" aria-label="Sport">
        {sports.map(s => <button key={s.id} type="button" aria-pressed={sport === s.id} onClick={() => { setSport(s.id); setShown(10); }}>{s.label}</button>)}
      </div>
      <div className="workout-chips" role="group" aria-label="Time range">
        {RANGES.map(x => <button key={x.id} type="button" aria-pressed={range === x.id} onClick={() => { setRange(x.id); setShown(10); }}>{x.label}</button>)}
      </div>
    </div>

    <div className="workout-stats">
      <div><span>Sessions</span><strong>{rows.length}</strong><small>{(rows.length / weeks).toFixed(1)} a week</small></div>
      <div><span>Time</span><strong>{hours(minutes)}</strong><small>{rows.length ? `${Math.round(minutes / rows.length)} min each` : '—'}</small></div>
      <div><span>Avg strain</span><strong>{strains.length ? (strains.reduce((a, b) => a + b, 0) / strains.length).toFixed(1) : '—'}</strong><small>WHOOP 0–21</small></div>
      <div><span>Last</span><strong className="workout-stat-small">{rows[0] ? dayLabel(rows[0].date) : '—'}</strong><small>{rows[0] ? sportName(rows[0].sport) : `no ${label.toLowerCase()} sessions`}</small></div>
    </div>

    <h3 className="workout-subhead">Sessions per {r.bucket}</h3>
    <ul className="trend-bars workout-bars" aria-label={`${label} sessions per ${r.bucket}`}>
      {series.map(s => <li key={s.key} title={`${s.count} session${s.count === 1 ? '' : 's'} · ${hours(s.minutes)}`}>
        <b>{s.count || ''}</b>
        <span className="trend-track"><span className={`trend-bar ${s.count ? 'trend-plain' : 'trend-idle'}`} style={{ height: `${s.count ? Math.max(6, (s.count / peak) * 100) : 0}%` }} /></span>
        <small>{bucketLabel(s.key)}</small>
      </li>)}
    </ul>

    <h3 className="workout-subhead">Heart-rate zones</h3>
    {zoneTotal ? <>
      <ZoneBar minutes={zones} label={`${label}, all sessions in range`} />
      <ul className="zone-legend">{zones.map((m, i) => <li key={i}><i className={`zone-${i}`} />{ZONE_NAMES[i]} <b>{Math.round((m / zoneTotal) * 100)}%</b></li>)}</ul>
    </> : <p className="dashboard-empty">No heart-rate zones recorded in this range.</p>}

    <h3 className="workout-subhead">Sessions</h3>
    {!rows.length ? <p className="dashboard-empty">No {label.toLowerCase()} sessions in this range.</p>
      : <ul className="workout-list">
        {rows.slice(0, shown).map(w => <li key={w.start}>
          <div className="workout-when"><strong>{sportName(w.sport)}</strong><small>{dayLabel(w.date)}</small></div>
          <dl>
            <div><dt>Time</dt><dd>{hours(w.minutes)}</dd></div>
            <div><dt>Strain</dt><dd>{w.strain != null ? w.strain.toFixed(1) : '—'}</dd></div>
            <div><dt>Avg / max HR</dt><dd>{w.average_heart_rate ?? '—'} / {w.max_heart_rate ?? '—'}</dd></div>
            <div><dt>Energy</dt><dd>{w.kilojoules != null ? `${Math.round(w.kilojoules / 4.184)} cal` : '—'}</dd></div>
          </dl>
          <ZoneBar minutes={ZONES.map(z => w.minutes_in_zone?.[z] ?? 0)} label={`${sportName(w.sport)} on ${dayLabel(w.date)}`} />
        </li>)}
      </ul>}
    {rows.length > shown && <button type="button" className="source-fix" onClick={() => setShown(n => n + 20)}>Show {Math.min(20, rows.length - shown)} more of {rows.length - shown} <span>↓</span></button>}

    {lifting && <p className="source-note">WHOOP records the heart-rate side of a lift only: no exercises, sets, reps or weights.</p>}
    {onAsk && <button type="button" className="dashboard-chat-cta" onClick={() => onAsk(`Look at my ${label === 'All' ? '' : `${label.toLowerCase()} `}workouts over the last ${r.id === 'all' ? 'few years' : r.label.replace('mo', 'months').replace('yr', 'year')}. How consistent have I been, and what stands out?`)}>Ask Athena about these <span>↗</span></button>}
  </section>;
}
