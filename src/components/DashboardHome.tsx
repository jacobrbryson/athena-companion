import { useEffect, useState, type ReactNode } from 'react';
import { dashboardApi, dreamsApi, type CommunityWeather, type Dream, type WeatherOutlookRead } from '../api/dashboard';
import { healthPlanApi, localDay, type HealthPlan, type NutritionDay, type NutritionTargets, type NutritionTotals } from '../api/healthPlan';
import { propertyGuardianApi, type GuardianOverview } from '../api/propertyGuardian';
import { DashboardIcon } from './icons';
import { MacroRings } from './HealthPage';
import { DASHBOARD_REFRESH_EVENT } from '../athena/useChat';
import { freshness, type HomeUpdate } from './livingHome';
import './home.css';

/**
 * The briefing's own pieces (Dashboard → section 'Dashboard', full width):
 * a hero with Athena at the centre of the person's life, a strip of the six
 * numbers people glance at, and the section cards under it.
 *
 * Everything here is presentational. Dashboard derives the values from the
 * same reads its pages use, so a number on the briefing and the number on
 * its page can never disagree.
 */

export type Tone = 'good' | 'warn' | 'alert' | 'idle';

/** One area of life around Athena in the hero, with the single thing worth knowing about it. */
export interface HeroNode { id: string; label: string; icon: string; status: string; tone: Tone; onOpen: () => void }

// Where each node sits, as a share of the constellation's box. Three on each
// side, so the eye reads the left column, Athena, then the right.
const SPOTS: Record<number, [number, number]> = { 0: [30, 16], 1: [29, 50], 2: [30, 84], 3: [70, 16], 4: [71, 50], 5: [70, 84] };

export function HomeHero({ greeting, firstName, blurb, nodes, quote, aside }: {
  greeting: string; firstName: string; blurb: string; nodes: HeroNode[]; quote?: string | null; aside?: ReactNode;
}) {
  return <section className="dh-hero">
    <div className="dh-hero-copy">
      <span className="ph-eyebrow">YOUR DAY AT A GLANCE</span>
      <h1>{greeting},<br /><span>{firstName}</span></h1>
      <p>{blurb}</p>
    </div>
    <div className="dh-constellation">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {nodes.slice(0, 6).map((n, i) => <line key={n.id} x1="50" y1="50" x2={SPOTS[i][0]} y2={SPOTS[i][1]} className={`dh-link dh-link-${n.tone}`} />)}
      </svg>
      <div className="dh-core" aria-hidden="true"><img src="/assets/athena-avatar.png" alt="" /></div>
      {nodes.slice(0, 6).map((n, i) => <button key={n.id} type="button" className={`dh-node dh-node-${n.tone} ${i < 3 ? 'dh-node-left' : 'dh-node-right'}`}
        style={{ left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%` }} onClick={n.onOpen} aria-label={`${n.label}: ${n.status}`}>
        <span className="dh-node-orb"><DashboardIcon name={n.icon} bare /></span>
        <span className="dh-node-text"><strong>{n.label}</strong><small>{n.status}</small></span>
      </button>)}
    </div>
    {aside || (quote && <blockquote className="dh-quote"><p>“{quote}”</p><cite>— Athena</cite></blockquote>)}
  </section>;
}

/** A row of small bars: a week of something, or a breakdown. Nulls are gaps, not zeroes. */
export function Spark({ values, tone = 'cyan', label }: { values: (number | null)[]; tone?: 'cyan' | 'green' | 'violet' | 'amber'; label?: string }) {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (real.length < 2) return null;
  const max = Math.max(...real), min = Math.min(...real, 0);
  return <span className={`dh-spark dh-spark-${tone}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {values.map((v, i) => <i key={i} style={{ height: v === null ? 0 : `${Math.max(12, ((v - min) / (max - min || 1)) * 100)}%` }} />)}
  </span>;
}

/** One bar split into parts of a whole (Open tasks: overdue, due today, later). Empty parts take no room. */
export function ShareBar({ parts, label }: { parts: { value: number; color: string }[]; label: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return <span className="dh-bar" role="img" aria-label={label} title={label}>
    {total > 0 && parts.filter(p => p.value > 0).map((p, i) => <i key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
  </span>;
}

export function HomeStat({ icon, label, value, note, detail, aside, chip, freshness: stamp, tone = 'idle', className, onClick }: {
  icon: string; label: string; value: ReactNode; note?: ReactNode; chip?: ReactNode; freshness?: string; tone?: Tone; onClick: () => void;
  /** A second reading under the note, for a tile that carries two (Recovery & sleep). */
  detail?: ReactNode;
  /** A panel beside the reading: Weather's next three days, Nutrition's rings, Recovery's week. */
  aside?: ReactNode;
  /** A tile's own class, for the little that differs (Nutrition's amber icon). */
  className?: string;
}) {
  return <button type="button" className={['dh-stat', `dh-stat-${tone}`, aside ? 'dh-stat-aside' : '', className || ''].filter(Boolean).join(' ')} onClick={onClick}>
    <span className="dh-stat-icon"><DashboardIcon name={icon} bare /></span>
    <span className="dh-stat-reading">
      <small>{label}</small>
      <strong>{value}{chip}</strong>
      {note && <em title={typeof note === 'string' ? note : undefined}>{note}</em>}
      {detail && <em className="dh-stat-detail">{detail}</em>}
      {stamp && <small className="dh-freshness" title={stamp}>{stamp}</small>}
    </span>
    {aside && <span className="dh-aside">{aside}</span>}
  </button>;
}

export function HomeSection({ id, icon, title, action = 'View all', onAction, tabs, children }: {
  id: string; icon: string; title: string; action?: string; onAction: () => void; tabs?: ReactNode; children: ReactNode;
}) {
  return <section className={`dh-section dh-section-${id}`} id={`dashboard-${id}`}>
    <header>
      <button type="button" className="dh-section-title" onClick={onAction}><DashboardIcon name={icon} /><h2>{title}</h2></button>
      <button type="button" className="dh-section-action" onClick={onAction}>{action} <span>→</span></button>
    </header>
    {tabs}
    <div className="dh-section-body">{children}</div>
  </section>;
}

/** Chips across the top of a section. Counts are optional; the active one is the filter. */
export function HomeTabs<T extends string>({ tabs, active, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void; label: string }) {
  if (tabs.length < 2) return null;
  return <div className="dh-tabs" role="tablist" aria-label={label}>
    {tabs.map(t => <button key={t.id} type="button" role="tab" aria-selected={t.id === active} className={t.id === active ? 'active' : undefined} onClick={() => onChange(t.id)}>
      {t.label}{t.count !== undefined && ` (${t.count})`}
    </button>)}
  </div>;
}

interface Read<T> { data: T | null; loading: boolean }

export function HomeChanges({ updates, now, onOpen, compact = false }: {
  updates: HomeUpdate[]; now: number; onOpen: (area: HomeUpdate['area']) => void; compact?: boolean;
}) {
  return <div className={compact ? 'dh-change-strip' : 'dh-changes'}>
    {compact && <strong className="dh-change-heading">Latest changes <small>From your sources</small></strong>}
    {!updates.length && <p className="dashboard-empty">No dated updates available yet. Connected sources will appear here when they can be read.</p>}
    {updates.map(update => <button type="button" key={update.id} className={`dh-change dh-change-${update.area.toLowerCase()}`} onClick={() => onOpen(update.area)}>
      <DashboardIcon name={update.area} />
      <span><strong>{update.title}</strong>{!compact && <span className="dh-change-detail">{update.detail}</span>}
        <small>{update.source} · <time dateTime={update.at} title={update.at}>{/^\d{4}-\d{2}-\d{2}$/.test(update.at) ? update.at : freshness(update.at, now)}</time></small>
      </span><span className="dh-change-arrow" aria-hidden="true">↗</span>
    </button>)}
  </div>;
}

/**
 * The three reads only the briefing needs: today's training session, the
 * weather at home, and a month of dreams. Each one fails on its own — a tile
 * that cannot be read says so; it never takes its neighbours with it.
 */
export function useHomeExtras(enabled: boolean) {
  const [plan, setPlan] = useState<Read<HealthPlan>>({ data: null, loading: true });
  const [weather, setWeather] = useState<Read<CommunityWeather>>({ data: null, loading: true });
  // The longer forecast, for the Weather tile's next three days. Read on its own so a slow
  // or failed outlook never takes the tile's current reading with it.
  const [outlook, setOutlook] = useState<Read<WeatherOutlookRead>>({ data: null, loading: true });
  const [dreams, setDreams] = useState<Read<Dream[]>>({ data: null, loading: true });
  // Is the property secure: the Guardian sweep's verdict and open incidents (Property card).
  const [guardian, setGuardian] = useState<Read<GuardianOverview>>({ data: null, loading: true });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      const settle = <T,>(load: Promise<T>, set: (r: Read<T>) => void) => load
        .then(data => { if (alive && current === revision) set({ data, loading: false }); })
        .catch(() => { if (alive && current === revision) set({ data: null, loading: false }); });
      void settle(healthPlanApi.overview(localDay()), setPlan);
      void settle(dashboardApi.communityWeather(), setWeather);
      void settle(dashboardApi.weatherOutlook(), setOutlook);
      void settle(dreamsApi.list().then(r => r.dreams), setDreams);
      void settle(propertyGuardianApi.overview(), setGuardian);
    };
    const onPush = () => {
      setPlan({ data: null, loading: true }); setWeather({ data: null, loading: true }); setOutlook({ data: null, loading: true }); setDreams({ data: null, loading: true }); setGuardian({ data: null, loading: true });
      refresh();
    };
    const visible = () => { if (!document.hidden) refresh(); };
    refresh();
    const timer = window.setInterval(visible, 5 * 60_000);
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onPush);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false; revision++; window.clearInterval(timer);
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onPush);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled]);
  // A food logged from the Today log answers with the day's totals; the Nutrition stat takes them straight away.
  const setNutrition = (nutrition: NutritionDay) => setPlan(p => (p.data ? { ...p, data: { ...p.data, nutrition } } : p));
  return { plan, weather, outlook, dreams, guardian, setNutrition };
}

/** The rings, outermost first. Calories is the tile's number, so it has no ring. */
const RING_ORDER: (keyof NutritionTotals)[] = ['carbs_g', 'protein_g', 'fat_g'];

/**
 * Today's food against its targets, one tile like its neighbours: calories as
 * the reading, its target under it, and rings with a legend for carbs, protein
 * and fat. Opens the Today food log.
 */
export function NutritionStat({ food, targets, macros, loading, onClick }: {
  food: NutritionDay | null; targets: NutritionTargets | null; loading: boolean; onClick: () => void;
  macros: readonly { key: keyof NutritionTotals; target: keyof NutritionTargets; label: string; unit: string; color: string }[];
}) {
  const totals = food?.totals;
  const rows = RING_ORDER.map(key => macros.find(m => m.key === key)).filter(m => !!m).map(m => {
    const v = Math.round(totals?.[m.key] ?? 0);
    const t = targets?.[m.target] ?? null;
    return { ...m, share: t ? v / t : 0, text: t ? `${v.toLocaleString()} / ${t.toLocaleString()} g` : `${v.toLocaleString()} g` };
  });
  const value = totals ? `${Math.round(totals.calories).toLocaleString()} cal` : '—';
  const goal = food && targets?.calories ? `${targets.calories.toLocaleString()} cal` : null;
  const note = !food ? (loading ? 'Loading…' : 'Unavailable') : goal ? `Target: ${goal}` : 'No calorie target';
  // The same tile as its neighbours; the rings and legend ride in HomeStat's aside.
  return <HomeStat icon="StatNutrition" className="dh-stat-nutrition" label="Nutrition" value={value} onClick={onClick}
    note={goal ? <>
      {/* A finish flag stands for "Target"; screen readers and hover still get the word. */}
      <svg className="dh-target-flag" role="img" aria-label="Target" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <title>Target</title><path d="M3.5 14.5V2h9v6h-9" /><path fill="currentColor" stroke="none" d="M3.5 2h3v3h-3zM9.5 2h3v3h-3zM6.5 5h3v3h-3z" />
      </svg>{goal}</> : note}
    aside={food ? <span className="dh-nutrition" title={rows.map(r => `${r.label} ${r.text}`).join(' · ')}>
      <MacroRings rings={rows.map(r => ({ color: r.color, share: r.share }))} />
      <span className="dh-nutrition-legend">{rows.map(r => <span key={r.key}>
        <i style={{ background: r.color }} /><b>{r.label}</b><span>{r.text}</span>
      </span>)}</span>
    </span> : undefined} />;
}
