import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { dashboardApi, type BodyReference, type BodyCalibrationState } from '../api/dashboard';

const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;
const today = () => new Date().toLocaleDateString('en-CA');
const lb = (kg: number) => `${(kg * LB_PER_KG).toFixed(1)} lb`;
const feetInches = (cm: number) => { const inches = Math.round(cm / CM_PER_IN); return `${Math.floor(inches / 12)}′${inches % 12}″`; };

const FIELD_WORDS: Record<string, string> = {
  body_fat_percent: 'body fat', body_water_percent: 'body water', skeletal_muscle_kg: 'skeletal muscle', fat_free_mass_kg: 'lean mass',
};

/** One reference, in the units the person typed them in. */
function referenceWords(r: BodyReference) {
  const parts = [
    r.height_cm != null && `height ${feetInches(r.height_cm)}`,
    r.body_fat_percent != null && `body fat ${r.body_fat_percent}%`,
    r.skeletal_muscle_kg != null && `skeletal muscle ${lb(r.skeletal_muscle_kg)}`,
    r.fat_free_mass_kg != null && `lean mass ${lb(r.fat_free_mass_kg)}`,
    r.body_water_percent != null && `body water ${r.body_water_percent}%`,
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Lab references — a DEXA or InBody result, a height measured at the doctor's
 * — that correct the scale and Athena's estimates. Each measure is optional;
 * the newest reference carrying a measure is the one that applies.
 */
export function BodyCalibrationDialog({ references, calibration, onClose, onSaved }: {
  references: BodyReference[]; calibration?: BodyCalibrationState | null; onClose: () => void; onSaved: () => void;
}) {
  const [measuredOn, setMeasuredOn] = useState(today());
  const [source, setSource] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [fat, setFat] = useState('');
  const [muscleLb, setMuscleLb] = useState('');
  const [leanLb, setLeanLb] = useState('');
  const [water, setWater] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const heightIn = feet || inches ? (Number(feet) || 0) * 12 + (Number(inches) || 0) : null;
  const values = {
    height_cm: heightIn ? Math.round(heightIn * CM_PER_IN * 10) / 10 : null,
    body_fat_percent: num(fat),
    skeletal_muscle_kg: num(muscleLb) === null ? null : Math.round((num(muscleLb)! / LB_PER_KG) * 100) / 100,
    fat_free_mass_kg: num(leanLb) === null ? null : Math.round((num(leanLb)! / LB_PER_KG) * 100) / 100,
    body_water_percent: num(water),
  };
  const any = Object.values(values).some(v => v !== null);
  const canSave = any && !!measuredOn && !busy;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy('save'); setError('');
    try {
      await dashboardApi.addBodyCalibration({ measured_on: measuredOn, source: source.trim() || undefined, ...values });
      onSaved(); onClose();
    } catch (err) {
      setError((err as Error).message || 'Could not save that.');
      setBusy(null);
    }
  }
  async function remove(uuid: string) {
    setBusy(uuid); setError('');
    try {
      await dashboardApi.removeBodyCalibration(uuid);
      onSaved();
    } catch (err) {
      setError((err as Error).message || 'Could not remove that.');
    }
    setBusy(null);
  }

  const applied = calibration ? Object.entries(calibration.corrections) : [];
  const unmatched = calibration?.unmatched || [];

  return createPortal(<div className="health-modal" role="dialog" aria-modal="true" aria-labelledby="body-cal-title">
    <button type="button" className="health-modal-backdrop" aria-label="Close" onClick={onClose} />
    <section className="health-modal-card">
      <header>
        <div><small>BODY COMPOSITION</small><h2 id="body-cal-title">Calibrate</h2></div>
        <button type="button" className="health-modal-close" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      {(references.length > 0 || unmatched.length > 0) && <div className="health-modal-status">
        {applied.map(([field, c]) => <small key={field}>{FIELD_WORDS[field] || field}: corrected to your {c.source || 'reference'} from {c.measured_on}</small>)}
        {calibration?.heightCm && <small>height: {feetInches(calibration.heightCm)} used for BMI</small>}
        {unmatched.length > 0 && <small className="health-watch-due-text">No weigh-in within a week of the reference for {unmatched.map(f => FIELD_WORDS[f] || f).join(', ')} — step on the scale within a week of the test so it can be compared.</small>}
        <ul className="dashboard-data-list">{references.map(r => <li key={r.uuid}><div><small>{r.measured_on}{r.source ? ` · ${r.source}` : ''}</small><strong>{referenceWords(r)}</strong></div>
          <button type="button" className="community-link" disabled={!!busy} onClick={() => void remove(r.uuid)}>{busy === r.uuid ? 'Removing…' : 'Remove'}</button></li>)}</ul>
      </div>}
      <form className="dashboard-form health-modal-form" onSubmit={save}>
        <p className="source-note">Enter a result from a DEXA scan, an InBody test or your doctor. Every weigh-in is corrected against it — weigh yourself within a week of the test so there's a reading to compare.</p>
        <label>Measured on
          <input type="date" value={measuredOn} max={today()} onChange={e => setMeasuredOn(e.target.value)} required />
        </label>
        <label>Where (optional)
          <input placeholder="e.g. DEXA scan, InBody, doctor" value={source} onChange={e => setSource(e.target.value)} maxLength={80} />
        </label>
        <label className="health-modal-custom">Height
          <input type="number" inputMode="numeric" min={3} max={8} value={feet} onChange={e => setFeet(e.target.value)} placeholder="6" aria-label="Height, feet" /> ft
          <input type="number" inputMode="decimal" min={0} max={11.5} step={0.5} value={inches} onChange={e => setInches(e.target.value)} placeholder="3" aria-label="Height, inches" /> in
        </label>
        <label>Body fat %
          <input type="number" inputMode="decimal" min={2} max={70} step={0.1} value={fat} onChange={e => setFat(e.target.value)} placeholder="e.g. 17.4" />
        </label>
        <label>Skeletal muscle (lb)
          <input type="number" inputMode="decimal" min={10} max={200} step={0.1} value={muscleLb} onChange={e => setMuscleLb(e.target.value)} placeholder="InBody's SMM" />
        </label>
        <label>Lean / fat-free mass (lb)
          <input type="number" inputMode="decimal" min={40} max={330} step={0.1} value={leanLb} onChange={e => setLeanLb(e.target.value)} placeholder="DEXA's lean + bone" />
        </label>
        <label>Body water %
          <input type="number" inputMode="decimal" min={30} max={80} step={0.1} value={water} onChange={e => setWater(e.target.value)} />
        </label>
        {error && <p className="dashboard-notice" role="status">{error}</p>}
        <div className="health-modal-actions">
          <button className="dashboard-chat-cta" type="submit" disabled={!canSave}>{busy === 'save' ? 'Saving…' : 'Save reference'} <span>↗</span></button>
        </div>
      </form>
    </section>
  </div>, document.body);
}
