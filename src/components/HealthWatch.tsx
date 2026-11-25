import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type FamilyHealthStatus, type HealthSeverity } from '../api/dashboard';
import { healthWatchPath } from '../dashboardRoutes';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayClock = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? clock(iso) : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(iso)}`;
};
export const everyWords = (hours: number) => hours === 1 ? 'every hour' : hours % 24 === 0 && hours > 24 ? `every ${hours / 24} days` : `every ${hours} hours`;

/**
 * What's next on a watch: its soonest recurring check ("Tylenol due" /
 * "Next: Check temperature 3:00 pm"), else the chat check-in cadence. Empty
 * when neither was asked for.
 */
export function checkInWords(watch: FamilyHealthStatus) {
  if (watch.nextCheck) {
    const more = (watch.checksOverdue || 0) > 1 ? ` (+${(watch.checksOverdue || 0) - 1} more)` : '';
    return watch.nextCheck.overdue ? `${watch.nextCheck.label} due${more}` : `Next: ${watch.nextCheck.label} ${dayClock(watch.nextCheck.dueAt)}`;
  }
  if (!watch.checkInHours || !watch.nextUpdateAt) return '';
  return watch.updateDue ? `Update due · ${everyWords(watch.checkInHours)}` : `Next update ${dayClock(watch.nextUpdateAt)} · ${everyWords(watch.checkInHours)}`;
}
const isDue = (watch: FamilyHealthStatus) => watch.updateDue || (watch.checksOverdue || 0) > 0;

/** One line under a person: what is being watched and what's next. Opens the watch's own page. */
export function HealthWatchChip({ watch }: { watch: FamilyHealthStatus; onOpen?: () => void }) {
  const navigate = useNavigate();
  const next = checkInWords(watch);
  return <button type="button" className={`health-watch-chip${isDue(watch) ? ' health-watch-due' : ''}`} onClick={() => navigate(healthWatchPath(watch.uuid))}>
    <span className="health-watch-dot" aria-hidden="true" />
    <span><strong>Health watch</strong> · {watch.symptom} · {watch.severity} · day {watch.daysActive}{next ? <> · <em>{next}</em></> : null}</span>
  </button>;
}

/**
 * Start a health watch. Who is either already chosen by the row it was
 * opened from (`personName`), or picked here: yourself first (`selfName`),
 * then the family (`people`), or any name typed in. Once started, the
 * watch's own page opens — that's where checks, updates and dates live.
 *
 * Opened on a person who already has a watch (`watch`), it goes straight to
 * that page instead, so every "Health watch" entry point lands in one place.
 */
export function HealthWatchModal({ personName, selfName, people = [], watch, onClose, onSaved }: {
  personName?: string;
  /** The signed-in person's first name, offered first as "Me". */
  selfName?: string;
  /** Family names to offer as one tap. */
  people?: string[];
  /** The person's active watch, when there is one. */
  watch?: FamilyHealthStatus;
  onClose: () => void;
  /** After a save, so the page can refetch. */
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const choices = [...new Set([selfName, ...people].filter((n): n is string => !!n && !!n.trim()))];
  const [who, setWho] = useState(personName || selfName || '');
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState<HealthSeverity>('mild');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!watch) return;
    navigate(healthWatchPath(watch.uuid));
    onClose();
  }, [watch, navigate, onClose]);

  useEffect(() => {
    if (watch) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose, watch]);

  if (watch) return null;
  const canSave = !!who.trim() && !!symptom.trim() && !busy;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true); setError('');
    try {
      const { status } = await dashboardApi.reportFamilyHealth({ personName: who.trim(), symptom: symptom.trim(), severity, notes: notes.trim() || undefined, newWatch: true });
      onSaved(); onClose();
      navigate(healthWatchPath(status.uuid));
    } catch (err) {
      setError((err as Error).message || 'Could not save that.');
      setBusy(false);
    }
  }

  const isSelf = !!selfName && who.trim().toLowerCase() === selfName.trim().toLowerCase();
  return createPortal(<div className="health-modal" role="dialog" aria-modal="true" aria-labelledby="health-modal-title">
    <button type="button" className="health-modal-backdrop" aria-label="Close" onClick={onClose} />
    <section className="health-modal-card">
      <header>
        <div><small>START A HEALTH WATCH</small><h2 id="health-modal-title">{personName || (isSelf ? 'You' : who.trim() || 'Who is it for?')}</h2></div>
        <button type="button" className="health-modal-close" aria-label="Close" onClick={onClose}>✕</button>
      </header>
      <form className="dashboard-form health-modal-form" onSubmit={save}>
        {!personName && <div className="health-modal-who">
          <span>Who</span>
          {choices.length > 0 && <div className="health-modal-people">{choices.map(name => <button key={name} type="button" aria-pressed={who === name} className={who === name ? 'on' : ''} onClick={() => setWho(name)}>
            {name === selfName ? `Me (${name})` : name}
          </button>)}</div>}
          <input placeholder="Or type a name" value={choices.includes(who) ? '' : who} onChange={e => setWho(e.target.value)} maxLength={120} aria-label="Someone else's name" />
        </div>}
        <p className="source-note">{isSelf ? 'Log what you’re dealing with — Athena will know, and you can set recurring checks next.' : 'Log a symptom — Athena will know, and can nudge the household about precautions.'}</p>
        <label>What you noticed
          <input placeholder="e.g. a fever, a slight cough" value={symptom} onChange={e => setSymptom(e.target.value)} maxLength={200} required autoFocus={!!personName} />
        </label>
        <label>How bad
          <select value={severity} onChange={e => setSeverity(e.target.value as HealthSeverity)}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </label>
        <label>Notes (optional)
          <input placeholder="e.g. started after school" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} />
        </label>
        <small className="health-modal-hint">Next you’ll get its own page: recurring checks (“temperature every 6 hours”), progress reports, and start and end dates.</small>
        {error && <p className="dashboard-notice" role="status">{error}</p>}
        <div className="health-modal-actions">
          <button className="dashboard-chat-cta" type="submit" disabled={!canSave}>{busy ? 'Saving…' : 'Start watch'} <span>↗</span></button>
        </div>
      </form>
    </section>
  </div>, document.body);
}
