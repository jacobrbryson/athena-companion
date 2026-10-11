import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { dashboardApi, type FamilyHealthStatus, type HealthSeverity } from '../api/dashboard';

/** The cadences offered as one tap; anything else is "Custom". */
const PRESET_HOURS = [4, 6, 12, 24];
const MAX_HOURS = 168;

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayClock = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? clock(iso) : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(iso)}`;
};
function agoWords(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)} days ago`;
}
export const everyWords = (hours: number) => hours === 1 ? 'every hour' : hours % 24 === 0 && hours > 24 ? `every ${hours / 24} days` : `every ${hours} hours`;

/** "Update due now" / "Next update 3:00 pm · every 4 hours" — empty when no check-ins were asked for. */
export function checkInWords(watch: FamilyHealthStatus) {
  if (!watch.checkInHours || !watch.nextUpdateAt) return '';
  return watch.updateDue ? `Update due · ${everyWords(watch.checkInHours)}` : `Next update ${dayClock(watch.nextUpdateAt)} · ${everyWords(watch.checkInHours)}`;
}

/** One line under a person: what is being watched and when the next update is wanted. */
export function HealthWatchChip({ watch, onOpen }: { watch: FamilyHealthStatus; onOpen: () => void }) {
  const next = checkInWords(watch);
  return <button type="button" className={`health-watch-chip${watch.updateDue ? ' health-watch-due' : ''}`} onClick={onOpen}>
    <span className="health-watch-dot" aria-hidden="true" />
    <span><strong>Health watch</strong> · {watch.symptom} · {watch.severity} · day {watch.daysActive}{next ? <> · <em>{next}</em></> : null}</span>
  </button>;
}

/**
 * Start or update a health watch on one person — who is already chosen by
 * the row it was opened from. Logging again on an active watch is the update
 * Athena asks for; "Feeling better" ends it.
 */
export function HealthWatchModal({ personName, watch, onClose, onSaved }: {
  personName: string;
  /** The person's active watch, when there is one. */
  watch?: FamilyHealthStatus;
  onClose: () => void;
  /** After any save or resolve, so the page can refetch. */
  onSaved: () => void;
}) {
  const [symptom, setSymptom] = useState(watch?.symptom || '');
  const [severity, setSeverity] = useState<HealthSeverity>(watch?.severity || 'mild');
  const [notes, setNotes] = useState('');
  const startHours = watch?.checkInHours ?? null;
  const [cadence, setCadence] = useState<string>(startHours === null ? 'none' : PRESET_HOURS.includes(startHours) ? String(startHours) : 'custom');
  const [custom, setCustom] = useState(startHours !== null && !PRESET_HOURS.includes(startHours) ? String(startHours) : '');
  const [busy, setBusy] = useState<'save' | 'resolve' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const customHours = Number(custom);
  const customOk = Number.isInteger(customHours) && customHours >= 1 && customHours <= MAX_HOURS;
  const hours = cadence === 'none' ? null : cadence === 'custom' ? (customOk ? customHours : undefined) : Number(cadence);
  const canSave = !!symptom.trim() && hours !== undefined && !busy;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy('save'); setError('');
    try {
      await dashboardApi.reportFamilyHealth({ personName, symptom: symptom.trim(), severity, notes: notes.trim() || undefined, checkInHours: hours ?? null });
      onSaved(); onClose();
    } catch (err) {
      setError((err as Error).message || 'Could not save that.');
      setBusy(null);
    }
  }
  async function resolve() {
    if (!watch) return;
    setBusy('resolve'); setError('');
    try {
      await dashboardApi.resolveFamilyHealth(watch.uuid);
      onSaved(); onClose();
    } catch (err) {
      setError((err as Error).message || 'Could not update that.');
      setBusy(null);
    }
  }

  return createPortal(<div className="health-modal" role="dialog" aria-modal="true" aria-labelledby="health-modal-title">
    <button type="button" className="health-modal-backdrop" aria-label="Close" onClick={onClose} />
    <section className="health-modal-card">
      <header>
        <div><small>HEALTH WATCH</small><h2 id="health-modal-title">{personName}</h2></div>
        <button type="button" className="health-modal-close" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      {watch && <div className="health-modal-status">
        <strong>Watching since {new Date(`${String(watch.startedAt).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · day {watch.daysActive}</strong>
        <small>{watch.lastUpdateAt ? `Last update ${agoWords(watch.lastUpdateAt)}` : 'No update logged yet'}{watch.notes ? ` · ${watch.notes}` : ''}</small>
        {watch.checkInHours && <small className={watch.updateDue ? 'health-watch-due-text' : undefined}>{checkInWords(watch)}</small>}
      </div>}
      <form className="dashboard-form health-modal-form" onSubmit={save}>
        <p className="source-note">{watch ? 'Log an update — a reading, a dose, how they seem. Athena will know.' : 'Log a symptom — Athena will know, and can nudge the household about precautions.'}</p>
        <label>What you noticed
          <input placeholder="e.g. a fever, a slight cough" value={symptom} onChange={e => setSymptom(e.target.value)} maxLength={200} required autoFocus />
        </label>
        <label>How bad
          <select value={severity} onChange={e => setSeverity(e.target.value as HealthSeverity)}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </label>
        <label>{watch ? 'This update (optional)' : 'Notes (optional)'}
          <input placeholder={watch ? 'e.g. 101.2°F, gave ibuprofen' : 'e.g. started after school'} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        </label>
        <label>Ask me for updates
          <select value={cadence} onChange={e => setCadence(e.target.value)}>
            <option value="none">No check-ins</option>
            {PRESET_HOURS.map(h => <option key={h} value={h}>{everyWords(h).replace(/^every/, 'Every')}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {cadence === 'custom' && <label className="health-modal-custom">Every
          <input type="number" inputMode="numeric" min={1} max={MAX_HOURS} step={1} value={custom} onChange={e => setCustom(e.target.value)} placeholder="8" aria-label="Hours between updates" />
          hours {custom && !customOk && <small className="community-warn">1 to {MAX_HOURS}</small>}
        </label>}
        {hours ? <small className="health-modal-hint">With initiative on, Athena will ask for an update {everyWords(hours)}.</small> : null}
        {error && <p className="dashboard-notice" role="status">{error}</p>}
        <div className="health-modal-actions">
          <button className="dashboard-chat-cta" type="submit" disabled={!canSave}>{busy === 'save' ? 'Saving…' : watch ? 'Log update' : 'Start watch'} <span>↗</span></button>
          {watch && <button type="button" className="community-link" disabled={!!busy} onClick={() => void resolve()}>{busy === 'resolve' ? 'Updating…' : 'Feeling better — end watch'}</button>}
        </div>
      </form>
    </section>
  </div>, document.body);
}
