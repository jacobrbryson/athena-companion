import { useEffect, useState, type ReactNode } from 'react';
import { issuesApi, SEVERITIES, sortIssues, type IssueInput, type IssuePatch, type IssueSeverity, type PropertyIssue } from '../api/propertyIssues';
import { Drawer } from './Drawer';
import { DrawerButton } from './ActionControls';
import { readImage } from './Property';
import './propertyIssues.css';

/**
 * Report an issue on the Property page: something wrong at the house right
 * now, with where, how bad, when, photos and a note for Athena. Troubleshoot
 * and Find a pro open a conversation with Athena about the issue; she reads
 * open issues in her prompt (core_api services/projects/prompt.js).
 */
const MAX_PHOTOS = 4;
const SYSTEMS = ['Heating & cooling', 'Plumbing', 'Electrical', 'Roof & exterior', 'Appliances', 'Security', 'Yard / Irrigation'];
const OTHER = 'Other';
const localDay = (d = new Date()) => d.toLocaleDateString('en-CA');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localDay(d); };

const path = (d: string) => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS: Record<string, ReactNode> = {
  'Heating & cooling': path('M10 13.5V4a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0ZM12 9v6'),
  Plumbing: path('M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z'),
  Electrical: path('M13 2 4 14h7l-1 8 9-12h-7l1-8Z'),
  'Roof & exterior': path('M3 11.5 12 4l9 7.5M6 10v10h12V10'),
  Appliances: path('M6 3h12v18H6zM6 9h12M9 6h.01'),
  Security: path('M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z'),
  'Yard / Irrigation': path('M20 3C10 3 4 7 4 13a7 7 0 0 0 7 7c6 0 9-7 9-17ZM3 21l8-8'),
  [OTHER]: path('M5 12h.01M12 12h.01M19 12h.01'),
};
const PIN = path('M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z');
export const WARNING = path('M12 3 2 21h20L12 3ZM12 9v5M12 17h.01');

export const severityLabel = (s: IssueSeverity) => SEVERITIES.find(x => x.id === s)!.label;
export function reportedWhen(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (localDay(d) === localDay()) return `today, ${time}`;
  if (localDay(d) === yesterday()) return `yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
const noticedWhen = (day: string) => day === localDay() ? 'today' : day === yesterday() ? 'yesterday' : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** What Athena is asked when a person taps Troubleshoot or Find a pro. */
export function troubleshootPrompt(i: PropertyIssue) {
  return `Help me troubleshoot a problem at the house. ${i.location}: ${i.description}${i.notes ? ` ${i.notes}` : ''} (Severity ${severityLabel(i.severity).toLowerCase()}, noticed ${noticedWhen(i.noticedOn)}.) Walk me through what to check first, one step at a time, and tell me when it's time to stop and call a pro.`;
}
export function findProPrompt(i: PropertyIssue, address: string) {
  return `Find a well-reviewed repair pro${address ? ` near ${address}` : ' near my house'} for this: ${i.location} — ${i.description} Give me a few options with phone numbers, and what I should ask when I call.`;
}

export function usePropertyIssues() {
  const [issues, setIssues] = useState<PropertyIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    issuesApi.all().then(r => { if (alive) { setIssues(sortIssues(r.issues)); setError(''); } })
      .catch(e => { if (alive) setError((e as Error).message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  const apply = (r: { issues: PropertyIssue[] }) => { setIssues(sortIssues(r.issues)); setError(''); };
  return {
    issues, loading, error, retry: () => setAttempt(a => a + 1),
    create: async (input: IssueInput) => apply(await issuesApi.create(input)),
    update: async (uuid: string, patch: IssuePatch) => apply(await issuesApi.update(uuid, patch)),
    remove: async (uuid: string) => apply(await issuesApi.remove(uuid)),
    addNote: async (uuid: string, body: string) => apply(await issuesApi.addNote(uuid, body)),
    removeNote: async (uuid: string, note: string) => apply(await issuesApi.removeNote(uuid, note)),
  };
}
export type IssuesState = ReturnType<typeof usePropertyIssues>;

/** An issue's stored photos, fetched only when it is on screen. */
function useIssuePhotos(issue: PropertyIssue | null) {
  const [photos, setPhotos] = useState<{ key: string; list: { uuid: string; image: string }[] } | null>(null);
  const key = issue ? `${issue.uuid}:${issue.photos.join(',')}` : '';
  useEffect(() => {
    if (!issue || !issue.photos.length) return;
    let alive = true;
    issuesApi.photos(issue.uuid).then(r => { if (alive) setPhotos({ key, list: r.photos }); }).catch(() => { if (alive) setPhotos({ key, list: [] }); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return issue?.photos.length ? (photos?.key === key ? photos.list : null) : [];
}

export function ReportIssueDrawer({ state, areas, issue, onClose, onSaved }: { state: IssuesState; areas: string[]; issue?: PropertyIssue | null; onClose: () => void; onSaved?: () => void }) {
  const places = [...new Map([...areas, ...SYSTEMS].filter(a => a.trim()).map(a => [a.trim().toLowerCase(), a.trim()])).values()];
  const known = (l: string) => places.find(p => p.toLowerCase() === l.trim().toLowerCase());
  const [where, setWhere] = useState(issue ? known(issue.location) || OTHER : '');
  const [otherWhere, setOtherWhere] = useState(issue && !known(issue.location) ? issue.location : '');
  const [description, setDescription] = useState(issue?.description || '');
  const [severity, setSeverity] = useState<IssueSeverity | ''>(issue?.severity || '');
  const [noticed, setNoticed] = useState(issue?.noticedOn || localDay());
  const [custom, setCustom] = useState(!!issue && issue.noticedOn !== localDay() && issue.noticedOn !== yesterday());
  const [notes, setNotes] = useState(issue?.notes || '');
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const kept = (useIssuePhotos(issue || null) || []).filter(p => !removed.includes(p.uuid));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const location = where === OTHER ? otherWhere.trim() : where;
  const room = MAX_PHOTOS - kept.length - added.length;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, room)) next.push(await readImage(file));
      setAdded(a => [...a, ...next]);
      if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos per issue.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save() {
    if (!location) return setError(where === OTHER ? 'Say where the issue is.' : 'Choose where the issue is.');
    if (!description.trim()) return setError('Describe what’s happening.');
    if (!severity) return setError('Choose a severity.');
    setBusy(true); setError('');
    try {
      const fields = { location, description: description.trim(), severity, noticedOn: noticed, notes: notes.trim() || null };
      if (issue) await state.update(issue.uuid, { ...fields, addPhotos: added, removePhotos: removed });
      else await state.create({ ...fields, photos: added });
      onSaved?.(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <Drawer eyebrow="YOUR PROPERTY" title={issue ? 'Edit issue' : 'Report an issue'} onClose={() => { if (!busy) onClose(); }}
    footer={<div className="pi-footer">{error && <p role="alert">{error}</p>}<DrawerButton onClick={onClose} disabled={busy}>Cancel</DrawerButton><DrawerButton primary onClick={save} disabled={busy}>{busy ? 'Saving…' : issue ? 'Save changes' : 'Save issue'}</DrawerButton></div>}>
    <form className="pi-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      {!issue && <p className="pi-intro">Tell me what’s going on and I’ll track it, help troubleshoot, and help you find a repair option.</p>}
      <fieldset disabled={busy}>
        <legend>Where is the issue?</legend>
        <div className="pi-choices pi-where">{[...places, OTHER].map(p => <button key={p} type="button" aria-pressed={where === p} onClick={() => setWhere(p)}>
          {ICONS[p] || PIN}<span>{p}</span></button>)}</div>
        {where === OTHER && <label className="pi-label">Where exactly?<input value={otherWhere} maxLength={100} onChange={e => setOtherWhere(e.target.value)} placeholder="e.g. Garage door, upstairs bathroom" autoFocus /></label>}
      </fieldset>
      <fieldset disabled={busy}>
        <label className="pi-legend" htmlFor="pi-description">What’s happening?</label>
        <textarea id="pi-description" value={description} maxLength={4000} rows={3} onChange={e => setDescription(e.target.value)} placeholder="e.g. Downstairs HVAC is not cooling. Thermostat says the system is on and the fan runs, but the air isn't cold." />
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Severity</legend>
        <div className="pi-choices pi-severity">{SEVERITIES.map(s => <button key={s.id} type="button" className={`pi-sev-${s.id}`} aria-pressed={severity === s.id} onClick={() => setSeverity(s.id)}>
          <i aria-hidden="true" /><span><strong>{s.label}</strong><small>{s.note}</small></span></button>)}</div>
        {severity === 'emergency' && <p className="pi-safety" role="note">If anyone is in danger — fire, a gas smell, sparking or flooding near power — get out and call 911 first.</p>}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>When did you notice it?</legend>
        <div className="pi-choices pi-when">
          <button type="button" aria-pressed={!custom && noticed === localDay()} onClick={() => { setCustom(false); setNoticed(localDay()); }}>Today</button>
          <button type="button" aria-pressed={!custom && noticed === yesterday()} onClick={() => { setCustom(false); setNoticed(yesterday()); }}>Yesterday</button>
          <label className={`pi-date${custom ? ' pi-on' : ''}`}><span className="sr-only">Custom date</span><input type="date" max={localDay()} value={custom ? noticed : ''} onChange={e => { if (e.target.value) { setCustom(true); setNoticed(e.target.value); } }} /></label>
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Photos <small>(optional)</small></legend>
        <div className="pi-photos">
          {kept.map(p => <figure key={p.uuid}><img src={p.image} alt="Issue photo" /><button type="button" aria-label="Remove photo" onClick={() => setRemoved(r => [...r, p.uuid])}>✕</button></figure>)}
          {added.map((src, i) => <figure key={i}><img src={src} alt="New issue photo" /><button type="button" aria-label="Remove photo" onClick={() => setAdded(a => a.filter((_, j) => j !== i))}>✕</button></figure>)}
          {room > 0 && <label className="pi-add-photo"><input type="file" accept="image/*" multiple onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} /><span aria-hidden="true">＋</span>Add photos</label>}
        </div>
        <p className="pi-muted">Up to {MAX_PHOTOS}. Photos are stored with this issue — leave the kids out of the frame.</p>
      </fieldset>
      <fieldset disabled={busy}>
        <label className="pi-legend" htmlFor="pi-notes">Anything else Athena should know? <small>(optional)</small></label>
        <textarea id="pi-notes" value={notes} maxLength={4000} rows={3} onChange={e => setNotes(e.target.value)} placeholder="e.g. Soccer practice tonight and it's getting warm downstairs." />
      </fieldset>
    </form>
  </Drawer>;
}

function IssueActions({ issue, onView, onTroubleshoot, onFindPro }: { issue: PropertyIssue; onView?: () => void; onTroubleshoot: (i: PropertyIssue) => void; onFindPro: (i: PropertyIssue) => void }) {
  return <div className="pi-actions">
    {onView && <DrawerButton className="pi-view" onClick={onView}>View details <span aria-hidden="true">→</span></DrawerButton>}
    <DrawerButton onClick={() => onTroubleshoot(issue)}>Troubleshoot with Athena</DrawerButton>
    <DrawerButton onClick={() => onFindPro(issue)}>Find a pro</DrawerButton>
  </div>;
}

// Web addresses and US-style phone numbers in a note become links: the note is
// usually a trail of who was called, so the number should be one tap away.
const LINKABLE = /(https?:\/\/[^\s]+|www\.[^\s]+|\(?\d{3}\)?[\s.-]?\d{3}[-.\s]\d{4}\b)/g;
export function linkify(text: string): ReactNode[] {
  return text.split(LINKABLE).map((part, i) => {
    if (i % 2 === 0) return part;
    const trail = part.match(/[.,;:!?)]+$/)?.[0] && /^https?:|^www\./.test(part) ? part.match(/[.,;:!?)]+$/)![0] : '';
    const core = trail ? part.slice(0, -trail.length) : part;
    const href = /^\(?\d/.test(core) ? `tel:${core.replace(/[^\d]/g, '')}` : /^www\./.test(core) ? `https://${core}` : core;
    return <span key={i}><a href={href} target={href.startsWith('tel:') ? undefined : '_blank'} rel="noreferrer">{core}</a>{trail}</span>;
  });
}

function IssueNotes({ state, issue }: { state: IssuesState; issue: PropertyIssue }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true); setError('');
    try { await state.addNote(issue.uuid, draft.trim()); setDraft(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const drop = async (note: string) => {
    setBusy(true); setError('');
    try { await state.removeNote(issue.uuid, note); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="pi-notes" aria-label="Notes">
    <h3>Notes</h3>
    {issue.log.length ? <ol>{issue.log.map(n => <li key={n.uuid}>
      <time dateTime={n.createdAt}>{reportedWhen(n.createdAt)}</time>
      <p>{linkify(n.body)}</p>
      <button type="button" aria-label="Delete note" title="Delete note" onClick={() => drop(n.uuid)} disabled={busy}>✕</button>
    </li>)}</ol> : <p className="pi-muted">Keep a running log here — calls made, quotes, what you tried.</p>}
    <form onSubmit={e => { e.preventDefault(); void add(); }}>
      <textarea value={draft} maxLength={2000} rows={2} disabled={busy} placeholder="e.g. Left a voicemail for the HVAC company at 8:45"
        onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void add(); } }} />
      <DrawerButton type="submit" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Add note'}</DrawerButton>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}

/** The most severe open issue, across the top of the Property page. */
export function ActiveIssueBanner({ issues, onOpen, onTroubleshoot, onFindPro, onShowAll }: { issues: PropertyIssue[]; onOpen: (uuid: string) => void; onTroubleshoot: (i: PropertyIssue) => void; onFindPro: (i: PropertyIssue) => void; onShowAll: () => void }) {
  const open = issues.filter(i => i.status === 'open');
  const top = open[0];
  if (!top) return null;
  return <section className={`pi-banner pi-sev-${top.severity}`} aria-label="Active property issue">
    <div className="pi-banner-head">
      <span className="pi-banner-icon">{WARNING}</span>
      <div className="pi-banner-title"><h2>{top.location}</h2><p><span className="pi-active">Active</span> · Reported {reportedWhen(top.createdAt)}</p></div>
      <span className={`pi-chip pi-sev-${top.severity}`}>{severityLabel(top.severity)}</span>
    </div>
    <p className="pi-banner-body">{top.description}</p>
    <IssueActions issue={top} onView={() => onOpen(top.uuid)} onTroubleshoot={onTroubleshoot} onFindPro={onFindPro} />
    {open.length > 1 && <button type="button" className="pi-more" onClick={onShowAll}>+{open.length - 1} more open issue{open.length > 2 ? 's' : ''}</button>}
  </section>;
}

/** Every issue, open first; the Issues panel on Overview and the Issues tab. */
export function IssueList({ state, onOpen, onReport, limit }: { state: IssuesState; onOpen: (uuid: string) => void; onReport: () => void; limit?: number }) {
  const shown = limit ? state.issues.filter(i => i.status === 'open').slice(0, limit) : state.issues;
  return <div className="pi-list">
    {state.error && <p role="alert">{state.error} <button onClick={state.retry}>Retry</button></p>}
    {state.loading ? <p className="pi-muted">Loading issues…</p> : !shown.length ? <p className="pi-muted">{state.issues.length ? 'No open issues. Everything reported is resolved.' : 'Nothing reported. When something breaks or looks wrong, report it here and I’ll keep track.'}</p>
      : <ul>{shown.map(i => <li key={i.uuid}><button type="button" className={i.status === 'resolved' ? 'pi-resolved' : ''} onClick={() => onOpen(i.uuid)}>
        <span className={`pi-dot pi-sev-${i.severity}`} aria-hidden="true" />
        <span className="pi-list-text"><strong>{i.location}</strong><small>{i.description}</small></span>
        <span className="pi-list-meta">{i.status === 'resolved' ? 'Resolved' : severityLabel(i.severity)}<time dateTime={i.createdAt}>{reportedWhen(i.createdAt)}</time></span>
      </button></li>)}</ul>}
    <div className="pi-list-foot"><DrawerButton primary onClick={onReport}><span aria-hidden="true">＋</span>Report an issue</DrawerButton></div>
  </div>;
}

export function IssueDetailsDrawer({ state, issue, onClose, onEdit, onTroubleshoot, onFindPro }: { state: IssuesState; issue: PropertyIssue; onClose: () => void; onEdit: () => void; onTroubleshoot: (i: PropertyIssue) => void; onFindPro: (i: PropertyIssue) => void }) {
  const photos = useIssuePhotos(issue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const run = async (fn: () => Promise<void>, close = false) => {
    setBusy(true); setError('');
    try { await fn(); if (close) onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Drawer eyebrow="PROPERTY ISSUE" title={issue.location} onClose={() => { if (!busy) onClose(); }}>
    <div className="pi-details">
      <div className="pi-details-status"><span className={`pi-chip pi-sev-${issue.severity}`}>{severityLabel(issue.severity)}</span>
        <span>{issue.status === 'open' ? <span className="pi-active">Active</span> : `Resolved ${issue.resolvedAt ? reportedWhen(issue.resolvedAt) : ''}`}</span></div>
      <p className="pi-details-body">{issue.description}</p>
      <dl>
        <dt>Noticed</dt><dd>{noticedWhen(issue.noticedOn)}</dd>
        <dt>Reported</dt><dd>{reportedWhen(issue.createdAt)}</dd>
        {issue.notes && <><dt>For Athena</dt><dd>{issue.notes}</dd></>}
      </dl>
      {issue.photos.length > 0 && <div className="pi-photos">{photos === null ? <p className="pi-muted">Loading photos…</p> : photos.map(p => <figure key={p.uuid}><a href={p.image} target="_blank" rel="noreferrer"><img src={p.image} alt={`Photo of ${issue.location}`} /></a></figure>)}</div>}
      {issue.status === 'open' && <IssueActions issue={issue} onTroubleshoot={onTroubleshoot} onFindPro={onFindPro} />}
      <IssueNotes state={state} issue={issue} />
      <div className="pi-details-manage">
        <DrawerButton onClick={onEdit} disabled={busy}>Edit</DrawerButton>
        {issue.status === 'open'
          ? <DrawerButton primary onClick={() => run(() => state.update(issue.uuid, { status: 'resolved' }), true)} disabled={busy}>Mark resolved</DrawerButton>
          : <DrawerButton onClick={() => run(() => state.update(issue.uuid, { status: 'open' }))} disabled={busy}>Reopen</DrawerButton>}
        {confirming ? <DrawerButton className="pi-danger" onClick={() => run(() => state.remove(issue.uuid), true)} disabled={busy}>Delete for good</DrawerButton>
          : <DrawerButton onClick={() => setConfirming(true)} disabled={busy}>Delete</DrawerButton>}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </Drawer>;
}
