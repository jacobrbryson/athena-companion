import { useEffect, useRef, useState } from 'react';
import { projectsApi, PHASES, type Phase, type Project, type ProjectEntry, type EntryType } from '../api/projects';
import { downscale, savePhoto, loadPhotoUrl, deletePhoto } from './photoStore';
import type { ProjectsState } from './Projects';

/**
 * A project's journal: photos (concept, before, progress, after, memory) and
 * notes or decisions.
 *
 * The children rule: a project that involves children — or a photo you mark as
 * having children in it — keeps the picture on THIS device (IndexedDB, the same
 * store as photo memories). Only its caption reaches the server, and the server
 * refuses the bytes anyway. Adults' photos are uploaded to a private bucket and
 * come back only through the API.
 */

const PHASE_LABEL: Record<Phase, string> = { concept: 'Concept', before: 'Before', progress: 'Progress', after: 'After', memory: 'Memory' };
const field = 'w-full rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';

/** One photo's picture: fetched from the API, or read from this device. */
export function Picture({ project, entry }: { project: Project; entry: ProjectEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    const load = entry.media === 'server'
      ? projectsApi.image(project.uuid, entry.uuid).then(b => (made = URL.createObjectURL(b)))
      : entry.deviceRef ? loadPhotoUrl(entry.deviceRef).then(u => (made = u)) : Promise.resolve(null);
    load.then(u => { if (alive) { setUrl(u); setMissing(!u); } }).catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [project.uuid, entry.uuid, entry.media, entry.deviceRef]);
  if (url) return <img src={url} alt={entry.body || `${entry.phase ?? 'project'} photo`} className="aspect-square w-full rounded object-cover" />;
  return <div className="flex aspect-square w-full items-center justify-center rounded border border-dashed border-slate-700 p-2 text-center text-[10px] text-slate-500">
    {missing ? (entry.media === 'device' ? 'Kept on the device that took it' : 'Photo unavailable') : 'Loading…'}
  </div>;
}

export function ProjectJournal({ state, project }: { state: ProjectsState; project: Project }) {
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('progress');
  const [caption, setCaption] = useState('');
  const [kidPhoto, setKidPhoto] = useState(false);
  const [noteType, setNoteType] = useState<EntryType>('note');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const children = project.involvesChildren || kidPhoto;

  // Reload whenever the snapshot says the journal changed.
  useEffect(() => {
    let alive = true;
    projectsApi.entries(project.uuid)
      .then(r => { if (alive) { setEntries(r.entries); setLoaded(true); setError(''); } })
      .catch(e => { if (alive) { setError((e as Error).message); setLoaded(true); } });
    return () => { alive = false; };
  }, [project.uuid, project.media.entries]);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const { blob, base64 } = await downscale(file, 1600, 0.85);
      if (children) {
        const ref = `proj-${crypto.randomUUID()}`;
        await savePhoto(ref, blob);
        await state.run(() => projectsApi.addEntry(project.uuid, { type: 'photo', phase, body: caption || null, deviceRef: ref, involvesChildren: true }));
      } else {
        await state.run(() => projectsApi.addEntry(project.uuid, { type: 'photo', phase, body: caption || null, image: base64 }));
      }
      setCaption('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (e: ProjectEntry) => {
    if (!window.confirm(e.type === 'photo' ? 'Delete this photo?' : 'Delete this note?')) return;
    if (await state.run(() => projectsApi.removeEntry(project.uuid, e.uuid)) && e.deviceRef) await deletePhoto(e.deviceRef);
  };

  const photos = entries.filter(e => e.type === 'photo')
    .sort((a, b) => PHASES.indexOf(a.phase ?? 'progress') - PHASES.indexOf(b.phase ?? 'progress') || (a.takenAt ?? a.createdAt).localeCompare(b.takenAt ?? b.createdAt));
  const notes = entries.filter(e => e.type !== 'photo');

  return <details open className="mb-4 rounded-lg border border-slate-800 p-3">
    <summary className="cursor-pointer text-xs uppercase tracking-[0.25em] text-cyan-300">Photos &amp; notes ({entries.length})</summary>
    <div className="mt-3 flex flex-col gap-3">
      {(error || state.error) && <p role="alert" className="text-sm text-amber-200">{error || state.error}</p>}
      {!loaded && <p className="text-xs text-slate-400">Loading…</p>}

      {photos.length > 0 && <ul className="grid grid-cols-3 gap-2">{photos.map(e => <li key={e.uuid} className="flex flex-col gap-1">
        <Picture project={project} entry={e} />
        <select aria-label="Phase" value={e.phase ?? 'progress'} className="rounded border border-slate-800 bg-slate-950 text-[10px]"
          onChange={ev => void state.run(() => projectsApi.updateEntry(project.uuid, e.uuid, { phase: ev.target.value as Phase }))}>
          {PHASES.map(p => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
        </select>
        <input defaultValue={e.body ?? ''} key={`${e.uuid}-${e.body}`} aria-label="Caption" placeholder="Caption" maxLength={500}
          className="min-w-0 bg-transparent text-[11px] text-slate-300"
          onBlur={ev => { const v = ev.target.value.trim(); if (v !== (e.body ?? '')) void state.run(() => projectsApi.updateEntry(project.uuid, e.uuid, { body: v || null })); }} />
        <button type="button" className="self-start text-[10px] text-slate-500 hover:text-rose-300" onClick={() => void remove(e)}>Delete</button>
      </li>)}</ul>}

      <div className="flex flex-col gap-2 rounded border border-slate-800 p-2">
        <div className="flex gap-2">
          <select aria-label="Photo phase" className={`${field} max-w-[8rem]`} value={phase} onChange={e => setPhase(e.target.value as Phase)}>
            {PHASES.map(p => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
          </select>
          <input className={`${field} min-w-0 flex-1`} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (optional)" aria-label="Photo caption" maxLength={500} />
        </div>
        {!project.involvesChildren && <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={kidPhoto} onChange={e => setKidPhoto(e.target.checked)} /> Children in this photo (keep it on this device)
        </label>}
        {project.involvesChildren && <p className="text-xs text-slate-400">This project involves children, so its photos stay on this device — only the caption is saved.</p>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        <button type="button" className="dashboard-chat-cta self-start" disabled={uploading || state.busy} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Adding…' : 'Add a photo'} <span>+</span>
        </button>
      </div>

      {notes.length > 0 && <ul className="flex flex-col gap-2">{notes.map(e => <li key={e.uuid} className="rounded border border-slate-800 p-2 text-sm">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
          <span>{e.type}</span><span>{new Date(e.takenAt ?? e.createdAt).toLocaleDateString()}</span>{e.source === 'chat' && <span>· from chat</span>}
          <span className="flex-1" />
          <button type="button" className="normal-case tracking-normal hover:text-rose-300" onClick={() => void remove(e)}>Delete</button>
        </div>
        <textarea defaultValue={e.body ?? ''} key={`${e.uuid}-${e.body}`} rows={2} aria-label="Note" className="w-full bg-transparent text-slate-200"
          onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== e.body) void state.run(() => projectsApi.updateEntry(project.uuid, e.uuid, { body: v })); }} />
      </li>)}</ul>}

      <form className="flex flex-col gap-2" onSubmit={async e => {
        e.preventDefault();
        if (note.trim() && await state.run(() => projectsApi.addEntry(project.uuid, { type: noteType, body: note }))) setNote('');
      }}>
        <div className="flex gap-2">
          <select aria-label="Entry type" className={`${field} max-w-[8rem]`} value={noteType} onChange={e => setNoteType(e.target.value as EntryType)}>
            <option value="note">Note</option><option value="decision">Decision</option><option value="measurement">Measurement</option>
          </select>
          <textarea rows={2} className={`${field} min-w-0 flex-1`} value={note} onChange={e => setNote(e.target.value)} placeholder="What happened, what you decided and why…" aria-label="New note" />
        </div>
        <button className="dashboard-chat-cta self-start" disabled={state.busy || !note.trim()}>Add to journal</button>
      </form>
    </div>
  </details>;
}
