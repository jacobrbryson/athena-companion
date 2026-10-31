import { useEffect, useState } from 'react';
import { guardianMissionsApi as gm, type GmCapability, type GmHandoff, type GmRecipient } from '../api/guardianMissions';

/** Field Kit: where kids may scout, and the kinds of mission that no longer need the owner's review. */
export function GuardiansHandoff({ capabilities, people }: { capabilities: GmCapability[]; people: GmRecipient[] }) {
  const [view, setView] = useState<GmHandoff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState({ name: '', offLimits: '', maxMinutes: 60 });
  const [template, setTemplate] = useState({ name: '', capabilities: [] as string[], people: [] as string[], zones: [] as string[], maxMinutes: 90 });

  useEffect(() => {
    gm.handoff().then(setView).catch(() => undefined);
  }, []);

  const run = async (work: () => Promise<GmHandoff>) => {
    setBusy(true);
    setError(null);
    try {
      setView(await work());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  if (!view) return null;
  const free = capabilities.filter(c => c.permission === 'free');
  const pick = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter(v => v !== value));

  return <>
    <h3 className="gm-h3">Zones kids can scout</h3>
    {error && <p className="gm-sub" role="alert">{error}</p>}
    <ul className="gm-recipients">{view.zones.map(z => <li key={z.uuid}>
      <span>{z.name}<small className="gm-recipient-channels">Off limits: {z.offLimits} · {z.maxMinutes} min{z.daylightOnly ? ' · daylight only' : ''}{z.mapped ? ` · ${z.radiusM} m` : ' · no map limit'}</small></span>
      <button type="button" className="gm-btn" disabled={busy} onClick={() => void run(() => gm.retireZone(z.uuid))}>Retire</button>
    </li>)}</ul>
    <form className="gm-handoff" onSubmit={e => {
      e.preventDefault();
      void run(() => gm.addZone(zone));
      setZone({ name: '', offLimits: '', maxMinutes: 60 });
    }}>
      <label>Zone name<input value={zone.name} onChange={e => setZone({ ...zone, name: e.target.value })} maxLength={120} required /></label>
      <label>What's off limits?<input value={zone.offLimits} onChange={e => setZone({ ...zone, offLimits: e.target.value })} maxLength={300} required /></label>
      <label>Time limit (minutes)<input type="number" min={5} max={240} value={zone.maxMinutes} onChange={e => setZone({ ...zone, maxMinutes: Number(e.target.value) })} /></label>
      <button type="submit" className="gm-btn" disabled={busy}>Add zone</button>
    </form>

    <h3 className="gm-h3">Mission templates</h3>
    {!view.enabled && <p className="gm-sub">Templates are switched off, so every plan needs its own approval.</p>}
    <ul className="gm-recipients">{view.templates.map(t => <li key={t.uuid}>
      <span>{t.name}<small className="gm-recipient-channels">{t.people.join(', ')} · {t.maxMinutes} min · {t.capabilities.length} tools</small></span>
      <button type="button" className="gm-btn" disabled={busy} onClick={() => void run(() => gm.retireTemplate(t.uuid))}>Retire</button>
    </li>)}</ul>
    {view.canCreate && <form className="gm-handoff" onSubmit={e => { e.preventDefault(); void run(() => gm.addTemplate(template)); }}>
      <label>Template name<input value={template.name} onChange={e => setTemplate({ ...template, name: e.target.value })} maxLength={120} required /></label>
      <fieldset><legend>Tools it may use</legend>{free.map(c => <label key={c.key}><span><input type="checkbox" checked={template.capabilities.includes(c.key)} onChange={e => setTemplate({ ...template, capabilities: pick(template.capabilities, c.key, e.target.checked) })} /> {c.name}</span></label>)}</fieldset>
      <fieldset><legend>Who may take part</legend>{people.map(p => {
        const key = p.name.toLowerCase();
        return <label key={p.uuid}><span><input type="checkbox" checked={template.people.includes(key)} onChange={e => setTemplate({ ...template, people: pick(template.people, key, e.target.checked) })} /> {p.name}</span></label>;
      })}</fieldset>
      <fieldset><legend>Zones</legend>{view.zones.map(z => <label key={z.uuid}><span><input type="checkbox" checked={template.zones.includes(z.uuid)} onChange={e => setTemplate({ ...template, zones: pick(template.zones, z.uuid, e.target.checked) })} /> {z.name}</span></label>)}</fieldset>
      <label>Longest it may run (minutes)<input type="number" min={5} max={480} value={template.maxMinutes} onChange={e => setTemplate({ ...template, maxMinutes: Number(e.target.value) })} /></label>
      <button type="submit" className="gm-btn gm-btn-primary" disabled={busy}>Approve this template</button>
    </form>}
  </>;
}
