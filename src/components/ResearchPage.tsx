import { useEffect, useState } from 'react';
import { researchApi, type PaceDetail, type SetpointDetail, type Study, type StudyStatus } from '../api/research';
import { PageHeader } from './PageHeader';
import { SleepClimateBands } from './SleepClimatePanel';
import './health.css';
import './research.css';

const STATUS_LABEL: Record<StudyStatus, string> = {
  needs_source: 'Needs a source', gathering: 'Gathering', inconclusive: 'Not clear yet', ready: 'Finding', unavailable: 'Unavailable',
};

const ASK: Record<Study['id'], string> = {
  'sleep-climate': 'What bedroom temperature helps me sleep best, and can you set it for tonight?',
  'thermostat-setpoint': 'What has my thermostat setpoint been doing to how long the heat runs?',
  'project-pace': 'How fast are my projects really moving, and which ones have stalled?',
};

/** Sample progress as "4 of 14 nights" — never a percentage of done, because a study keeps refining. */
function Progress({ study }: { study: Study }) {
  const p = study.progress;
  if (!p || study.status === 'unavailable') return null;
  const pct = p.needed ? Math.min(100, Math.round((p.have / p.needed) * 100)) : 0;
  const label = p.have >= p.needed ? `${p.have} ${p.unit}` : `${p.have} of ${p.needed} ${p.unit}`;
  return <div className="rs-progress">
    <span className="rs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.needed} aria-valuenow={Math.min(p.have, p.needed)} aria-label={`${study.title} sample`}><i style={{ width: `${pct}%` }} /></span>
    <small>{label}</small>
  </div>;
}

function SetpointBands({ detail }: { detail: SetpointDetail }) {
  const bands = (detail.bands || []).filter(b => b.avgHeatingHours !== null);
  if (!bands.length) return null;
  const top = Math.max(1, ...bands.map(b => b.avgHeatingHours || 0));
  return <>
    <ul className="hp-sc-bands" aria-label="Hours of heat a day by thermostat setpoint">
      {bands.map(b => <li key={b.fromF} className={detail.low?.fromF === b.fromF ? 'hp-sc-best' : undefined} title={`${b.days} day${b.days === 1 ? '' : 's'}`}>
        <span className="hp-sc-bar"><i style={{ height: `${Math.round(((b.avgHeatingHours || 0) / top) * 100)}%` }} /></span>
        <strong>{b.avgHeatingHours}h</strong>
        <small>{b.fromF}–{b.toF}°F</small>
      </li>)}
    </ul>
    {detail.device && <p className="hp-sc-note">From the {detail.device.title} · hours of heat a day by heat setpoint</p>}
  </>;
}

function PaceDetailView({ detail }: { detail: PaceDetail }) {
  const weekly = detail.weekly || [];
  const top = Math.max(1, ...weekly.map(w => w.steps));
  const projects = detail.projects || [];
  return <>
    {weekly.length > 0 && <ul className="hp-sc-bands" aria-label="Steps finished each week">
      {weekly.map(w => <li key={w.weekOf} title={`Week of ${w.weekOf}`}>
        <span className="hp-sc-bar"><i style={{ height: `${Math.round((w.steps / top) * 100)}%` }} /></span>
        <strong>{w.steps}</strong>
        <small>{new Date(`${w.weekOf}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
      </li>)}
    </ul>}
    {projects.length > 0 && <ul className="rs-projects">
      {projects.map(p => <li key={p.uuid} className={p.stalled ? 'rs-stalled' : undefined}>
        <strong>{p.title}</strong>
        <span>{p.stalled ? `No progress in ${p.idleDays} days · ${p.open} to go`
          : p.finishOn ? `${p.open} to go · around ${new Date(`${p.finishOn}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at its pace`
            : p.open ? `${p.open} to go · not enough finished steps for a date yet` : 'Nothing left to do'}</span>
      </li>)}
    </ul>}
  </>;
}

function StudyPanel({ study, onAsk }: { study: Study; onAsk: (text: string) => void }) {
  return <section className={`hp-panel rs-study rs-${study.status}`} aria-labelledby={`rs-${study.id}`}>
    <header>
      <h2 id={`rs-${study.id}`}>{study.title}</h2>
      <span className="rs-chip">{STATUS_LABEL[study.status]}</span>
    </header>
    <p className="rs-question">{study.question}</p>
    <Progress study={study} />
    {study.sentence && <p className="hp-sc-sentence">{study.sentence}</p>}
    {study.status === 'ready' && study.id === 'sleep-climate' && study.detail && <SleepClimateBands data={study.detail} />}
    {study.status === 'ready' && study.id === 'thermostat-setpoint' && study.detail && <SetpointBands detail={study.detail} />}
    {study.status === 'ready' && study.id === 'project-pace' && study.detail && <PaceDetailView detail={study.detail} />}
    <footer>
      <small>{study.sources.join(' · ')}{study.confidence ? ` · ${study.confidence} confidence` : ''}</small>
      {study.status === 'ready' && <button type="button" className="hp-link" onClick={() => onAsk(ASK[study.id])}>Ask Athena</button>}
    </footer>
  </section>;
}

/**
 * Research: small studies on the person's own data, each with a question, a
 * sample that fills toward a minimum, and a finding once it can honestly be
 * said. Read-only; nothing here acts or notifies.
 */
export function ResearchPage({ onAsk }: { onAsk: (text: string) => void }) {
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    researchApi.list().then(r => setStudies(r.studies)).catch(e => setError((e as Error).message || 'Research is unavailable right now.'));
  };
  useEffect(load, []);

  return <div className="hp cp rs">
    <PageHeader eyebrow="YOUR OWN DATA, ONE QUESTION AT A TIME" title="Research"
      blurb="Small studies on what Athena already knows. Each one counts toward a minimum before it says anything, and says how sure it is." />
    {error && <p className="hp-sc-note" role="status">{error} <button type="button" className="hp-link" onClick={load}>Retry</button></p>}
    {!studies && !error && <p className="hp-sc-note">Loading…</p>}
    {studies && <div className="rs-grid">{studies.map(s => <StudyPanel key={s.id} study={s} onAsk={onAsk} />)}</div>}
  </div>;
}
