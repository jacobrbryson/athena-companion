import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RecoveryDay, WeighIn } from '../api/dashboard';
import { healthPlanApi, localDay, type HealthPlan, type EntrySource, type NutritionDay, type NutritionEntry, type NutritionTargets, type ProgramDraft, type ProgramSession, type SessionKind, type TrainingProgram } from '../api/healthPlan';
import { workoutsApi, type Workout } from '../api/workouts';
import { PageHeader } from './PageHeader';
import { downscale } from './photoStore';
import { Ecg, useLiveHeartRate } from './Ecg';
import './health.css';

/**
 * The Health & Performance page (redesigned 2026-10-14 from the owner's
 * concept): a hero with Athena's take on today, the five WHOOP numbers, the
 * day's plan, the training program's week, nutrition against targets, then
 * progress and wellness.
 *
 * Everything shown is read from something real: WHOOP (recovery, sleep,
 * strain), the scale, recorded workouts, or what the person set up here
 * (program, targets, food log). Where a source is missing the tile says so
 * rather than drawing a plausible number.
 */

export type HealthSleep = { date: string; hours_asleep: number; sleep_performance_percent: number | null; respiratory_rate?: number | null };
export type HealthStrain = { date: string; day_strain: number | null; average_heart_rate?: number | null };
export interface HealthReadiness { level: 'go' | 'rest' | 'warning'; label: string; headline: string; reason: string }

interface Props {
  /** Scored recoveries, newest first. */
  recovery: RecoveryDay[];
  /** Nights (no naps), newest first. */
  sleep: HealthSleep[];
  /** Cycles, newest first. */
  strain: HealthStrain[];
  /** One weigh-in per day, newest first. */
  weighIns: WeighIn[];
  readiness: HealthReadiness | null;
  /** Why WHOOP or the scale can't be read, with its fix button; null when it can. */
  whoopNote: ReactNode;
  bodyNote: ReactNode;
  /** A Health project's plan for today's weight, in lb. */
  weightPlan?: { value: number; title: string } | null;
  onAsk: (text: string) => void;
  /** Opens the Workouts page — every recorded workout. */
  onWorkouts: () => void;
}

const RANGES = [
  // Today's tiles read today; its trend chart shows the six weeks leading here.
  { id: 'today', label: 'Today', days: 42 },
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '3m', label: '3M', days: 91 },
  { id: '1y', label: '1Y', days: 365 },
] as const;
type RangeId = typeof RANGES[number]['id'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY = 86400000;
const lbOf = (kg: number) => kg * 2.20462;
const kgOf = (lb: number) => lb / 2.20462;
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const shortDate = (date: string) => noon(date).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
const hm = (hours: number) => `${Math.floor(hours)}h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')}m`;
function avg(values: (number | null | undefined)[]) {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ---------------------------------------------------------------------------
// Icons — stroke glyphs in the concept's style, coloured by their container.
// ---------------------------------------------------------------------------
const PATHS: Record<string, ReactNode> = {
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  moon: <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" />,
  run: <><circle cx="14" cy="4.5" r="1.8" /><path d="M7 21l3-6 3 2v5M10 15l1.5-5L8 11l-2 3M11.5 10l3.5 1 2 3h3" /></>,
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  dumbbell: <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  leaf: <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7" />,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  food: <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7H17V3Zm0 7v11" />,
  stretch: <><circle cx="12" cy="4.5" r="1.8" /><path d="M5 9l7 1 7-1M12 10v5l-4 6M12 15l4 6" /></>,
  ball: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8l3 2.2-1.2 3.6h-3.6L9 10.2Z M12 8V3.5M15 10.2l4-1.5M13.8 13.8l2.5 3.7M10.2 13.8l-2.5 3.7M9 10.2l-4-1.5" /></>,
  bike: <><circle cx="6" cy="16" r="3.5" /><circle cx="18" cy="16" r="3.5" /><path d="M6 16l4-7h5l3 7M10 9l2.5 7H6M14 5h2" /></>,
  bolt: <path d="M13 2L5 13h6l-1 9 8-11h-6Z" />,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" /><path d="M12 8v7M8.5 11.5h7" /></>,
  brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3V4Zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3V4ZM9 9h2M13 13h2M9 15h2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>,
  rest: <path d="M4 18h16M6 18v-5h12v5M8 13V9h3v4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  minus: <path d="M6 12h12" />,
  // The Calendar page (CalendarPage.tsx) draws from the same set.
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M8.5 3v4M15.5 3v4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  people: <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M14.5 14.3c.6-.2 1.3-.3 2-.3 2.3 0 4 1.5 4.5 4.5" /></>,
  video: <><rect x="3" y="7" width="12.5" height="10" rx="2" /><path d="M15.5 10.5 21 7.5v9l-5.5-3" /></>,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  plane: <path d="M21 15.5v-1.8l-7.5-4.6V4.3a1.5 1.5 0 0 0-3 0v4.8L3 13.7v1.8l7.5-2.3v4.6l-2 1.5V21l3.5-1 3.5 1v-1.7l-2-1.5v-4.6Z" />,
  dots: <><circle cx="12" cy="5.5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="18.5" r="1.2" /></>,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  cake: <><path d="M4 20h16v-6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V20ZM4 15.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0M8 11.5v-3M12 11.5v-3M16 11.5v-3" /><path d="M8 6.5c-.6-.7-.6-1.5 0-2.5.6 1 .6 1.8 0 2.5ZM12 6.5c-.6-.7-.6-1.5 0-2.5.6 1 .6 1.8 0 2.5ZM16 6.5c-.6-.7-.6-1.5 0-2.5.6 1 .6 1.8 0 2.5Z" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.5-2h5.4l1.5 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" /><circle cx="12" cy="13" r="3.3" /></>,
  pencil: <path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 3 3L8 18.5Zm9.5-13l3 3" />,
  barcode: <path d="M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12M4 6h1M19 6h1" />,
  speech: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-8l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5Z" />,
};
export function Icon({ name, className }: { name: keyof typeof PATHS | string; className?: string }) {
  return <svg className={`hp-icon ${className || ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name] ?? PATHS.pulse}</svg>;
}
const KIND_ICON: Record<SessionKind, string> = { gym: 'dumbbell', run: 'run', ride: 'bike', sport: 'ball', recovery: 'run', rest: 'rest', other: 'pulse' };
const sessionIcon = (s: Pick<ProgramSession, 'kind' | 'title'>) => s.kind === 'sport' && !/soccer|football/i.test(s.title) ? 'run' : KIND_ICON[s.kind];

// ---------------------------------------------------------------------------
// Small drawings
// ---------------------------------------------------------------------------
export function Ring({ value, max, color, size = 104, stroke = 9, children }: { value: number | null; max: number; color: string; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = value == null || !max ? 0 : Math.max(0, Math.min(1, value / max));
  return <div className="hp-ring" style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#1c3442" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${share * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />
    </svg>
    <div className="hp-ring-label">{children}</div>
  </div>;
}

/** Dots joined by a line; nulls are gaps, not zeros. */
function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <div className="hp-spark hp-spark-empty" />;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const w = 150, h = 34, pad = 4;
  const pts = values.map((v, i) => v == null ? null : [pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1), h - pad - ((v - lo) / (hi - lo || 1)) * (h - 2 * pad)] as const);
  const line = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(' ');
  return <svg className="hp-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={line} fill="none" stroke={color} strokeWidth="1.6" opacity=".85" />
    {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={color} />)}
  </svg>;
}

function Delta({ value, unit, better, decimals = 0, suffix }: { value: number | null; unit: string; better: 'up' | 'down'; decimals?: number; suffix: string }) {
  if (value == null) return <p className="hp-delta hp-delta-none">{suffix}: not enough days yet</p>;
  const flat = Math.abs(value) < Math.pow(10, -decimals) / 2;
  const good = flat ? null : (value > 0) === (better === 'up');
  return <p className={`hp-delta ${good === null ? '' : good ? 'hp-good' : 'hp-bad'}`}>
    <span><Icon name={flat ? 'minus' : value > 0 ? 'up' : 'down'} />{Math.abs(value).toFixed(decimals)}{unit}</span>
    <small>{suffix}</small>
  </p>;
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------
const recoveryZone = (score: number | null | undefined) => score == null ? null : score >= 67 ? { word: 'High', color: '#33e0a1' } : score >= 34 ? { word: 'Medium', color: '#f2c14e' } : { word: 'Low', color: '#ff4f5e' };
/** WHOOP's own strain bands. */
const strainBand = (s: number | null | undefined) => s == null ? null : s >= 18 ? 'All out' : s >= 14 ? 'High' : s >= 10 ? 'Moderate' : 'Light';

interface Wellness { label: string; icon: string; tone: 'good' | 'ok' | 'bad' | 'idle'; word: string; why: string; ask: string }
function wellnessOf(recovery: RecoveryDay[], sleep: HealthSleep[]): Wellness[] {
  const today = recovery[0];
  const prior = recovery.slice(1, 8);
  const scoreBase = avg(prior.map(r => r.recovery_score));
  const rhrBase = avg(prior.map(r => r.resting_heart_rate));
  const hrvBase = avg(prior.map(r => r.hrv_ms));
  const spo2Base = avg(prior.map(r => r.spo2_percent));
  const respBase = avg(sleep.slice(1, 8).map(s => s.respiratory_rate));
  const out: Wellness[] = [];

  // Energy: today's recovery against the week before it.
  if (today?.recovery_score != null && scoreBase != null) {
    const d = today.recovery_score - scoreBase;
    out.push({ label: 'Energy', icon: 'bolt', tone: d <= -10 ? 'bad' : d >= 10 ? 'good' : 'ok', word: d <= -10 ? 'Lower today' : d >= 10 ? 'Higher today' : 'Steady',
      why: `Recovery ${today.recovery_score}% against a ${Math.round(scoreBase)}% week.`, ask: 'Why is my energy where it is today?' });
  } else out.push({ label: 'Energy', icon: 'bolt', tone: 'idle', word: 'No data', why: 'Needs a scored WHOOP recovery and a week before it.', ask: 'How is my energy looking?' });

  // Immune readiness: resting HR up, HRV down, breathing or oxygen off — the shape a cold makes.
  if (today && rhrBase != null && hrvBase != null) {
    const signs: string[] = [];
    if (today.resting_heart_rate != null && today.resting_heart_rate - rhrBase >= 3) signs.push('resting HR up');
    if (today.hrv_ms != null && (today.hrv_ms - hrvBase) / hrvBase <= -0.15) signs.push('HRV down');
    if (sleep[0]?.respiratory_rate != null && respBase != null && sleep[0].respiratory_rate - respBase >= 1) signs.push('breathing faster asleep');
    if (today.spo2_percent != null && spo2Base != null && spo2Base - today.spo2_percent >= 2) signs.push('blood oxygen low');
    out.push({ label: 'Immune Readiness', icon: 'shield', tone: signs.length >= 2 ? 'bad' : signs.length ? 'ok' : 'good', word: signs.length >= 2 ? 'Watch' : signs.length ? 'Monitor' : 'Good',
      why: signs.length ? `${signs.join(', ')} against your week.` : 'Heart rate, HRV and breathing where they usually sit.', ask: 'Is my body fighting anything off right now?' });
  } else out.push({ label: 'Immune Readiness', icon: 'shield', tone: 'idle', word: 'No data', why: 'Needs a week of WHOOP recoveries.', ask: 'How does my immune readiness look?' });

  // Sleep quality: WHOOP's sleep performance (asleep against need).
  const perf = sleep[0]?.sleep_performance_percent;
  out.push(perf == null
    ? { label: 'Sleep Quality', icon: 'moon', tone: 'idle', word: 'No data', why: 'No scored sleep last night.', ask: 'How have I been sleeping?' }
    : { label: 'Sleep Quality', icon: 'moon', tone: perf >= 85 ? 'good' : perf >= 70 ? 'ok' : 'bad', word: perf >= 85 ? 'Good' : perf >= 70 ? 'Fair' : 'Poor', why: `${perf}% of the sleep your body asked for.`, ask: 'How can I sleep better?' });

  // Stress & recovery: HRV against the week — the nervous system's side of it.
  if (today?.hrv_ms != null && hrvBase != null) {
    const off = (today.hrv_ms - hrvBase) / hrvBase;
    out.push({ label: 'Stress & Recovery', icon: 'brain', tone: off <= -0.1 ? 'bad' : off >= 0.05 ? 'good' : 'ok', word: off <= -0.1 ? 'Needs focus' : off >= 0.05 ? 'Good' : 'Steady',
      why: `HRV ${Math.round(today.hrv_ms)} ms against a ${Math.round(hrvBase)} ms week.`, ask: 'My HRV is off — what would help with stress and recovery?' });
  } else out.push({ label: 'Stress & Recovery', icon: 'brain', tone: 'idle', word: 'No data', why: 'Needs a week of HRV.', ask: 'How is my stress and recovery?' });
  return out;
}

const HARD = new Set<SessionKind>(['gym', 'run', 'sport', 'ride']);
interface PlanItem { icon: string; tone: string; title: string; note: string; ask: string }
interface PlanLead { icon: string; title: string; note: string; ask: string }
/** Today's lead and the habits under it, from the program, readiness and targets. */
function planFor(program: TrainingProgram | null, readiness: HealthReadiness | null, targets: NutritionTargets | null, food: NutritionDay | null): { lead: PlanLead; items: PlanItem[] } {
  const todays = program?.sessions.filter(s => s.date === localDay()) || [];
  const session = todays.find(s => s.status !== 'done') || todays[0];
  const easy = readiness && readiness.level !== 'go';
  let lead: PlanLead;
  if (!program) lead = { icon: 'leaf', title: easy ? 'Take it easy today' : 'No program yet', note: easy ? readiness!.headline : 'Set up a training program and today’s session shows here.', ask: 'Help me plan a training program.' };
  else if (session?.status === 'done') lead = { icon: 'check', title: `${session.title}${session.focus ? ` · ${session.focus}` : ''} — done`, note: session.recorded ? `WHOOP recorded ${session.recorded.minutes} min of ${session.recorded.sport.replace(/[-_]+/g, ' ')}.` : 'You marked it done. Recover well.', ask: 'I finished today’s session — what should recovery look like tonight?' };
  else if (session && easy && HARD.has(session.kind)) lead = { icon: 'leaf', title: 'Active Recovery Day', note: `${session.title}${session.focus ? ` (${session.focus})` : ''} is planned, but ${readiness!.headline.toLowerCase()}. Swap it for something easy and keep the week moving.`, ask: `My recovery is low and I have ${session.title} planned today. Should I swap it?` };
  else if (session?.kind === 'recovery' || session?.kind === 'rest') lead = { icon: 'leaf', title: session.kind === 'rest' ? 'Rest Day' : 'Active Recovery Day', note: 'Give your body a chance to recover so you can keep building and stay consistent.', ask: 'What should I do on an active recovery day?' };
  else if (session) lead = { icon: sessionIcon(session), title: `${session.title}${session.focus ? ` · ${session.focus}` : ''}`, note: session.exercises.length ? session.exercises.join(' · ') : session.detail || 'On the plan for today.', ask: `Walk me through today's ${session.title} session.` };
  else lead = { icon: 'leaf', title: 'Nothing planned today', note: 'An open day in the program. A walk counts.', ask: 'Nothing is planned today — what would help most?' };

  const items: PlanItem[] = [];
  const recoveryish = !session || easy || session.kind === 'recovery' || session.kind === 'rest';
  items.push(recoveryish
    ? { icon: 'stretch', tone: 'violet', title: 'Mobility / stretching', note: '10–15 min', ask: 'Give me a 10–15 minute mobility routine.' }
    : { icon: 'stretch', tone: 'violet', title: 'Warm up properly', note: '8–10 min before you start', ask: `Give me a warm-up for ${session!.title}.` });
  const water = targets?.water_oz;
  const drank = food?.totals.water_oz || 0;
  items.push({ icon: 'drop', tone: 'blue', title: 'Hydrate well', note: water ? `${water}+ oz${drank ? ` · ${Math.round(drank)} logged` : ''}` : 'Set a water target', ask: 'How much water should I be drinking on a day like today?' });
  const protein = targets?.protein_g;
  const ate = food?.totals.protein_g || 0;
  items.push({ icon: 'food', tone: 'amber', title: 'Whole foods nutrition', note: protein ? (ate >= protein ? 'Protein target hit — keep it whole foods' : `Hit your calorie and protein targets · ${Math.round(protein - ate)} g protein to go`) : 'Hit your calorie and protein targets', ask: 'What should I eat for the rest of today to hit my targets?' });
  const sleepGoal = (targets?.sleep_hours ?? 8) + (easy ? 0.5 : 0);
  items.push({ icon: 'moon', tone: 'violet', title: `Aim for ${sleepGoal}–${sleepGoal + 0.5} hours of sleep`, note: easy ? 'Half an hour more than usual tonight' : '', ask: 'What time should I go to bed tonight?' });
  return { lead, items };
}

/** Athena's take: readiness, the week's consistency, and what she'd do. */
function takeOf(readiness: HealthReadiness | null, program: TrainingProgram | null, targets: NutritionTargets | null): string[] {
  if (!readiness) return ['No scored recovery yet today, so I can’t read how your body is doing. Check back once WHOOP has scored the night.'];
  const past = program?.sessions.filter(s => s.date <= localDay() && s.kind !== 'rest') || [];
  const done = past.filter(s => s.status === 'done').length;
  const consistent = past.length ? done >= past.length - 1 ? 'you’ve been training consistently' : `you’ve done ${done} of ${past.length} sessions so far this week` : null;
  const sleep = (targets?.sleep_hours ?? 8);
  if (readiness.level === 'warning') return [readiness.reason];
  if (readiness.level === 'rest') return [
    `Your recovery is low today${consistent ? `, but ${consistent} and making progress` : ''}.`,
    `I’d take a lighter day, focus on mobility, good nutrition, and ${sleep + 0.5}–${sleep + 1} hours of sleep tonight.`,
  ];
  const next = program?.sessions.find(s => s.date === localDay() && s.status !== 'done');
  return [
    `${readiness.reason}${consistent ? ` And ${consistent}.` : ''}`,
    next ? `${next.title}${next.focus ? ` (${next.focus})` : ''} is on for today — go get it.` : 'A good day to push if you have something planned.',
  ];
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export function HealthOverview({ recovery, sleep, strain, weighIns, readiness, whoopNote, bodyNote, weightPlan, onAsk, onWorkouts }: Props) {
  const [range, setRange] = useState<RangeId>('today');
  const [plan, setPlan] = useState<HealthPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const [editing, setEditing] = useState<null | 'program' | 'food' | 'targets'>(null);
  const [foodOpen, setFoodOpen] = useState<FoodLogOpen>({ mode: 'list' });
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const load = useCallback(() => {
    healthPlanApi.overview().then(p => { setPlan(p); setPlanError(''); }).catch(e => setPlanError((e as Error).message || 'Your plan couldn’t load.'));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { workoutsApi.list(400).then(r => setWorkouts(r.workouts)).catch(() => setWorkouts([])); }, []);

  const days = RANGES.find(r => r.id === range)!.days;
  const today = recovery[0];
  const night = sleep[0];
  // Today's cycle is listed before WHOOP has scored it, so the newest row is
  // often empty; show the latest day that has a strain, and say which day.
  const cycle = strain.find(s => s.day_strain != null) ?? strain[0];
  const cycleIsOlder = cycle != null && strain[0] != null && cycle !== strain[0];
  const zone = recoveryZone(today?.recovery_score);
  const prior = recovery.slice(1, 8);
  const scoreDelta = today?.recovery_score != null && avg(prior.map(r => r.recovery_score)) != null ? today.recovery_score - avg(prior.map(r => r.recovery_score))! : null;
  const rhrDelta = today?.resting_heart_rate != null && avg(prior.map(r => r.resting_heart_rate)) != null ? today.resting_heart_rate - avg(prior.map(r => r.resting_heart_rate))! : null;
  const hrvDelta = today?.hrv_ms != null && avg(prior.map(r => r.hrv_ms)) != null ? today.hrv_ms - avg(prior.map(r => r.hrv_ms))! : null;
  const sleepDelta = night && sleep[1] ? night.hours_asleep - sleep[1].hours_asleep : null;
  // Tiles draw the window the range asks for, up to what WHOOP returned.
  const sparkDays = range === 'today' || range === '7d' ? 7 : 14;
  const series = <T,>(rows: T[], pick: (r: T) => number | null | undefined) => rows.slice(0, sparkDays).map(r => pick(r) ?? null).reverse();
  const strainWeek = Array.from({ length: 7 }, (_, i) => {
    const date = localDay(new Date(Date.now() - (6 - i) * DAY));
    return { date, value: strain.find(s => s.date === date)?.day_strain ?? null };
  });
  const program = plan?.program ?? null;
  const targets = plan?.targets ?? null;
  const food = plan?.nutrition ?? null;
  const { lead, items } = planFor(program, readiness, targets, food);
  const take = takeOf(readiness, program, targets);
  const wellness = wellnessOf(recovery, sleep);
  const whoopLinked = !whoopNote;
  // The phone's band, while it's being read, takes over from WHOOP's daily average.
  const live = useLiveHeartRate();
  const avgHr = cycle?.average_heart_rate != null ? Math.round(cycle.average_heart_rate) : null;
  const shownHr = live ?? avgHr;

  return <div className="hp">
    <PageHeader eyebrow="HEALTH & PERFORMANCE" title={<>Stronger for<br />what matters</>}
      blurb="More energy for your family, the field, and the life you want to live."
      art="/assets/heart.png"
      controls={<div className="hp-range" role="tablist" aria-label="Time range">
        {RANGES.map(r => <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'active' : ''} onClick={() => setRange(r.id)}>{r.label}</button>)}
      </div>}
      aside={<div className={`hp-avg-hr${live != null ? ' hp-live' : ''}`}>
        <Ecg bpm={shownHr} />
        <div><strong>{shownHr ?? '—'}<small> bpm</small></strong><span>{live != null ? <><i className="hp-live-dot" />Live Heart Rate</> : 'Avg Heart Rate'}</span></div>
      </div>}
      take={{ lines: take, ask: 'What do you make of how my body is doing today, and what should I do?', onAsk }} />

    {whoopNote && <div className="hp-source-note">{whoopNote}</div>}

    <section className="hp-tiles" aria-label="Today’s numbers">
      <button type="button" className="hp-tile" onClick={() => onAsk('Tell me about my recovery today.')}>
        <header><span className="hp-badge hp-green"><Icon name="heart" /></span>Recovery<Icon name="chevron" className="hp-chev" /></header>
        <Ring value={today?.recovery_score ?? null} max={100} color={zone?.color || '#35596b'} size={108} stroke={8}>
          <strong>{today?.recovery_score ?? '—'}</strong><small style={{ color: zone?.color }}>{zone?.word || (whoopLinked ? 'Not scored' : '')}</small>
        </Ring>
        <Delta value={scoreDelta === null ? null : Math.round((scoreDelta / Math.max(1, avg(prior.map(r => r.recovery_score)) || 1)) * 100)} unit="%" better="up" suffix="vs. 7-day avg" />
      </button>
      <button type="button" className="hp-tile" onClick={() => onAsk('How did I sleep last night?')}>
        <header><span className="hp-badge hp-violet"><Icon name="moon" /></span>Sleep<Icon name="chevron" className="hp-chev" /></header>
        <strong className="hp-big">{night ? hm(night.hours_asleep) : '—'}</strong>
        <p className="hp-sub">{night?.sleep_performance_percent != null ? `${night.sleep_performance_percent}% of need` : 'No sleep recorded'}</p>
        <div className="hp-bar"><i style={{ width: `${Math.min(100, night?.sleep_performance_percent ?? 0)}%` }} /></div>
        <Delta value={sleepDelta} unit="h" better="up" decimals={1} suffix="vs. last night" />
      </button>
      <button type="button" className="hp-tile" onClick={() => onAsk('How hard have I been pushing this week?')}>
        <header><span className="hp-badge hp-orange"><Icon name="run" /></span>Day Strain<Icon name="chevron" className="hp-chev" /></header>
        <strong className="hp-big">{cycle?.day_strain != null ? cycle.day_strain.toFixed(1) : '—'}</strong>
        <p className="hp-sub hp-strain-band">{strainBand(cycle?.day_strain) ? `${strainBand(cycle?.day_strain)}${cycleIsOlder ? ` · ${shortDate(cycle!.date)}` : ''}` : 'No strain recorded'}</p>
        <div className="hp-strain-bars">{strainWeek.map((d, i) => <span key={d.date} title={`${shortDate(d.date)}: ${d.value?.toFixed(1) ?? 'no data'}`}>
          <i className={i === 6 ? 'hp-today' : ''} style={{ height: `${d.value == null ? 4 : Math.max(8, (d.value / 21) * 100)}%` }} /><small>{noon(d.date).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'narrow' })}</small>
        </span>)}</div>
      </button>
      <button type="button" className="hp-tile" onClick={() => onAsk('What is my resting heart rate telling you?')}>
        <header><span className="hp-badge hp-red"><Icon name="heart" /></span>Resting HR<Icon name="chevron" className="hp-chev" /></header>
        <strong className="hp-big">{today?.resting_heart_rate != null ? Math.round(today.resting_heart_rate) : '—'}<small> bpm</small></strong>
        <Delta value={rhrDelta} unit=" bpm" better="down" suffix="vs. 7-day avg" />
        <Spark values={series(recovery, r => r.resting_heart_rate)} color="#3ec9ff" />
      </button>
      <button type="button" className="hp-tile" onClick={() => onAsk('What is my HRV telling you?')}>
        <header><span className="hp-badge hp-indigo"><Icon name="pulse" /></span>HRV<Icon name="chevron" className="hp-chev" /></header>
        <strong className="hp-big">{today?.hrv_ms != null ? Math.round(today.hrv_ms) : '—'}<small> ms</small></strong>
        <Delta value={hrvDelta} unit=" ms" better="up" suffix="vs. 7-day avg" />
        <Spark values={series(recovery, r => r.hrv_ms)} color="#a46bff" />
      </button>
    </section>

    {planError && <p className="dashboard-notice" role="status">{planError}</p>}

    <div className="hp-grid">
      <section className="hp-panel hp-plan">
        <header><h2>Today’s Plan</h2><span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></header>
        <button type="button" className="hp-plan-lead" onClick={() => onAsk(lead.ask)}>
          <span className="hp-badge hp-green hp-badge-lg"><Icon name={lead.icon} /></span>
          <div><strong>{lead.title}</strong><p>{lead.note}</p></div>
          <Icon name="chevron" className="hp-chev" />
        </button>
        <ul>{items.map(item => <li key={item.title}><button type="button" onClick={() => onAsk(item.ask)}>
          <span className={`hp-badge hp-badge-lg hp-${item.tone}`}><Icon name={item.icon} /></span>
          <div><strong>{item.title}</strong>{item.note && <small>{item.note}</small>}</div>
          <Icon name="chevron" className="hp-chev" />
        </button></li>)}</ul>
        {!program && plan && <button type="button" className="hp-link" onClick={() => setEditing('program')}>Set up a training program <Icon name="arrowRight" /></button>}
      </section>

      <div className="hp-stack">
        <ProgramWeek program={program} loading={!plan && !planError} onEdit={() => setEditing('program')} onMarked={p => setPlan(prev => prev && { ...prev, program: p })} onAsk={onAsk} onViewAll={onWorkouts} />
        <NutritionPanel food={food} targets={targets} loading={!plan && !planError} onOpen={o => { setFoodOpen(o); setEditing('food'); }} onTargets={() => setEditing('targets')} onChanged={n => setPlan(prev => prev && { ...prev, nutrition: n })} />
      </div>
    </div>

    <div className="hp-grid hp-grid-bottom">
      <Progress weighIns={weighIns} workouts={workouts} days={days} targets={targets} weightPlan={weightPlan} bodyNote={bodyNote} onTargets={() => setEditing('targets')} />
      <section className="hp-panel hp-wellness">
        <header><h2>Wellness</h2><button type="button" className="hp-link" onClick={() => onAsk('Give me a read on my overall wellness: energy, immune readiness, sleep and stress.')}>View details <Icon name="arrowRight" /></button></header>
        <ul>{wellness.map(w => <li key={w.label}><button type="button" onClick={() => onAsk(w.ask)} title={w.why}>
          <span className={`hp-badge hp-badge-lg hp-w-${w.icon}`}><Icon name={w.icon} /></span>
          <div><strong>{w.label}</strong><small>{w.why}</small></div>
          <em className={`hp-tone-${w.tone}`}>{w.word}</em>
          <span className={`hp-tone-dot hp-tone-${w.tone}`}><Icon name={w.tone === 'good' ? 'check' : w.tone === 'ok' ? 'minus' : w.tone === 'bad' ? 'down' : 'minus'} /></span>
        </button></li>)}</ul>
      </section>
    </div>

    {editing === 'program' && <ProgramEditor program={program} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    {editing === 'food' && <FoodLog food={food} open={foodOpen} onClose={() => setEditing(null)} onChanged={n => setPlan(prev => prev && { ...prev, nutrition: n })} />}
    {editing === 'targets' && <TargetsEditor targets={targets} onClose={() => setEditing(null)} onSaved={t => { setPlan(prev => prev && { ...prev, targets: t }); setEditing(null); }} />}
  </div>;
}

// ---------------------------------------------------------------------------
// Program week
// ---------------------------------------------------------------------------
function ProgramWeek({ program, loading, onEdit, onMarked, onAsk, onViewAll }: { program: TrainingProgram | null; loading: boolean; onEdit: () => void; onMarked: (p: TrainingProgram) => void; onAsk: (t: string) => void; onViewAll: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const viewAll = <button type="button" className="hp-link hp-view-all" onClick={onViewAll}>View all activities <Icon name="arrowRight" /></button>;
  if (!program) return <section className="hp-panel hp-program">
    <header><h2>Training Program</h2></header>
    {loading ? <p className="hp-empty">Loading your program…</p> : <div className="hp-empty">
      <p>No program set up. Lay out your week — gym days, runs, the soccer game — and Athena reads every day against it.</p>
      <button type="button" className="hp-link" onClick={onEdit}>Set up a program <Icon name="arrowRight" /></button>
    </div>}
    {viewAll}
  </section>;
  const today = localDay();
  const tomorrow = localDay(new Date(Date.now() + DAY));
  const next = program.sessions.find(s => s.date === tomorrow);
  // Monday on the far left, one column per day; a day with two sessions shows the first.
  const byDay = Array.from({ length: 7 }, (_, d) => program.sessions.filter(s => s.weekday === d));
  const mark = async (s: ProgramSession) => {
    if (s.date > today) return;
    setBusy(s.uuid);
    setError('');
    try {
      const status = s.status === 'done' ? (s.marked ? null : 'skipped') : s.status === 'skipped' ? null : 'done';
      onMarked((await healthPlanApi.mark(s.uuid, s.date, status)).program);
    } catch (e) {
      setError((e as Error).message || 'Couldn’t save that.');
    } finally { setBusy(null); }
  };
  return <section className="hp-panel hp-program">
    <header><h2>{program.name}</h2><button type="button" className="hp-link" onClick={onEdit}>{program.before_start ? `Starts ${shortDate(program.starts_on)}` : program.ended ? 'Program complete' : `Week ${program.week_number} of ${program.weeks}`} <Icon name="arrowRight" /></button></header>
    <div className="hp-week">{byDay.map((list, d) => {
      const s = list[0];
      const date = localDay(new Date(Date.parse(`${program.week_of}T12:00:00`) + d * DAY));
      if (!s) return <div key={d} className={`hp-day hp-day-empty${date === today ? ' hp-day-today' : ''}`}><small>{WEEKDAYS[d]}</small><small>{shortDate(date)}</small><span className="hp-day-icon"><Icon name="rest" /></span><strong>Rest</strong></div>;
      const done = s.status === 'done';
      return <button key={d} type="button" disabled={busy === s.uuid || s.date > today}
        className={`hp-day hp-day-${s.status}${s.date === today ? ' hp-day-today' : ''}`}
        title={s.date > today ? `${s.title}${s.exercises.length ? `: ${s.exercises.join(', ')}` : ''}` : done ? (s.marked ? 'Done — tap to mark skipped' : `Recorded by WHOOP (${s.recorded?.sport}) — tap to mark skipped`) : s.status === 'skipped' ? 'Skipped — tap to clear' : 'Tap to mark done'}
        onClick={() => void mark(s)}>
        <small>{WEEKDAYS[d]}</small><small>{shortDate(s.date)}</small>
        <span className="hp-day-icon">{done ? <Icon name="check" className="hp-done" /> : <Icon name={sessionIcon(s)} />}</span>
        <strong>{s.title}</strong><small>{s.focus || s.detail || ''}</small>
        {list.length > 1 && <em>+{list.length - 1}</em>}
      </button>;
    })}</div>
    {error && <p className="hp-error" role="status">{error}</p>}
    {next && <button type="button" className="hp-next" onClick={() => onAsk(`Walk me through tomorrow's ${next.title} session.`)}>
      <small>Next up tomorrow</small>
      <span className="hp-next-row"><Icon name={sessionIcon(next)} className="hp-next-icon" /><span><strong>{next.title}{next.focus ? ` (${next.focus})` : ''}</strong><small>{next.exercises.length ? next.exercises.join(' · ') : next.detail || ''}</small></span><Icon name="chevron" className="hp-chev" /></span>
    </button>}
    {viewAll}
  </section>;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------
const MACROS = [
  { key: 'calories', target: 'calories', label: 'Calories', unit: '', color: '#2fe0a0' },
  { key: 'protein_g', target: 'protein_g', label: 'Protein', unit: ' g', color: '#3aa6ff' },
  { key: 'carbs_g', target: 'carbs_g', label: 'Carbs', unit: ' g', color: '#ff6b4a' },
  { key: 'fat_g', target: 'fat_g', label: 'Fat', unit: ' g', color: '#f6c33a' },
] as const;
/** What the food log opens on: the list, the manual form, or a just-scanned entry to check. */
type FoodLogOpen = { mode: 'list' | 'manual' } | { mode: 'check'; uuid: string; note: string };

/**
 * A barcode in the photo, read on the phone where the browser can (Android's
 * BarcodeDetector). Null when it can't or there isn't one — the server's
 * vision model then looks at the photo instead.
 */
async function readBarcode(file: Blob): Promise<string | null> {
  const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: ImageBitmap) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const found = await new Detector({ formats: ['ean_13', 'ean_8', 'upc_a'] }).detect(bitmap);
      return found.find(b => /^\d{8,14}$/.test(b.rawValue))?.rawValue ?? null;
    } finally { bitmap.close?.(); }
  } catch { return null; }
}

const kcalOf = (f: { calories: number | null }) => (f.calories != null ? `${f.calories} kcal` : '');

function NutritionPanel({ food, targets, loading, onOpen, onTargets, onChanged }: { food: NutritionDay | null; targets: NutritionTargets | null; loading: boolean; onOpen: (o: FoodLogOpen) => void; onTargets: () => void; onChanged: (n: NutritionDay) => void }) {
  const [menu, setMenu] = useState(false);
  // "Tell Athena" turns the menu into a one-line box: what you ate, in your words.
  const [telling, setTelling] = useState(false);
  const [told, setTold] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!menu) { setTelling(false); return; }
    const away = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [menu]);
  const favorites = food?.favorites || [];
  const logFavorite = async (uuid: string) => {
    setMenu(false); setBusy('Logging…'); setError('');
    try { onChanged((await healthPlanApi.logFavorite(uuid)).nutrition); } catch (e) { setError((e as Error).message || 'Couldn’t log that.'); } finally { setBusy(null); }
  };
  const scan = async (file: File) => {
    setBusy('Athena is looking…'); setError('');
    try {
      const [barcode, { base64 }] = await Promise.all([readBarcode(file), downscale(file, 1280, 0.85)]);
      const r = await healthPlanApi.scan({ barcode, imageBase64: base64, mimeType: 'image/jpeg' });
      onChanged(r.nutrition);
      onOpen({ mode: 'check', uuid: r.entry.uuid, note: r.note });
    } catch (e) { setError((e as Error).message || 'Athena couldn’t read that photo.'); } finally { setBusy(null); }
  };
  const describe = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = told.trim();
    if (!text) return;
    setMenu(false); setBusy('Athena is looking it up…'); setError('');
    try {
      const r = await healthPlanApi.describe(text);
      setTold('');
      onChanged(r.nutrition);
      onOpen({ mode: 'check', uuid: r.entry.uuid, note: r.note });
    } catch (err) { setError((err as Error).message || 'Athena couldn’t look that up.'); } finally { setBusy(null); }
  };
  return <section className="hp-panel hp-nutrition">
    <header><h2><Icon name="food" className="hp-amber-text" /> Nutrition</h2><button type="button" className="hp-link" onClick={() => onOpen({ mode: 'list' })}>Today <Icon name="arrowRight" /></button></header>
    {loading ? <p className="hp-empty">Loading…</p> : <>
      <div className="hp-rings">{MACROS.map(m => {
        const v = food?.totals[m.key] ?? 0;
        const t = targets?.[m.target] ?? null;
        return <div key={m.key} className="hp-macro">
          <Ring value={v} max={t ?? 0} color={m.color} size={96} stroke={7}>
            <strong>{Math.round(v).toLocaleString()}</strong><small>{t ? `/ ${t.toLocaleString()}${m.unit}` : m.unit.trim() || 'kcal'}</small>
          </Ring>
          <span>{m.label}</span>
        </div>;
      })}</div>
      <div className="hp-nutrition-actions">
        <div className="hp-menu-wrap" ref={menuRef}>
          <button type="button" aria-haspopup="menu" aria-expanded={menu} disabled={!!busy} onClick={() => setMenu(m => !m)}><Icon name="plus" /> {busy || 'Log food'} <Icon name="down" className="hp-caret" /></button>
          {menu && telling && <form className="hp-menu hp-tell" onSubmit={describe}>
            <label htmlFor="hp-tell-input">Tell Athena what you ate</label>
            <input id="hp-tell-input" autoFocus value={told} onChange={e => setTold(e.target.value)} placeholder="Big Mac from McDonald’s" maxLength={200} enterKeyHint="send" />
            <div><button type="button" className="hp-link" onClick={() => setTelling(false)}>Back</button><button type="submit" className="dashboard-chat-cta" disabled={!told.trim()}>Log it <span>↗</span></button></div>
          </form>}
          {menu && !telling && <div className="hp-menu" role="menu">
            <small className="hp-menu-head">Favorites</small>
            {favorites.length ? favorites.map(f => <button key={f.uuid} type="button" role="menuitem" onClick={() => void logFavorite(f.uuid)}>
              <Icon name="star" className="hp-star-on" /><span>{f.label}</span><em>{kcalOf(f)}</em>
            </button>) : <p className="hp-menu-empty">Star a food in Today’s list to keep it here.</p>}
            <hr />
            <button type="button" role="menuitem" onClick={() => setTelling(true)}><Icon name="speech" /><span>Tell Athena<small>“Big Mac from McDonald’s”</small></span></button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); cameraRef.current?.click(); }}><Icon name="camera" /><span>Take a picture<small>The food or its barcode</small></span></button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onOpen({ mode: 'manual' }); }}><Icon name="pencil" /><span>Manual entry</span></button>
          </div>}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void scan(f); }} />
        </div>
        <button type="button" className="hp-push-right" onClick={onTargets}>{targets ? 'Targets' : 'Set targets'}</button>
      </div>
      {error && <p className="hp-error" role="status">{error}</p>}
    </>}
  </section>;
}

function Modal({ title, eyebrow, onClose, children, wide }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return <div className="health-modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="health-modal-backdrop" onClick={onClose} />
    <div className={`health-modal-card hp-modal${wide ? ' hp-modal-wide' : ''}`}>
      <header><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" className="health-modal-close" aria-label="Close" onClick={onClose}>✕</button></header>
      {children}
    </div>
  </div>;
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const FOOD_BLANK = { label: '', serving: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', water_oz: '' };
type FoodDraft = typeof FOOD_BLANK;
const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));
const draftOf = (e: NutritionEntry): FoodDraft => ({ label: e.label, serving: e.serving || '', calories: str(e.calories), protein_g: str(e.protein_g), carbs_g: str(e.carbs_g), fat_g: str(e.fat_g), water_oz: str(e.water_oz) });
const foodOfDraft = (d: FoodDraft) => ({ label: d.label, serving: d.serving.trim() || null, calories: numOrNull(d.calories), protein_g: numOrNull(d.protein_g), carbs_g: numOrNull(d.carbs_g), fat_g: numOrNull(d.fat_g), water_oz: numOrNull(d.water_oz) });
const SOURCE_TAG: Partial<Record<EntrySource, string>> = { photo: 'Photo estimate', barcode: 'Barcode', favorite: 'Favorite', described: 'Told Athena' };

/** The food fields shared by the manual form and an entry being corrected. */
function FoodFields({ draft, setDraft }: { draft: FoodDraft; setDraft: (f: (d: FoodDraft) => FoodDraft) => void }) {
  const set = (k: keyof FoodDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft(d => ({ ...d, [k]: e.target.value }));
  return <>
    <label className="hp-span">What was it<input value={draft.label} onChange={set('label')} placeholder="Chicken rice bowl" maxLength={120} /></label>
    <label className="hp-span">Serving<input value={draft.serving} onChange={set('serving')} placeholder="1 bowl" maxLength={60} /></label>
    <label>Calories<input inputMode="numeric" value={draft.calories} onChange={set('calories')} /></label>
    <label>Protein g<input inputMode="decimal" value={draft.protein_g} onChange={set('protein_g')} /></label>
    <label>Carbs g<input inputMode="decimal" value={draft.carbs_g} onChange={set('carbs_g')} /></label>
    <label>Fat g<input inputMode="decimal" value={draft.fat_g} onChange={set('fat_g')} /></label>
    <label>Water oz<input inputMode="decimal" value={draft.water_oz} onChange={set('water_oz')} /></label>
  </>;
}

function FoodLog({ food, open, onClose, onChanged }: { food: NutritionDay | null; open: FoodLogOpen; onClose: () => void; onChanged: (n: NutritionDay) => void }) {
  const [draft, setDraft] = useState(FOOD_BLANK);
  const [star, setStar] = useState(false);
  const [editing, setEditing] = useState<{ uuid: string; draft: FoodDraft } | null>(null);
  const [note, setNote] = useState(open.mode === 'check' ? open.note : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // The manual form stays folded behind "New record" unless the menu's Manual entry opened it.
  const [adding, setAdding] = useState(open.mode === 'manual');
  const manualRef = useRef<HTMLFormElement>(null);
  // The day being looked at: today by default, paged back with the arrows, never past today.
  const today = localDay();
  const [date, setDate] = useState(food?.date || today);
  const [past, setPast] = useState<NutritionDay | null>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const isToday = date >= today;
  const shown = isToday ? food : past?.date === date ? past : null;
  const entries = shown?.entries || [];
  const loadDay = useCallback(async (d: string) => {
    setLoadingDay(true); setError('');
    try { setPast((await healthPlanApi.day(d)).nutrition); } catch (err) { setError((err as Error).message || 'Couldn’t load that day.'); } finally { setLoadingDay(false); }
  }, []);
  const go = (days: number) => {
    const next = localDay(new Date(Date.parse(`${date}T12:00:00`) + days * DAY));
    if (next > today) return;
    setDate(next); setEditing(null); setNote('');
    if (next < today) void loadDay(next);
  };
  // A just-scanned entry opens ready to correct; the manual option jumps to the form.
  useEffect(() => {
    if (open.mode === 'check') {
      const e = entries.find(x => x.uuid === open.uuid);
      if (e) setEditing({ uuid: e.uuid, draft: draftOf(e) });
    } else if (open.mode === 'manual') {
      manualRef.current?.scrollIntoView({ block: 'nearest' });
      manualRef.current?.querySelector('input')?.focus();
    }
    // Only on open: later list changes shouldn't re-open an editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Every change answers with today's log (the card's); a past day is then re-read for the list.
  const run = async (key: string, fn: () => Promise<{ nutrition: NutritionDay }>, fallback: string) => {
    setBusy(key); setError('');
    try {
      onChanged((await fn()).nutrition);
      if (!isToday) await loadDay(date);
      return true;
    } catch (err) { setError((err as Error).message || fallback); return false; } finally { setBusy(null); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('add', () => healthPlanApi.addEntry({ ...foodOfDraft(draft), eaten_on: date, source: 'manual', favorite: star }), 'Couldn’t log that.')) { setDraft(FOOD_BLANK); setStar(false); setAdding(false); }
  };
  const dayLabel = noon(date).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (await run(editing.uuid, () => healthPlanApi.updateEntry(editing.uuid, foodOfDraft(editing.draft)), 'Couldn’t save that.')) { setEditing(null); setNote(''); }
  };
  const toggleStar = (e: NutritionEntry) => run(`star-${e.uuid}`, () => (e.favorite
    ? healthPlanApi.removeFavorite(e.favorite)
    : healthPlanApi.saveFavorite({ label: e.label, serving: e.serving, calories: e.calories, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, water_oz: e.water_oz, barcode: e.barcode })), 'Couldn’t change that favorite.');
  const remove = async (uuid: string) => {
    if (await run(uuid, () => healthPlanApi.removeEntry(uuid), 'Couldn’t remove that.') && editing?.uuid === uuid) { setEditing(null); setNote(''); }
  };
  const t = shown?.totals;
  return <Modal title={isToday ? 'Today’s food' : 'Food log'} eyebrow="NUTRITION · WHAT YOU LOGGED" onClose={onClose} wide>
    <div className="hp-day-nav">
      <button type="button" aria-label="Previous day" disabled={!!busy || loadingDay} onClick={() => go(-1)}><Icon name="chevronLeft" /></button>
      <div><strong>{isToday ? 'Today' : dayLabel}</strong><small>{isToday ? dayLabel : t ? `${Math.round(t.calories).toLocaleString()} kcal · P ${Math.round(t.protein_g)} g · C ${Math.round(t.carbs_g)} g · F ${Math.round(t.fat_g)} g` : ' '}</small></div>
      <button type="button" aria-label="Next day" disabled={isToday || !!busy || loadingDay} onClick={() => go(1)}><Icon name="chevron" /></button>
    </div>
    {note &&<p className="hp-scan-note" role="status"><Icon name={/^Found/.test(note) ? 'barcode' : /^Logged/.test(note) ? 'speech' : 'camera'} />{note} Check it, fix anything that’s off, or remove it.</p>}
    {entries.length ? <ul className="hp-food-list">{entries.map(e => <li key={e.uuid} className={editing?.uuid === e.uuid ? 'hp-food-editing' : ''}>
      {editing?.uuid === e.uuid ? <form className="hp-form hp-food-edit" onSubmit={save}>
        <FoodFields draft={editing.draft} setDraft={f => setEditing(x => x && { ...x, draft: f(x.draft) })} />
        <div className="hp-span hp-form-actions">
          <button type="button" className="hp-link hp-danger" disabled={!!busy} onClick={() => void remove(e.uuid)}>Remove</button>
          <button type="button" className="hp-link" onClick={() => { setEditing(null); setNote(''); }}>Cancel</button>
          <button type="submit" className="dashboard-chat-cta" disabled={!!busy}>{busy === e.uuid ? 'Saving…' : 'Save'} <span>↗</span></button>
        </div>
      </form> : <>
        <button type="button" className={`hp-food-star${e.favorite ? ' hp-star-on' : ''}`} aria-pressed={!!e.favorite} disabled={!!busy} aria-label={e.favorite ? `Remove ${e.label} from favorites` : `Add ${e.label} to favorites`} title={e.favorite ? 'In favorites' : 'Add to favorites'} onClick={() => void toggleStar(e)}><Icon name="star" /></button>
        <div><strong>{e.label}{e.source && SOURCE_TAG[e.source] && <em className={`hp-food-tag hp-food-tag-${e.source}`}>{SOURCE_TAG[e.source]}</em>}</strong>
          <small>{[e.serving, kcalOf(e), e.protein_g != null && `P ${e.protein_g} g`, e.carbs_g != null && `C ${e.carbs_g} g`, e.fat_g != null && `F ${e.fat_g} g`, e.water_oz != null && `${e.water_oz} oz water`].filter(Boolean).join(' · ')}</small></div>
        <button type="button" aria-label={`Edit ${e.label}`} disabled={!!busy} onClick={() => setEditing({ uuid: e.uuid, draft: draftOf(e) })}><Icon name="pencil" /></button>
        <button type="button" aria-label={`Remove ${e.label}`} disabled={!!busy} onClick={() => void remove(e.uuid)}>✕</button>
      </>}
    </li>)}</ul> : <p className="hp-empty">{loadingDay ? 'Loading…' : isToday ? 'Nothing logged yet today.' : 'Nothing logged that day.'}</p>}
    {(editing || !adding) && error && <p className="hp-error" role="status">{error}</p>}
    {!editing && !adding && <button type="button" className="hp-new-record" disabled={loadingDay} onClick={() => setAdding(true)}><Icon name="plus" /> New record{isToday ? '' : ` for ${noon(date).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })}`}</button>}
    <form ref={manualRef} className="hp-form" hidden={!!editing || !adding} onSubmit={add}>
      <h3 className="hp-span hp-form-head">New record{isToday ? '' : ` · ${dayLabel}`}</h3>
      <FoodFields draft={draft} setDraft={setDraft} />
      <label className="hp-span hp-check"><input type="checkbox" checked={star} onChange={e => setStar(e.target.checked)} /> Save to favorites</label>
      {error && <p className="hp-error hp-span" role="status">{error}</p>}
      <div className="hp-span hp-form-actions">
        <button type="button" className="hp-link" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
        <button type="submit" className="dashboard-chat-cta" disabled={!!busy}>{busy === 'add' ? 'Logging…' : 'Log it'} <span>↗</span></button>
      </div>
    </form>
  </Modal>;
}

function TargetsEditor({ targets, onClose, onSaved }: { targets: NutritionTargets | null; onClose: () => void; onSaved: (t: NutritionTargets) => void }) {
  const str = (v: number | null | undefined, f = (x: number) => String(x)) => (v == null ? '' : f(v));
  const [draft, setDraft] = useState({
    calories: str(targets?.calories), protein_g: str(targets?.protein_g), carbs_g: str(targets?.carbs_g), fat_g: str(targets?.fat_g),
    water_oz: str(targets?.water_oz), sleep_hours: str(targets?.sleep_hours),
    low_lb: str(targets?.target_weight_low_kg, kg => String(Math.round(lbOf(kg)))), high_lb: str(targets?.target_weight_high_kg, kg => String(Math.round(lbOf(kg)))),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft(d => ({ ...d, [k]: e.target.value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const lb = (s: string) => { const n = numOrNull(s); return n == null ? null : Math.round(kgOf(n) * 100) / 100; };
    try {
      onSaved((await healthPlanApi.saveTargets({
        calories: numOrNull(draft.calories), protein_g: numOrNull(draft.protein_g), carbs_g: numOrNull(draft.carbs_g), fat_g: numOrNull(draft.fat_g),
        water_oz: numOrNull(draft.water_oz), sleep_hours: numOrNull(draft.sleep_hours), target_weight_low_kg: lb(draft.low_lb), target_weight_high_kg: lb(draft.high_lb),
      })).targets);
    } catch (err) { setError((err as Error).message || 'Couldn’t save those.'); setBusy(false); }
  };
  return <Modal title="Daily targets" eyebrow="WHAT A GOOD DAY ADDS UP TO" onClose={onClose}>
    <form className="hp-form" onSubmit={save}>
      <label>Calories<input inputMode="numeric" value={draft.calories} onChange={set('calories')} /></label>
      <label>Protein g<input inputMode="numeric" value={draft.protein_g} onChange={set('protein_g')} /></label>
      <label>Carbs g<input inputMode="numeric" value={draft.carbs_g} onChange={set('carbs_g')} /></label>
      <label>Fat g<input inputMode="numeric" value={draft.fat_g} onChange={set('fat_g')} /></label>
      <label>Water oz<input inputMode="numeric" value={draft.water_oz} onChange={set('water_oz')} /></label>
      <label>Sleep hours<input inputMode="decimal" value={draft.sleep_hours} onChange={set('sleep_hours')} /></label>
      <label>Target weight from (lb)<input inputMode="decimal" value={draft.low_lb} onChange={set('low_lb')} /></label>
      <label>to (lb)<input inputMode="decimal" value={draft.high_lb} onChange={set('high_lb')} /></label>
      <p className="health-modal-hint hp-span">Leave any blank to have no target for it.</p>
      {error && <p className="hp-error hp-span" role="status">{error}</p>}
      <div className="hp-span hp-form-actions"><button type="submit" className="dashboard-chat-cta" disabled={busy}>{busy ? 'Saving…' : 'Save targets'} <span>↗</span></button></div>
    </form>
  </Modal>;
}

const KINDS: { id: SessionKind; label: string }[] = [
  { id: 'gym', label: 'Gym' }, { id: 'run', label: 'Run' }, { id: 'ride', label: 'Ride' }, { id: 'sport', label: 'Sport' },
  { id: 'recovery', label: 'Recovery' }, { id: 'rest', label: 'Rest' }, { id: 'other', label: 'Other' },
];
type DraftSession = { weekday: number; kind: SessionKind; title: string; focus: string; detail: string; exercises: string };
function ProgramEditor({ program, onClose, onSaved }: { program: TrainingProgram | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(program?.name || '');
  const [goal, setGoal] = useState(program?.goal || '');
  const [weeks, setWeeks] = useState(String(program?.weeks || 12));
  const [startsOn, setStartsOn] = useState(program?.starts_on || localDay());
  const [sessions, setSessions] = useState<DraftSession[]>(() => Array.from({ length: 7 }, (_, d) => {
    const s = program?.sessions.find(x => x.weekday === d);
    return s ? { weekday: d, kind: s.kind, title: s.title, focus: s.focus || '', detail: s.detail || '', exercises: s.exercises.join(', ') } : { weekday: d, kind: 'rest', title: '', focus: '', detail: '', exercises: '' };
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setAt = (d: number, patch: Partial<DraftSession>) => setSessions(list => list.map(s => (s.weekday === d ? { ...s, ...patch } : s)));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const draft: ProgramDraft = {
      name, goal: goal || null, starts_on: startsOn, weeks: Number(weeks),
      sessions: sessions.filter(s => s.kind !== 'rest' || s.title.trim()).map(s => ({
        weekday: s.weekday, kind: s.kind, title: s.title.trim() || KINDS.find(k => k.id === s.kind)!.label,
        focus: s.focus.trim() || null, detail: s.detail.trim() || null, exercises: s.exercises.split(',').map(x => x.trim()).filter(Boolean),
      })),
    };
    try { await healthPlanApi.saveProgram(draft); onSaved(); } catch (err) { setError((err as Error).message || 'Couldn’t save that program.'); setBusy(false); }
  };
  const end = async () => {
    setBusy(true);
    try { await healthPlanApi.endProgram(); onSaved(); } catch (err) { setError((err as Error).message || 'Couldn’t end it.'); setBusy(false); }
  };
  return <Modal title={program ? 'Edit program' : 'New program'} eyebrow="TRAINING · YOUR WEEKLY PATTERN" onClose={onClose} wide>
    <form className="hp-form" onSubmit={save}>
      <label className="hp-span">Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Hypertrophy Program" maxLength={80} required /></label>
      <label className="hp-span">Goal<input value={goal} onChange={e => setGoal(e.target.value)} placeholder="Add lean mass, keep the legs for soccer" maxLength={255} /></label>
      <label>Starts<input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} required /></label>
      <label>Weeks<input inputMode="numeric" value={weeks} onChange={e => setWeeks(e.target.value)} required /></label>
      <div className="hp-span hp-week-editor">{sessions.map(s => <fieldset key={s.weekday}>
        <legend>{WEEKDAYS[s.weekday]}</legend>
        <select aria-label={`${WEEKDAYS[s.weekday]} kind`} value={s.kind} onChange={e => setAt(s.weekday, { kind: e.target.value as SessionKind })}>{KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        <input aria-label={`${WEEKDAYS[s.weekday]} title`} value={s.title} onChange={e => setAt(s.weekday, { title: e.target.value })} placeholder={s.kind === 'rest' ? 'Rest' : 'Gym A'} maxLength={60} />
        <input aria-label={`${WEEKDAYS[s.weekday]} focus`} value={s.focus} onChange={e => setAt(s.weekday, { focus: e.target.value })} placeholder="Upper" maxLength={60} />
        <input aria-label={`${WEEKDAYS[s.weekday]} detail`} value={s.detail} onChange={e => setAt(s.weekday, { detail: e.target.value })} placeholder="3–5 miles" maxLength={255} />
        <input className="hp-exercises" aria-label={`${WEEKDAYS[s.weekday]} exercises`} value={s.exercises} onChange={e => setAt(s.weekday, { exercises: e.target.value })} placeholder="Exercises, comma separated" />
      </fieldset>)}</div>
      <p className="health-modal-hint hp-span">A session ticks itself when WHOOP records a matching workout that day (lifting for gym, running for a run, cycling for a ride). Tap a day on the page to mark it yourself.</p>
      {error && <p className="hp-error hp-span" role="status">{error}</p>}
      <div className="hp-span hp-form-actions">
        {program && <button type="button" className="hp-link hp-danger" disabled={busy} onClick={() => void end()}>End this program</button>}
        <button type="submit" className="dashboard-chat-cta" disabled={busy}>{busy ? 'Saving…' : program ? 'Save as a new block' : 'Start program'} <span>↗</span></button>
      </div>
    </form>
  </Modal>;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
type ProgressTab = 'weight' | 'fat' | 'strength' | 'cardio';
const CARDIO = /running|cycling|biking|spin|rowing|swimming|soccer|hiking|walking|elliptical|stairmaster|hiit/;
function Progress({ weighIns, workouts, days, targets, weightPlan, bodyNote, onTargets }: { weighIns: WeighIn[]; workouts: Workout[] | null; days: number; targets: NutritionTargets | null; weightPlan?: { value: number; title: string } | null; bodyNote: ReactNode; onTargets: () => void }) {
  const [tab, setTab] = useState<ProgressTab>('weight');
  const since = Date.now() - days * DAY;
  const points = useMemo(() => {
    if (tab === 'weight' || tab === 'fat') {
      return [...weighIns].filter(w => Date.parse(w.at) >= since).reverse()
        .map(w => ({ date: new Date(w.at).toLocaleDateString('en-CA'), value: tab === 'weight' ? lbOf(w.weight_kg) : w.body_fat_percent }))
        .filter((p): p is { date: string; value: number } => p.value != null);
    }
    // Strength and cardio: minutes a week (a day at a time for a week's range).
    const rows = (workouts || []).filter(w => noon(w.date).getTime() >= since - DAY && (tab === 'strength' ? /lifting|strength|functional|crossfit/.test(w.sport || '') : CARDIO.test(w.sport || '')));
    const bucket = days <= 7 ? 1 : 7;
    const n = Math.max(1, Math.ceil(days / bucket));
    return Array.from({ length: n }, (_, i) => {
      const end = Date.now() - (n - 1 - i) * bucket * DAY;
      const start = end - bucket * DAY;
      const value = rows.filter(w => { const t = noon(w.date).getTime(); return t > start && t <= end; }).reduce((a, w) => a + w.minutes, 0);
      return { date: localDay(new Date(end)), value };
    });
  }, [tab, weighIns, workouts, since, days]);
  const latest = weighIns[0];
  const weekAgo = weighIns.find(w => Date.parse(w.at) <= Date.now() - 6.5 * DAY);
  const headline = tab === 'weight' ? (latest ? `${lbOf(latest.weight_kg).toFixed(1)} lb` : '—')
    : tab === 'fat' ? (latest?.body_fat_percent != null ? `${latest.body_fat_percent.toFixed(1)} %` : '—')
      : `${Math.round(points.reduce((a, p) => a + p.value, 0))} min`;
  const change = tab === 'weight' && latest && weekAgo ? { v: lbOf(latest.weight_kg) - lbOf(weekAgo.weight_kg), unit: ' lb', span: '7d' }
    : tab === 'fat' && latest?.body_fat_percent != null && weekAgo?.body_fat_percent != null ? { v: latest.body_fat_percent - weekAgo.body_fat_percent, unit: ' %', span: '7d' }
      : null;
  const unitNote = tab === 'strength' ? `lifting, minutes per ${days <= 7 ? 'day' : 'week'}` : tab === 'cardio' ? `cardio, minutes per ${days <= 7 ? 'day' : 'week'}` : null;
  const lean = latest?.fat_free_mass_kg != null ? lbOf(latest.fat_free_mass_kg) : null;
  const lowLb = targets?.target_weight_low_kg != null ? lbOf(targets.target_weight_low_kg) : null;
  const highLb = targets?.target_weight_high_kg != null ? lbOf(targets.target_weight_high_kg) : null;
  const weightNow = latest ? lbOf(latest.weight_kg) : null;
  // How far along the way to the target range: from where the window began.
  const startLb = weighIns.length ? lbOf(weighIns[weighIns.length - 1].weight_kg) : null;
  const targetMid = lowLb != null ? (lowLb + (highLb ?? lowLb)) / 2 : null;
  const towardTarget = weightNow != null && startLb != null && targetMid != null && targetMid !== startLb ? Math.max(0, Math.min(1, (weightNow - startLb) / (targetMid - startLb))) : null;
  const oldestOnRecord = weighIns.length ? Math.round((Date.now() - Date.parse(weighIns[weighIns.length - 1].at)) / DAY) : 0;

  return <section className="hp-panel hp-progress" id="health-progress">
    <header><h2>Progress</h2><a className="hp-link" href="#health-details" onClick={e => { e.preventDefault(); document.getElementById('health-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>View details <Icon name="arrowRight" /></a></header>
    <div className="hp-tabs" role="tablist">
      {([['weight', 'Weight'], ['fat', 'Body Fat'], ['strength', 'Strength'], ['cardio', 'Cardio']] as const).map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div className="hp-progress-body">
      <div className="hp-progress-chart">
        <p className="hp-progress-head"><strong>{headline}</strong>{change && <span className={Math.abs(change.v) < .05 ? '' : 'hp-good'}>{change.v >= 0 ? '+' : '−'}{Math.abs(change.v).toFixed(1)}{change.unit} ({change.span})</span>}{unitNote && <small>{unitNote}</small>}</p>
        {(tab === 'weight' || tab === 'fat') && bodyNote ? bodyNote
          : (tab === 'strength' || tab === 'cardio') && workouts === null ? <p className="hp-empty">Loading workouts…</p>
            : points.length < 2 ? <p className="hp-empty">Not enough {tab === 'weight' || tab === 'fat' ? 'weigh-ins' : 'workouts'} in this window yet.</p>
              : <LineChart points={points} goal={tab === 'weight' ? weightPlan?.value ?? null : null} bars={tab === 'strength' || tab === 'cardio'} />}
        {(tab === 'weight' || tab === 'fat') && days > oldestOnRecord + 7 && weighIns.length > 0 && <p className="hp-footnote">Scale history on record reaches back {oldestOnRecord} days.</p>}
      </div>
      <aside className="hp-progress-side">
        <div><small>Body Fat</small><strong>{latest?.body_fat_percent != null ? `${latest.body_fat_percent.toFixed(1)} %` : '—'}</strong><div className="hp-bar hp-bar-thin"><i style={{ width: `${Math.min(100, ((latest?.body_fat_percent ?? 0) / 30) * 100)}%` }} /></div></div>
        <div><small>Lean Mass</small><strong>{lean != null ? `${lean.toFixed(1)} lb` : '—'}</strong><div className="hp-bar hp-bar-thin"><i style={{ width: `${lean != null && weightNow ? (lean / weightNow) * 100 : 0}%` }} /></div></div>
        <div><small>Target Weight</small>{lowLb != null ? <><strong>{Math.round(lowLb)}{highLb != null && Math.round(highLb) !== Math.round(lowLb) ? ` – ${Math.round(highLb)}` : ''} lb</strong><div className="hp-bar hp-bar-thin hp-bar-violet"><i style={{ width: `${(towardTarget ?? 0) * 100}%` }} /></div></>
          : <button type="button" className="hp-link" onClick={onTargets}>Set a target <Icon name="arrowRight" /></button>}</div>
      </aside>
    </div>
  </section>;
}

function LineChart({ points, goal, bars }: { points: { date: string; value: number }[]; goal: number | null; bars?: boolean }) {
  const w = 460, h = 220, left = 44, bottom = 28, top = 10;
  const values = points.map(p => p.value).concat(goal != null ? [goal] : []);
  let lo = bars ? 0 : Math.floor(Math.min(...values) - 1);
  let hi = Math.ceil(Math.max(...values) + (bars ? 0 : 1));
  if (hi === lo) hi = lo + 1;
  // Round the axis to steps a person reads at a glance.
  const step = (hi - lo) / 3 > 10 ? Math.ceil((hi - lo) / 30) * 10 : Math.max(1, Math.ceil((hi - lo) / 3));
  lo = bars ? 0 : Math.floor(lo / step) * step;
  hi = lo + step * 3;
  const x = (i: number) => left + (i * (w - left - 8)) / Math.max(1, points.length - 1);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map(i => lo + step * i);
  const labelAt = [0, Math.round((points.length - 1) / 3), Math.round((2 * (points.length - 1)) / 3), points.length - 1];
  const barW = Math.max(3, Math.min(22, (w - left) / points.length - 4));
  return <svg className="hp-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Progress chart">
    <defs><linearGradient id="hpFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2a8cff" stopOpacity=".35" /><stop offset="1" stopColor="#2a8cff" stopOpacity="0" /></linearGradient></defs>
    {ticks.map(t => <g key={t}><line x1={left} x2={w - 4} y1={y(t)} y2={y(t)} stroke="#1d3443" /><text x={left - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
    {bars ? points.map((p, i) => <rect key={p.date} x={x(i) - barW / 2} y={y(p.value)} width={barW} height={Math.max(0, y(lo) - y(p.value))} rx="2" fill="#3aa6ff" opacity={p.value ? .9 : .25}><title>{`${shortDate(p.date)}: ${Math.round(p.value)} min`}</title></rect>)
      : <>
        <path d={`${path} L${x(points.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`} fill="url(#hpFill)" />
        <path d={path} fill="none" stroke="#3aa6ff" strokeWidth="2" />
        {points.map((p, i) => <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.value)} r="3" fill="#7cc8ff"><title>{`${shortDate(p.date)}: ${p.value.toFixed(1)}`}</title></circle>)}
      </>}
    {goal != null && <line x1={left} x2={w - 4} y1={y(goal)} y2={y(goal)} stroke="#a46bff" strokeDasharray="5 4" />}
    {[...new Set(labelAt)].map(i => <text key={i} x={x(i)} y={h - 4} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{shortDate(points[i].date)}</text>)}
  </svg>;
}
