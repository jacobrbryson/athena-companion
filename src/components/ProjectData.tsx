import { useEffect, useState } from 'react';
import {
  projectsApi, type BoundData, type CalendarData, type Project, type SourceType, type WeightData, type WorkoutData,
} from '../api/projects';
import type { ProjectsState } from './Projects';

/**
 * Connected data: a project reading what Athena already has — the scale, WHOOP,
 * the calendar — live, instead of anyone typing it in. Adding one here is the
 * person choosing it, so it's confirmed at once. Every number shown is the
 * server's arithmetic (services/projects/bindings.js), not a model's opinion.
 */

const SOURCE_LABEL: Record<SourceType, string> = { health_metric: 'Weight (smart scale)', whoop_sport: 'Workouts (WHOOP)', calendar_match: 'Calendar events' };
const VERDICT: Record<string, { label: string; tone: string }> = {
  on_track: { label: 'On track', tone: 'text-emerald-300' }, ahead: { label: 'Ahead', tone: 'text-cyan-200' }, behind: { label: 'Behind', tone: 'text-amber-200' },
};
const field = 'w-full rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';
const sign = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/**
 * Where a weight project's plan says you should be today, in its unit — the
 * same straight line services/projects/bindings.js draws. Null unless the
 * project states a start, a target and both dates.
 */
export function plannedToday(p: Project, today = new Date()) {
  const m = p.metric;
  if (!m || m.start === null || m.target === null || !p.startsOn || !p.endsOn) return null;
  const a = Date.parse(p.startsOn), b = Date.parse(p.endsOn);
  if (!(b > a)) return null;
  const share = Math.max(0, Math.min(1, (today.getTime() - a) / (b - a)));
  return { value: Math.round((m.start + (m.target - m.start) * share) * 10) / 10, unit: m.unit === 'kg' ? 'kg' : 'lb' };
}

/** Weight against the planned line, as a small chart: dots are days, the dashed line is the plan. */
export function WeightChart({ d }: { d: WeightData }) {
  const pts = d.series;
  if (!pts.length) return <p className="text-xs text-slate-500">No weigh-ins since the project started.</p>;
  const t0 = Date.parse(d.startsOn || pts[0].date);
  const t1 = Math.max(Date.parse(d.endsOn || pts[pts.length - 1].date), Date.parse(pts[pts.length - 1].date));
  const values = [...pts.map(p => p.value), ...(d.start !== null ? [d.start] : []), ...(d.target !== null ? [d.target] : [])];
  const lo = Math.min(...values) - 1, hi = Math.max(...values) + 1;
  const W = 300, H = 90;
  const x = (date: string) => ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - ((v - lo) / Math.max(0.1, hi - lo)) * H;
  return <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="h-24 w-full" role="img" aria-label={`Weight ${d.actual ?? '—'} ${d.unit} against a plan of ${d.planned ?? '—'}`}>
    {d.start !== null && d.target !== null && d.startsOn && d.endsOn &&
      <line x1={x(d.startsOn)} y1={y(d.start)} x2={x(d.endsOn)} y2={y(d.target)} stroke="currentColor" className="text-slate-500" strokeDasharray="4 4" strokeWidth="1" />}
    {pts.map(p => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="2.2" className="fill-cyan-300" />)}
  </svg>;
}

function Weight({ d }: { d: WeightData }) {
  const v = d.verdict ? VERDICT[d.verdict] : null;
  return <div className="flex flex-col gap-1">
    <p className="text-sm text-slate-100">
      {d.actual !== null ? <><b>{d.actual} {d.unit}</b> <span className="text-xs text-slate-400">7-day average</span></> : 'No weigh-ins this week'}
      {d.change !== null && <span className="ml-2 text-xs text-slate-300">{sign(d.change)} {d.unit} since start</span>}
    </p>
    {d.planned !== null && <p className="text-xs text-slate-400">
      Plan for today {d.planned} {d.unit}{v && d.gap !== null && <> · <span className={v.tone}>{v.label}{d.verdict !== 'on_track' ? ` by ${Math.abs(d.gap)} ${d.unit}` : ''}</span></>}
      {d.target !== null && d.endsOn && <> · target {d.target} by {d.endsOn}</>}
    </p>}
    {d.target === null && <p className="text-xs text-amber-200/80">Set a target and start/end dates (Target and When sections) to see a plan line.</p>}
    <WeightChart d={d} />
  </div>;
}

function Workouts({ d }: { d: WorkoutData }) {
  const max = Math.max(1, ...d.weekly.map(w => w.count));
  return <div className="flex flex-col gap-1">
    <p className="text-sm text-slate-100"><b>{d.thisWeek}</b> this week <span className="text-xs text-slate-400">· {d.total} since {d.since ?? 'the last 8 weeks'}</span></p>
    <ul className="flex h-12 items-end gap-1" aria-label="Sessions per week, last 8 weeks">{d.weekly.map(w =>
      <li key={w.week} title={`Week of ${w.week}: ${w.count}`} className="flex-1 rounded-t bg-cyan-500/60" style={{ height: `${Math.max(4, (w.count / max) * 100)}%` }} />)}</ul>
    {d.last && <p className="text-xs text-slate-400">Last: {d.last.sport}, {d.last.date}{d.last.minutes ? ` · ${d.last.minutes} min` : ''}</p>}
  </div>;
}

function Calendar({ d }: { d: CalendarData }) {
  if (!d.upcoming.length) return <p className="text-xs text-slate-500">Nothing matching in the next 60 days.</p>;
  return <ul className="flex flex-col gap-1 text-sm">{d.upcoming.slice(0, 6).map((e, i) => <li key={`${e.start}-${i}`} className="flex justify-between gap-2">
    <span className="min-w-0 truncate text-slate-100">{e.title}</span>
    <span className="shrink-0 text-xs text-slate-400">{new Date(e.start).toLocaleString(undefined, e.allDay ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
  </li>)}</ul>;
}

export function ProjectData({ state, project }: { state: ProjectsState; project: Project }) {
  const [live, setLive] = useState<BoundData[] | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState<SourceType>('health_metric');
  const [sports, setSports] = useState<{ sport: string; count: number }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [words, setWords] = useState('');
  const key = project.bindings.map(b => b.uuid).join(',');

  useEffect(() => {
    if (!project.bindings.length) { setLive([]); return; }
    let alive = true;
    setLive(null);
    projectsApi.bound(project.uuid)
      .then(r => { if (alive) { setLive(r.bindings); setError(''); } })
      .catch(e => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [project.uuid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (source !== 'whoop_sport' || sports.length) return;
    projectsApi.bindingOptions().then(o => setSports(o.sports)).catch(() => {});
  }, [source, sports.length]);

  const add = async () => {
    const selector = source === 'health_metric' ? { metric: 'weight' as const }
      : source === 'whoop_sport' ? { sports: picked }
        : { titleAny: words.split(',').map(w => w.trim()).filter(Boolean) };
    if (await state.run(() => projectsApi.addBinding(project.uuid, source, selector))) { setPicked([]); setWords(''); }
  };
  const canAdd = source === 'health_metric' ? !project.bindings.some(b => b.sourceType === 'health_metric')
    : source === 'whoop_sport' ? picked.length > 0 : words.trim().length > 0;

  return <details open={project.bindings.length > 0} className="mb-4 rounded-lg border border-slate-800 p-3">
    <summary className="cursor-pointer text-xs uppercase tracking-[0.25em] text-cyan-300">Connected data ({project.bindings.length})</summary>
    <div className="mt-3 flex flex-col gap-3">
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      {project.bindings.map(b => {
        const d = live?.find(x => x.uuid === b.uuid);
        const what = b.sourceType === 'whoop_sport' ? b.selector.sports?.join(', ') : b.sourceType === 'calendar_match' ? `titles with ${b.selector.titleAny?.join(', ')}` : b.selector.metric;
        return <div key={b.uuid} className="rounded border border-slate-800 p-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400">
            <span>{SOURCE_LABEL[b.sourceType]}</span><span className="truncate normal-case tracking-normal text-slate-500">{what}</span>
            <span className="flex-1" />
            <button type="button" aria-label="Disconnect" className="hover:text-rose-300" disabled={state.busy} onClick={() => void state.run(() => projectsApi.removeBinding(project.uuid, b.uuid))}>✕</button>
          </div>
          {!d ? <p className="text-xs text-slate-500">{live ? 'No data.' : 'Reading…'}</p>
            : d.error ? <p className="text-xs text-amber-200">{d.error}</p>
              : b.sourceType === 'health_metric' ? <Weight d={d.data as WeightData} />
                : b.sourceType === 'whoop_sport' ? <Workouts d={d.data as WorkoutData} />
                  : <Calendar d={d.data as CalendarData} />}
        </div>;
      })}
      <form className="flex flex-col gap-2 rounded border border-slate-800 p-2" onSubmit={e => { e.preventDefault(); void add(); }}>
        <select aria-label="Source" className={field} value={source} onChange={e => setSource(e.target.value as SourceType)}>
          {(Object.keys(SOURCE_LABEL) as SourceType[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>
        {source === 'health_metric' && <p className="text-xs text-slate-400">
          {project.bindings.some(b => b.sourceType === 'health_metric') ? 'Already reading your weight.' : 'Reads your weigh-ins and compares them with this project’s target line.'}
        </p>}
        {source === 'whoop_sport' && <div className="flex flex-wrap gap-1">
          {sports.length ? sports.map(s => {
            const on = picked.includes(s.sport);
            return <button key={s.sport} type="button" onClick={() => setPicked(on ? picked.filter(x => x !== s.sport) : [...picked, s.sport])}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-400'}`}>{s.sport} <span className="text-slate-500">{s.count}</span></button>;
          }) : <p className="text-xs text-slate-500">No recorded workouts yet.</p>}
        </div>}
        {source === 'calendar_match' && <input className={field} value={words} onChange={e => setWords(e.target.value)} placeholder="Words in the event title, comma-separated — U10, U12" aria-label="Calendar words" />}
        <button className="dashboard-chat-cta self-start" disabled={state.busy || !canAdd}>Connect</button>
      </form>
    </div>
  </details>;
}
