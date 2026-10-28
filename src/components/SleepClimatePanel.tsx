import type { SleepClimate } from '../api/sleepClimate';

/**
 * Research → Bedroom & sleep, the chart: recovery (or sleep performance) by
 * bedroom temperature across the person's own nights. The study's frame —
 * title, progress, sentence — is ResearchPage's; this is only the bands.
 */
export function SleepClimateBands({ data }: { data: SleepClimate }) {
  const metric = data.metric || 'avgRecovery';
  const bands = (data.bands || []).filter(b => b[metric] !== null);
  if (!bands.length) return null;
  const top = Math.max(100, ...bands.map(b => b[metric] || 0));
  return <>
    <ul className="hp-sc-bands" aria-label={metric === 'avgRecovery' ? 'Recovery by bedroom temperature' : 'Sleep performance by bedroom temperature'}>
      {bands.map(b => {
        const best = data.best && data.best.fromF === b.fromF;
        return <li key={b.fromF} className={best ? 'hp-sc-best' : undefined} title={`${b.nights} night${b.nights === 1 ? '' : 's'}`}>
          <span className="hp-sc-bar"><i style={{ height: `${Math.round(((b[metric] || 0) / top) * 100)}%` }} /></span>
          <strong>{b[metric]}%</strong>
          <small>{b.fromF}–{b.toF}°F</small>
        </li>;
      })}
    </ul>
    {data.device && <p className="hp-sc-note">From the {data.device.title} and WHOOP · {metric === 'avgRecovery' ? 'recovery' : 'sleep performance'} by bedroom temperature</p>}
  </>;
}
