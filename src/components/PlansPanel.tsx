import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { dashboardApi, type Place, type HomeProject, type ProjectStatus } from '../api/dashboard';

/**
 * The two lists behind the Right Now card: places worth going to, and work
 * waiting at home.
 *
 * Both are the person's own. Athena reads a place's page on her own rhythm and
 * reports what it says — there is no control here for how often, for the same
 * reason the news panel has none. What she never does is add, finish or remove
 * anything on either list: that is this panel, or an action she proposes and
 * someone approves.
 *
 * The import exists once, for the move out of a spreadsheet, and it previews
 * before it writes — the first thing anyone wants to know about an import is
 * what it thinks their columns mean.
 */

const ago = (at: string | null) => {
  if (!at) return 'not yet';
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

const statusLabel: Record<ProjectStatus, string> = {
  todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done',
};
/** Tapping the status walks it forward; "blocked" is set deliberately, not by accident. */
const nextStatus: Record<ProjectStatus, ProjectStatus> = {
  todo: 'in_progress', in_progress: 'done', done: 'todo', blocked: 'todo',
};

const field = 'w-full rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';
// Inside a flex row, w-full would let one input claim the whole line and
// squeeze the other to nothing.
const rowField = 'min-w-0 flex-1 rounded-lg border border-cyan-800 bg-slate-950 p-2 text-sm';

export function PlansPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [projects, setProjects] = useState<HomeProject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<'places' | 'projects'>('places');

  const [place, setPlace] = useState({ url: '', label: '', activity: '', distanceMi: '', coords: '' });
  const [project, setProject] = useState({ title: '', area: '', effortHours: '', priority: 'normal', indoor: '' });
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState<{ count: number; columns: string[]; unmapped: string[]; skipped: number } | null>(null);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([dashboardApi.places(), dashboardApi.projects()])
      .then(([p, j]) => { if (!active) return; setPlaces(p.places); setProjects(j.projects); setLoaded(true); })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [attempt]);

  const reload = () => setAttempt(a => a + 1);
  const run = async (key: string, work: () => Promise<string | void>) => {
    setBusy(key); setError(''); setNote('');
    try {
      const message = await work();
      if (message) setNote(message);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  /**
   * "35.6516, -80.9337" — what you get from right-clicking a map. Coordinates
   * are optional and only ever used to ask the forecast about that spot; a
   * place without them still works, it just never gets a weather line.
   */
  const parseCoords = (value: string) => {
    const [lat, lon] = value.split(',').map(part => Number(part.trim()));
    return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : {};
  };

  const addPlace = () => run('add-place', async () => {
    await dashboardApi.addPlace({
      url: place.url.trim(),
      label: place.label.trim() || undefined,
      activity: place.activity.trim(),
      distanceMi: place.distanceMi.trim() ? Number(place.distanceMi) : null,
      ...parseCoords(place.coords),
    });
    setPlace({ url: '', label: '', activity: '', distanceMi: '', coords: '' });
    reload();
    return 'Added. I’ve read the page once already.';
  });

  const addProject = () => run('add-project', async () => {
    await dashboardApi.addProject({
      title: project.title.trim(),
      area: project.area.trim() || null,
      effortMinutes: project.effortHours.trim() ? Math.round(Number(project.effortHours) * 60) : null,
      priority: project.priority as HomeProject['priority'],
      indoor: project.indoor === '' ? null : project.indoor === 'yes',
    });
    setProject({ title: '', area: '', effortHours: '', priority: 'normal', indoor: '' });
    reload();
  });

  const importRows = (dryRun: boolean) => run(dryRun ? 'preview' : 'import', async () => {
    const result = await dashboardApi.importProjects(paste, dryRun);
    if (dryRun) {
      setPreview({ count: result.projects.length, columns: result.columns, unmapped: result.unmapped, skipped: result.skipped.length });
      return `${result.projects.length} project${result.projects.length === 1 ? '' : 's'} ready to import.`;
    }
    setPreview(null);
    setPaste('');
    reload();
    return `Imported ${result.created} project${result.created === 1 ? '' : 's'}${result.skipped.length ? `, skipped ${result.skipped.length}` : ''}.`;
  });

  const openLine = (p: Place) => {
    if (p.now.openNow === true) return `Open${p.now.closesAt ? ` until ${p.now.closesAt}` : ''}`;
    if (p.now.openNow === false) return p.now.why;
    return 'I can’t tell from the page whether it’s open';
  };

  return <Drawer eyebrow="YOUR DAY" title="Places & projects" onClose={onClose}>
    <p className="mb-4 text-sm text-slate-300">
      What I weigh when I tell you what to do with a free afternoon. I read a place’s page on my own
      rhythm and report what it says; I never add or finish anything here myself.
    </p>

    <div className="mb-5 flex gap-2 text-xs">
      {(['places', 'projects'] as const).map(name => <button
        key={name} onClick={() => setTab(name)}
        className={`rounded-full border px-3 py-1 uppercase tracking-widest ${tab === name ? 'border-cyan-400 text-cyan-200' : 'border-slate-700 text-slate-400'}`}
      >{name}</button>)}
    </div>

    {error && <p role="alert" className="mb-4 text-sm text-amber-200">{error} {!loaded && <button onClick={reload} className="underline">Retry</button>}</p>}
    {note && <p role="status" className="mb-4 text-sm text-cyan-200">{note}</p>}
    {!loaded && !error && <p className="text-sm text-slate-400">Loading your lists…</p>}

    {tab === 'places' && <>
      <form onSubmit={e => { e.preventDefault(); void addPlace(); }} className="mb-6 flex flex-col gap-2">
        <label htmlFor="place-url" className="text-sm">Add a place</label>
        <input id="place-url" className={field} value={place.url} onChange={e => setPlace({ ...place, url: e.target.value })}
          placeholder="ncparks.gov/state-parks/lake-norman-state-park" maxLength={500} />
        <input className={field} value={place.label} onChange={e => setPlace({ ...place, label: e.target.value })}
          placeholder="What you call it (optional)" maxLength={120} />
        <div className="flex gap-2">
          <input className={rowField} value={place.activity} onChange={e => setPlace({ ...place, activity: e.target.value })}
            placeholder="What it’s for — mountain biking" maxLength={64} />
          <input className={`${rowField} max-w-[6rem] shrink-0`} value={place.distanceMi} onChange={e => setPlace({ ...place, distanceMi: e.target.value })}
            placeholder="miles" inputMode="decimal" />
        </div>
        <input className={field} value={place.coords} onChange={e => setPlace({ ...place, coords: e.target.value })}
          placeholder="Map coordinates (optional) — 35.6516, -80.9337" maxLength={48} />
        <p className="text-xs text-slate-400">
          The activity is how I line a place up with what you actually do — say it the way you’d say it out loud.
          Coordinates are only used to check the forecast for that spot; without them I’ll stay quiet about the weather.
        </p>
        <button className="dashboard-chat-cta self-start" disabled={!loaded || !!busy || !place.url.trim() || !place.activity.trim()}>
          {busy === 'add-place' ? 'Reading the page…' : 'Add this place'}
        </button>
      </form>

      <ul className="flex flex-col gap-3">
        {places.map(p => <li key={p.uuid} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{p.label}</p>
              <p className="truncate text-xs text-slate-500">{p.activity}{p.distanceMi != null && ` · ${p.distanceMi} mi`}</p>
            </div>
            <button onClick={() => void run(p.uuid, async () => { await dashboardApi.removePlace(p.uuid); reload(); })}
              disabled={!!busy} className="shrink-0 text-xs text-slate-400 underline hover:text-amber-200">Remove</button>
          </div>
          <p className={`mt-2 text-xs ${p.now.openNow === true ? 'text-cyan-200' : p.now.openNow === false ? 'text-slate-300' : 'text-amber-200'}`}>
            {openLine(p)}
          </p>
          {p.now.todaysHours.length > 0 && <p className="mt-1 text-xs text-slate-500">Today: {p.now.todaysHours.join(', ')}</p>}
          {p.weatherDependent && <p className="mt-1 text-xs text-slate-500">Hours here depend on the weather.</p>}
          <p className="mt-1 text-xs text-slate-500">
            Read {ago(p.lastCheckedAt)}
            {' · '}
            <button className="underline" disabled={!!busy}
              onClick={() => void run(p.uuid, async () => { await dashboardApi.checkPlace(p.uuid); reload(); return 'Read it again just now.'; })}>
              {busy === p.uuid ? 'checking…' : 'check now'}
            </button>
          </p>
          {p.lastError && <p className="mt-1 text-xs text-amber-200">Last time: {p.lastError}</p>}
        </li>)}
        {loaded && !places.length && <p className="text-sm text-slate-400">No places yet. Add the park, the pool, the trailhead — anywhere whose hours decide your afternoon.</p>}
      </ul>
    </>}

    {tab === 'projects' && <>
      <form onSubmit={e => { e.preventDefault(); void addProject(); }} className="mb-6 flex flex-col gap-2">
        <label htmlFor="project-title" className="text-sm">Add a project</label>
        <input id="project-title" className={field} value={project.title} onChange={e => setProject({ ...project, title: e.target.value })}
          placeholder="Rehang the garage shelves" maxLength={190} />
        <div className="flex gap-2">
          <input className={rowField} value={project.area} onChange={e => setProject({ ...project, area: e.target.value })}
            placeholder="Where — garage, yard" maxLength={80} />
          <input className={`${rowField} max-w-[5.5rem] shrink-0`} value={project.effortHours} onChange={e => setProject({ ...project, effortHours: e.target.value })}
            placeholder="hours" inputMode="decimal" />
        </div>
        <div className="flex gap-2">
          <select className={rowField} value={project.priority} onChange={e => setProject({ ...project, priority: e.target.value })}>
            <option value="low">Low priority</option>
            <option value="normal">Normal</option>
            <option value="high">High priority</option>
          </select>
          <select className={rowField} value={project.indoor} onChange={e => setProject({ ...project, indoor: e.target.value })}>
            <option value="">Indoors or out?</option>
            <option value="yes">Indoors</option>
            <option value="no">Outdoors</option>
          </select>
        </div>
        <p className="text-xs text-slate-400">
          Hours and indoors/outdoors are the two that earn their keep: one decides what fits your
          afternoon, the other decides what I suggest when it rains.
        </p>
        <button className="dashboard-chat-cta self-start" disabled={!loaded || !!busy || !project.title.trim()}>Add to the list</button>
      </form>

      <ul className="mb-6 flex flex-col gap-2">
        {projects.map(p => <li key={p.uuid} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{p.title}</p>
              <p className="truncate text-xs text-slate-500">
                {[p.area, p.effortMinutes ? `${Math.round(p.effortMinutes / 6) / 10}h` : null, p.indoor === true ? 'indoors' : p.indoor === false ? 'outdoors' : null]
                  .filter(Boolean).join(' · ') || 'No details yet'}
              </p>
            </div>
            <button onClick={() => void run(p.uuid, async () => { await dashboardApi.removeProject(p.uuid); reload(); })}
              disabled={!!busy} className="shrink-0 text-xs text-slate-400 underline hover:text-amber-200">Remove</button>
          </div>
          <button
            className="mt-2 rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-cyan-500"
            disabled={!!busy}
            onClick={() => void run(p.uuid, async () => { await dashboardApi.updateProject(p.uuid, { status: nextStatus[p.status] }); reload(); })}
          >{statusLabel[p.status]}</button>
        </li>)}
        {loaded && !projects.length && <p className="text-sm text-slate-400">Nothing on the list yet.</p>}
      </ul>

      <details className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <summary className="cursor-pointer text-sm text-slate-200">Bring in a spreadsheet</summary>
        <p className="mt-2 text-xs text-slate-400">
          In Google Sheets: File → Download → Comma-separated values, then open it and paste it here.
          Copying the rows straight out of the sheet works too. I’ll show you what I made of your
          columns before anything is saved.
        </p>
        <textarea rows={5} value={paste} onChange={e => { setPaste(e.target.value); setPreview(null); }}
          className={`${field} mt-2 font-mono text-xs`} placeholder={'Task,Room,Status,Est. Hours,Indoor\nRehang garage shelves,Garage,Not started,2,Yes'} />
        {preview && <p className="mt-2 text-xs text-slate-300">
          {preview.count} project{preview.count === 1 ? '' : 's'} from columns: {preview.columns.join(', ')}.
          {preview.unmapped.length > 0 && ` I couldn’t place: ${preview.unmapped.join(', ')}.`}
          {preview.skipped > 0 && ` ${preview.skipped} row${preview.skipped === 1 ? '' : 's'} skipped.`}
        </p>}
        <div className="mt-2 flex gap-2">
          <button className="dashboard-chat-cta" disabled={!!busy || !paste.trim()} onClick={() => void importRows(true)}>
            {busy === 'preview' ? 'Reading…' : 'Preview'}
          </button>
          <button className="dashboard-chat-cta" disabled={!!busy || !paste.trim() || !preview} onClick={() => void importRows(false)}>
            {busy === 'import' ? 'Importing…' : 'Import them'}
          </button>
        </div>
      </details>
    </>}
  </Drawer>;
}
