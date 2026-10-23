import { useEffect, useState } from 'react';
import { sleepClimateApi, type SleepClimate } from '../api/sleepClimate';

/**
 * Health → Bedroom & sleep: how the bedroom thermostat's temperature lines up
 * with recovery (or sleep performance) across the person's own nights. Hidden
 * entirely when Nest or WHOOP isn't linked — the Connected apps page is where
 * those are offered, and an empty panel here would only say so again.
 */
export function SleepClimatePanel({ onAsk }: { onAsk: (text: string) => void }) {
  const [data, setData] = useState<SleepClimate | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    sleepClimateApi.get().then(setData).catch(e => setError((e as Error).message || 'Bedroom and sleep are unavailable right now.'));
  }, []);

  if (!data && !error) return null;
  if (data && data.status === 'not_linked') return null;

  const header = <header>
    <h2>Bedroom &amp; sleep</h2>
    {data?.status === 'ready' && <button type="button" className="hp-link" onClick={() => onAsk('What bedroom temperature helps me sleep best, and can you set it for tonight?')}>Ask Athena</button>}
  </header>;

  if (error) return <section className="hp-panel hp-sleepclimate">{header}<p className="hp-sc-note" role="status">{error}</p></section>;
  if (!data) return null;
  if (data.status === 'no_device') return <section className="hp-panel hp-sleepclimate">{header}
    <p className="hp-sc-note">Tell me which thermostat is in your bedroom (Property → Utilities → Thermostats → Use for sleep) and I’ll start comparing its temperature with your sleep.</p>
  </section>;

  const metric = data.metric || 'avgRecovery';
  const bands = (data.bands || []).filter(b => b[metric] !== null);
  const top = Math.max(100, ...bands.map(b => b[metric] || 0));
  return <section className="hp-panel hp-sleepclimate">
    {header}
    <p className="hp-sc-sentence">{data.sentence}</p>
    {bands.length > 0 && <ul className="hp-sc-bands" aria-label={metric === 'avgRecovery' ? 'Recovery by bedroom temperature' : 'Sleep performance by bedroom temperature'}>
      {bands.map(b => {
        const best = data.best && data.best.fromF === b.fromF;
        return <li key={b.fromF} className={best ? 'hp-sc-best' : undefined} title={`${b.nights} night${b.nights === 1 ? '' : 's'}`}>
          <span className="hp-sc-bar"><i style={{ height: `${Math.round(((b[metric] || 0) / top) * 100)}%` }} /></span>
          <strong>{b[metric]}%</strong>
          <small>{b.fromF}–{b.toF}°F</small>
        </li>;
      })}
    </ul>}
    {data.device && <p className="hp-sc-note">From the {data.device.title} and WHOOP · {metric === 'avgRecovery' ? 'recovery' : 'sleep performance'} by bedroom temperature</p>}
  </section>;
}
