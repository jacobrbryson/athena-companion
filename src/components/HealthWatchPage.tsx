import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { dashboardApi, type HealthCheck, type HealthCheckKind, type HealthEntry, type HealthSeverity, type HealthUpcoming, type HealthWatchDetail } from '../api/dashboard';
import { Icon } from './HealthPage';
import { PageHeader } from './PageHeader';
import { everyWords } from './HealthWatch';
import './health.css';
import './healthWatch.css';

/**
 * One health watch's own page (/family/health/<uuid>), opened from the
 * watch's chip under a person (owner, 2026-11-22). Four parts:
 *
 * - Coming up: every recurring check's next times. The first of each can be
 *   ticked off ("Done", with an optional reading) or skipped; the rest are
 *   projections that move when it is. One that comes due unticked pushes the
 *   person who set it (core_api services/familyHealthSchedules.js).
 * - Checks: add, change or remove a recurring check — what, how often, when
 *   the first is, and an optional end.
 * - Progress reports: every update, tick and skip, newest first, plus a box
 *   to log a new one. A mistaken line can be taken back.
 * - Details: what it is, how bad, and its start and end dates — a planned end
 *   on an active watch (checks stop after it), or the day an ended one ended.
 */

const PRESET_HOURS = [4, 6, 8, 12, 24];
const MAX_HOURS = 168;
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function dayClock(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return `Today ${clock(iso)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${clock(iso)}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${clock(iso)}`;
}
const longDay = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
function relative(iso: string) {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  const abs = Math.abs(mins);
  const words = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)} days`;
  return mins >= 0 ? `in ${words}` : `${words} overdue`;
}
/** A Date as a datetime-local value, in the device's own zone. */
function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const todayYmd = () => localInput(new Date()).slice(0, 10);
const fromLocal = (value: string) => value ? new Date(value).toISOString() : undefined;

const ENTRY_WORDS: Record<HealthEntry['kind'], string> = { started: 'Watch started', update: 'Update', check: 'Done', skip: 'Skipped', ended: 'Watch ended' };
const ENTRY_ICON: Record<HealthEntry['kind'], string> = { started: 'heart', update: 'pencil', check: 'check', skip: 'minus', ended: 'star' };
const kindIcon = (kind: HealthCheckKind) => kind === 'medicine' ? 'drop' : 'clock';

export function HealthWatchPage({ uuid, onBack, onAsk, onChanged }: {
  uuid: string;
  onBack: () => void;
  onAsk: (text: string) => void;
  /** After any change, so the Family card and chips refetch. */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<HealthWatchDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(() => {
    dashboardApi.healthWatch(uuid).then(d => { setDetail(d); setLoadError(''); }).catch(err => setLoadError((err as Error).message || 'Could not read that watch.'));
  }, [uuid]);
  useEffect(() => { load(); }, [load]);
  // Overdue and "in 20 min" move with the clock; re-read every few minutes in case someone else ticked one off.
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 30_000);
    const r = setInterval(load, 3 * 60_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [load]);

  async function run(key: string, call: () => Promise<HealthWatchDetail | unknown>) {
    setBusy(key); setError('');
    try {
      const next = await call();
      if (next && typeof next === 'object' && 'checks' in next) setDetail(next as HealthWatchDetail);
      else load();
      onChanged();
      return true;
    } catch (err) {
      setError((err as Error).message || 'That didn’t save.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (loadError && !detail) return <div className="hp hw"><Toolbar onBack={onBack} /><p className="hp-empty">{loadError}</p></div>;
  if (!detail) return <div className="hp hw"><Toolbar onBack={onBack} /><p className="hp-empty">Loading the health watch…</p></div>;

  const { status, checks, upcoming, entries } = detail;
  const active = status.status === 'active';
  const overdue = upcoming.filter(u => u.overdue).length;
  const next = upcoming.find(u => !u.overdue);
  const endWord = active ? (status.endsOn ? `Planned to end ${longDay(status.endsOn)}` : 'No end date') : status.resolvedAt ? `Ended ${longDay(status.resolvedAt)}` : 'Ended';

  return <div className="hp hw">
    <Toolbar onBack={onBack} />
    <PageHeader eyebrow={active ? 'HEALTH WATCH' : 'HEALTH WATCH · ENDED'} title={status.personName}
      blurb={<>{status.symptom} · {status.severity} · {active ? `day ${status.daysActive}` : `${status.daysActive} days`}</>}
      aside={<div className={`hw-summary${overdue ? ' hw-summary-due' : ''}`}>
        <span className={`hp-badge hp-badge-lg ${!active ? 'hp-green' : overdue ? 'hp-amber' : 'hp-red'}`}><Icon name={active ? 'heart' : 'check'} /></span>
        <span>
          <strong>{!active ? 'Ended' : overdue ? `${overdue} check${overdue === 1 ? '' : 's'} overdue` : next ? `Next: ${next.label}` : 'No checks set'}</strong>
          <small>{active && !overdue && next ? dayClock(next.dueAt) : `Since ${longDay(status.startedAt)} · ${endWord}`}</small>
        </span>
      </div>} />
    {error && <p className="dashboard-notice" role="status">{error}</p>}
    {active && status.endsOn && status.endsOn < todayYmd() && <p className="hw-banner">The planned end ({longDay(status.endsOn)}) has passed, so checks have stopped. End the watch when they’re better, or move the date.</p>}

    <div className="hp-grid hw-grid">
      <div className="hp-stack">
        <UpcomingPanel upcoming={upcoming} active={active} busy={busy}
          onDone={(u, note) => run(`done-${u.scheduleUuid}`, () => dashboardApi.markHealthCheck(uuid, u.scheduleUuid, { note }))}
          onSkip={u => run(`skip-${u.scheduleUuid}`, () => dashboardApi.markHealthCheck(uuid, u.scheduleUuid, { skip: true }))} />
        <ChecksPanel checks={checks} active={active} busy={busy}
          onAdd={input => run('add-check', () => dashboardApi.addHealthCheck(uuid, { ...input, timeZone: zone() }))}
          onUpdate={(c, input) => run(`edit-${c.uuid}`, () => dashboardApi.updateHealthCheck(uuid, c.uuid, input))}
          onRemove={c => run(`remove-${c.uuid}`, () => dashboardApi.removeHealthCheck(uuid, c.uuid))} />
      </div>
      <div className="hp-stack">
        <ReportsPanel entries={entries} active={active} severity={status.severity} busy={busy}
          onLog={(note, severity) => run('log', () => dashboardApi.addHealthUpdate(uuid, { note, severity }))}
          onRemove={e => run(`entry-${e.uuid}`, () => dashboardApi.removeHealthEntry(uuid, e.uuid))} />
        <DetailsPanel detail={detail} busy={busy}
          onSave={payload => run('details', () => dashboardApi.editHealthWatch(uuid, { ...payload, timeZone: zone() }))}
          onEnd={() => run('end', () => dashboardApi.resolveFamilyHealth(uuid))}
          onAsk={() => onAsk(`How is ${status.personName} doing with ${status.symptom}? Look at their health watch.`)} />
      </div>
    </div>
  </div>;
}

function Toolbar({ onBack }: { onBack: () => void }) {
  return <div className="hw-toolbar"><button type="button" className="hp-link" onClick={onBack}><Icon name="chevronLeft" /> Family</button></div>;
}

function UpcomingPanel({ upcoming, active, busy, onDone, onSkip }: {
  upcoming: HealthUpcoming[]; active: boolean; busy: string | null;
  onDone: (u: HealthUpcoming, note?: string) => Promise<boolean>; onSkip: (u: HealthUpcoming) => Promise<boolean>;
}) {
  const [noting, setNoting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return <section className="hp-panel hw-upcoming">
    <header><h2><Icon name="clock" /> Coming up</h2><span>{upcoming.length ? 'Next 48 hours' : ''}</span></header>
    {!active ? <p className="hp-empty">This watch has ended, so nothing is scheduled.</p>
      : !upcoming.length ? <p className="hp-empty">No recurring checks yet. Add one below, e.g. “Check temperature” every 6 hours or “Tylenol” every 12. If one comes due and isn’t ticked off, you get a push.</p>
      : <ol className="hw-list">{upcoming.map(u => {
        const key = `${u.scheduleUuid}@${u.dueAt}`;
        const open = noting === u.scheduleUuid && u.actionable;
        return <li key={key} className={`hw-item${u.overdue ? ' hw-overdue' : ''}${u.actionable ? '' : ' hw-later'}`}>
          <span className={`hp-badge ${u.overdue ? 'hp-amber' : u.kind === 'medicine' ? 'hp-violet' : 'hp-blue'}`}><Icon name={kindIcon(u.kind)} /></span>
          <span className="hw-item-text"><strong>{u.label}</strong><small>{dayClock(u.dueAt)} · {relative(u.dueAt)}</small></span>
          {u.actionable && <span className="hw-item-actions">
            <button type="button" className="hw-done" disabled={!!busy} onClick={() => open ? void onDone(u, note.trim() || undefined).then(ok => { if (ok) { setNoting(null); setNote(''); } }) : setNoting(u.scheduleUuid)}>
              <Icon name="check" /> {busy === `done-${u.scheduleUuid}` ? 'Saving…' : open ? 'Save' : 'Done'}
            </button>
            {!open && <button type="button" className="hw-quiet" disabled={!!busy} onClick={() => void onSkip(u)}>{busy === `skip-${u.scheduleUuid}` ? '…' : 'Skip'}</button>}
          </span>}
          {open && <div className="hw-note">
            <input autoFocus placeholder={u.kind === 'medicine' ? 'Optional — e.g. 5 ml' : 'Optional — e.g. 101.2°F'} value={note} maxLength={500} onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void onDone(u, note.trim() || undefined).then(ok => { if (ok) { setNoting(null); setNote(''); } }); } if (e.key === 'Escape') setNoting(null); }} />
            <button type="button" className="hw-quiet" onClick={() => { setNoting(null); setNote(''); }}>Cancel</button>
          </div>}
        </li>;
      })}</ol>}
    {active && upcoming.length > 0 && <p className="hp-footnote">Ticking one off sets the next from when it was done. Unticked ones push to whoever set the check.</p>}
  </section>;
}

function CheckForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial?: HealthCheck; submitLabel: string; busy: boolean;
  onSubmit: (input: { label: string; kind: HealthCheckKind; everyHours: number; firstDueAt?: string; nextDueAt?: string; endsAt: string | null }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const startHours = initial?.everyHours ?? 6;
  const [label, setLabel] = useState(initial?.label || '');
  const [kind, setKind] = useState<HealthCheckKind>(initial?.kind || 'check');
  const [cadence, setCadence] = useState(PRESET_HOURS.includes(startHours) ? String(startHours) : 'custom');
  const [custom, setCustom] = useState(PRESET_HOURS.includes(startHours) ? '' : String(startHours));
  const [first, setFirst] = useState(initial?.nextDueAt ? localInput(new Date(initial.nextDueAt)) : localInput(new Date(Date.now() + 5 * 60_000)));
  const [firstTouched, setFirstTouched] = useState(false);
  const [until, setUntil] = useState(initial?.endsAt ? localInput(new Date(initial.endsAt)) : '');
  const customHours = Number(custom);
  const hours = cadence === 'custom' ? (Number.isInteger(customHours) && customHours >= 1 && customHours <= MAX_HOURS ? customHours : null) : Number(cadence);
  const ok = !!label.trim() && !!hours && !!first && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok || !hours) return;
    const when = fromLocal(first);
    const done = await onSubmit({
      label: label.trim(), kind, everyHours: hours, endsAt: until ? fromLocal(until)! : null,
      ...(initial ? (firstTouched ? { nextDueAt: when } : {}) : { firstDueAt: when }),
    });
    if (done && !initial) { setLabel(''); setUntil(''); setFirstTouched(false); setFirst(localInput(new Date(Date.now() + 5 * 60_000))); }
  }

  return <form className="dashboard-form hw-form" onSubmit={submit}>
    <div className="hw-kinds" role="radiogroup" aria-label="Kind of check">
      {(['check', 'medicine'] as const).map(k => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'hw-kind-on' : ''} onClick={() => setKind(k)}>
        <Icon name={kindIcon(k)} /> {k === 'medicine' ? 'Medicine' : 'Check'}
      </button>)}
    </div>
    <label>What
      <input placeholder={kind === 'medicine' ? 'e.g. Tylenol 5 ml' : 'e.g. Check temperature'} value={label} maxLength={120} onChange={e => setLabel(e.target.value)} required />
    </label>
    <div className="hw-form-row">
      <label>Every
        <select value={cadence} onChange={e => setCadence(e.target.value)}>
          {PRESET_HOURS.map(h => <option key={h} value={h}>{everyWords(h).replace(/^every /, '')}</option>)}
          <option value="custom">Custom…</option>
        </select>
      </label>
      {cadence === 'custom' && <label>Hours
        <input type="number" inputMode="numeric" min={1} max={MAX_HOURS} step={1} value={custom} placeholder="3" onChange={e => setCustom(e.target.value)} />
      </label>}
    </div>
    <div className="hw-form-row">
      <label>{initial ? 'Next one' : 'First one'}
        <input type="datetime-local" value={first} onChange={e => { setFirst(e.target.value); setFirstTouched(true); }} required />
      </label>
      <label>Until (optional)
        <input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} />
      </label>
    </div>
    <div className="hw-form-actions">
      <button className="dashboard-chat-cta" type="submit" disabled={!ok}>{busy ? 'Saving…' : submitLabel} <span>↗</span></button>
      {onCancel && <button type="button" className="hw-quiet" onClick={onCancel}>Cancel</button>}
    </div>
  </form>;
}

function ChecksPanel({ checks, active, busy, onAdd, onUpdate, onRemove }: {
  checks: HealthCheck[]; active: boolean; busy: string | null;
  onAdd: (input: Parameters<Parameters<typeof CheckForm>[0]['onSubmit']>[0]) => Promise<boolean>;
  onUpdate: (c: HealthCheck, input: Parameters<Parameters<typeof CheckForm>[0]['onSubmit']>[0]) => Promise<boolean>;
  onRemove: (c: HealthCheck) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return <section className="hp-panel hw-checks">
    <header><h2><Icon name="refresh" /> Recurring checks</h2>{active && !adding && <button type="button" className="hp-link" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" /> Add</button>}</header>
    {!checks.length && !adding && <p className="hp-empty">{active ? 'Nothing recurring yet.' : 'No checks were set on this watch.'}</p>}
    <ul className="hw-list">{checks.map(c => editing === c.uuid
      ? <li key={c.uuid} className="hw-edit"><CheckForm initial={c} submitLabel="Save check" busy={busy === `edit-${c.uuid}`} onCancel={() => setEditing(null)}
          onSubmit={input => onUpdate(c, input).then(ok => { if (ok) setEditing(null); return ok; })} /></li>
      : <li key={c.uuid} className={`hw-item${c.finished ? ' hw-later' : ''}`}>
        <span className={`hp-badge ${c.kind === 'medicine' ? 'hp-violet' : 'hp-blue'}`}><Icon name={kindIcon(c.kind)} /></span>
        <span className="hw-item-text"><strong>{c.label}</strong>
          <small>{everyWords(c.everyHours)}{c.finished ? ' · finished' : c.nextDueAt ? ` · next ${dayClock(c.nextDueAt)}` : ''}{c.endsAt ? ` · until ${dayClock(c.endsAt)}` : ''}{c.lastDoneAt ? ` · last done ${dayClock(c.lastDoneAt)}` : ''}</small>
        </span>
        {active && <span className="hw-item-actions">
          <button type="button" className="hw-icon-btn" aria-label={`Edit ${c.label}`} onClick={() => { setEditing(c.uuid); setAdding(false); }}><Icon name="pencil" /></button>
          <button type="button" className="hw-icon-btn" aria-label={`Remove ${c.label}`} disabled={!!busy} onClick={() => { if (window.confirm(`Stop “${c.label}”? Its history stays.`)) void onRemove(c); }}><Icon name="minus" /></button>
        </span>}
      </li>)}</ul>
    {adding && <CheckForm submitLabel="Add check" busy={busy === 'add-check'} onCancel={() => setAdding(false)} onSubmit={input => onAdd(input).then(ok => { if (ok) setAdding(false); return ok; })} />}
  </section>;
}

function ReportsPanel({ entries, active, severity, busy, onLog, onRemove }: {
  entries: HealthEntry[]; active: boolean; severity: HealthSeverity; busy: string | null;
  onLog: (note: string, severity: HealthSeverity) => Promise<boolean>; onRemove: (e: HealthEntry) => Promise<boolean>;
}) {
  const [note, setNote] = useState('');
  const [level, setLevel] = useState<HealthSeverity>(severity);
  useEffect(() => setLevel(severity), [severity]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim() && level === severity) return;
    if (await onLog(note.trim(), level)) setNote('');
  }
  return <section className="hp-panel hw-reports">
    <header><h2><Icon name="chart" /> Progress reports</h2><span>{entries.length ? `${entries.length} logged` : ''}</span></header>
    {active && <form className="dashboard-form hw-form hw-log" onSubmit={submit}>
      <input placeholder="Log an update — a reading, a dose, how they seem" value={note} maxLength={500} onChange={e => setNote(e.target.value)} aria-label="Update" />
      <div className="hw-form-row">
        <select value={level} onChange={e => setLevel(e.target.value as HealthSeverity)} aria-label="How bad">
          <option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
        </select>
        <button className="dashboard-chat-cta" type="submit" disabled={busy === 'log' || (!note.trim() && level === severity)}>{busy === 'log' ? 'Saving…' : 'Log update'} <span>↗</span></button>
      </div>
    </form>}
    {!entries.length ? <p className="hp-empty">Nothing logged yet.</p> : <ol className="hw-timeline">{entries.map(e => <li key={e.uuid} className={`hw-entry hw-entry-${e.kind}`}>
      <span className="hw-entry-dot"><Icon name={ENTRY_ICON[e.kind]} /></span>
      <span className="hw-entry-text">
        <strong>{e.kind === 'check' || e.kind === 'skip' ? `${ENTRY_WORDS[e.kind]}: ${e.checkLabel || 'a check'}` : ENTRY_WORDS[e.kind]}
          {e.severity && (e.kind === 'started' || e.kind === 'update') ? <em className={`hw-sev hw-sev-${e.severity}`}>{e.severity}</em> : null}</strong>
        {e.note && <span>{e.note}</span>}
        {e.kind === 'started' && e.symptom && !e.note && <span>{e.symptom}</span>}
        <small>{e.loggedAt ? dayClock(e.loggedAt) : ''}{e.loggedBy ? ` · ${e.loggedBy}` : ''}{e.kind === 'check' && e.dueAt && e.loggedAt && Date.parse(e.loggedAt) - Date.parse(e.dueAt) > 15 * 60_000 ? ` · was due ${clock(e.dueAt)}` : ''}</small>
      </span>
      {e.kind !== 'started' && <button type="button" className="hw-icon-btn" aria-label="Remove this entry" disabled={!!busy} onClick={() => { if (window.confirm('Remove this entry from the history?')) void onRemove(e); }}>✕</button>}
    </li>)}</ol>}
  </section>;
}

function DetailsPanel({ detail, busy, onSave, onEnd, onAsk }: {
  detail: HealthWatchDetail; busy: string | null;
  onSave: (payload: { symptom: string; severity: HealthSeverity; startedAt: string; endsOn: string | null }) => Promise<boolean>;
  onEnd: () => Promise<boolean>; onAsk: () => void;
}) {
  const s = detail.status;
  const active = s.status === 'active';
  const endValue = (active ? s.endsOn : s.resolvedAt) || '';
  const [symptom, setSymptom] = useState(s.symptom);
  const [severity, setSeverity] = useState<HealthSeverity>(s.severity);
  const [startedAt, setStartedAt] = useState(s.startedAt);
  const [endsOn, setEndsOn] = useState(endValue);
  useEffect(() => { setSymptom(s.symptom); setSeverity(s.severity); setStartedAt(s.startedAt); setEndsOn((active ? s.endsOn : s.resolvedAt) || ''); }, [s.symptom, s.severity, s.startedAt, s.endsOn, s.resolvedAt, active]);
  const dirty = symptom.trim() !== s.symptom || severity !== s.severity || startedAt !== s.startedAt || endsOn !== endValue;
  const badEnd = !!endsOn && endsOn < startedAt;
  return <section className="hp-panel hw-details">
    <header><h2><Icon name="calendar" /> Details</h2></header>
    <form className="dashboard-form hw-form" onSubmit={e => { e.preventDefault(); if (dirty && !badEnd) void onSave({ symptom: symptom.trim(), severity, startedAt, endsOn: endsOn || null }); }}>
      <label>What you noticed
        <input value={symptom} maxLength={200} onChange={e => setSymptom(e.target.value)} required />
      </label>
      <label>How bad
        <select value={severity} onChange={e => setSeverity(e.target.value as HealthSeverity)}>
          <option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
        </select>
      </label>
      <div className="hw-form-row">
        <label>Started
          <input type="date" value={startedAt} max={todayYmd()} onChange={e => setStartedAt(e.target.value)} required />
        </label>
        <label>{active ? 'Planned end (optional)' : 'Ended'}
          <input type="date" value={endsOn} min={startedAt} max={active ? undefined : todayYmd()} onChange={e => setEndsOn(e.target.value)} required={!active} />
        </label>
      </div>
      {active && <small className="hp-footnote">With a planned end, checks stop after that day. The watch itself stays open until you end it.</small>}
      {badEnd && <small className="hp-error">The end can’t be before the start.</small>}
      <div className="hw-form-actions">
        <button className="dashboard-chat-cta" type="submit" disabled={!dirty || badEnd || busy === 'details'}>{busy === 'details' ? 'Saving…' : 'Save details'} <span>↗</span></button>
        {active && <button type="button" className="community-link" disabled={!!busy} onClick={() => { if (window.confirm(`End the health watch on ${s.personName}? Their checks stop.`)) void onEnd(); }}>{busy === 'end' ? 'Ending…' : 'Feeling better — end watch'}</button>}
      </div>
    </form>
    {s.checkInHours && active ? <p className="hp-footnote">Athena also asks how they’re doing {everyWords(s.checkInHours)} in conversation (set from chat).</p> : null}
    <button type="button" className="hp-link hw-ask" onClick={onAsk}>Ask Athena about this <Icon name="arrowRight" /></button>
  </section>;
}
