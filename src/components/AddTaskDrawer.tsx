import { useEffect, useState } from 'react';
import { actionsApi } from '../api/companion';
import { dashboardApi, type TaskTargets } from '../api/dashboard';
import { DASHBOARD_REFRESH_EVENT } from '../athena/useChat';
import { DrawerButton } from './ActionControls';
import { Drawer } from './Drawer';
import './propertyIssues.css';
import './addTask.css';

/**
 * The Tasks card's Add task drawer (owner, 2026-11-20): "add tasks from within
 * that card ... toggle between Google Tasks and Jira". Pressing Add is the
 * approval — the direct actions create_google_task / create_jira_issue, which
 * check the list or project against the person's own account server-side.
 * Built on the Property drawers' .pi-form so it reads like the rest of the app.
 */

type Source = 'google' | 'jira';
const SOURCE_KEY = 'athena.addTask.source';
const localDay = (d = new Date()) => d.toLocaleDateString('en-CA');
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return localDay(d); };

function rememberedSource(): Source {
  try { return localStorage.getItem(SOURCE_KEY) === 'jira' ? 'jira' : 'google'; } catch { return 'google'; }
}

const GOOGLE_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12.2 2.4 2.4 4.8-5" /></svg>;
const JIRA_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 3 12l9 9 9-9-9-9Zm0 5.2L15.8 12 12 15.8 8.2 12 12 8.2Z" /></svg>;

const WHY: Record<string, string> = {
  not_connected: 'Not connected',
  read_only: 'Read-only link',
  unavailable: 'Unavailable right now',
};

export function AddTaskDrawer({ onClose, onAdded }: { onClose: () => void; onAdded?: (text: string) => void }) {
  const [targets, setTargets] = useState<TaskTargets | null>(null);
  const [loadError, setLoadError] = useState('');
  const [source, setSource] = useState<Source>(rememberedSource);
  const [title, setTitle] = useState('');
  const [list, setList] = useState('');
  const [project, setProject] = useState('');
  const [due, setDue] = useState('');
  const [custom, setCustom] = useState(false);
  const [notes, setNotes] = useState('');
  const [inSprint, setInSprint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    dashboardApi.taskTargets().then(t => {
      if (!live) return;
      setTargets(t);
      if ('lists' in t.google && t.google.lists[0]) setList(t.google.lists[0].id);
      if ('projects' in t.jira && t.jira.projects[0]) setProject(t.jira.projects[0].key);
      // Start on a side that can take a task.
      setSource(s => (s === 'jira' && !('projects' in t.jira) && 'lists' in t.google) ? 'google'
        : (s === 'google' && !('lists' in t.google) && 'projects' in t.jira) ? 'jira' : s);
    }).catch(e => { if (live) setLoadError((e as Error).message || 'Couldn’t load your lists.'); });
    return () => { live = false; };
  }, []);

  const google = targets && 'lists' in targets.google ? targets.google : null;
  const jira = targets && 'projects' in targets.jira ? targets.jira : null;
  const sideReady = source === 'google' ? !!google?.lists.length : !!jira?.projects.length;
  const sideWhy = !targets ? null
    : source === 'google' ? ('error' in targets.google ? targets.google.error : !google?.lists.length ? 'unavailable' : null)
      : ('error' in targets.jira ? targets.jira.error : !jira?.projects.length ? 'no_projects' : null);

  function choose(s: Source) {
    setSource(s); setError('');
    try { localStorage.setItem(SOURCE_KEY, s); } catch { /* per-viewer convenience only */ }
  }

  async function save() {
    const text = title.trim();
    if (!text) return setError(source === 'jira' ? 'Give the issue a summary.' : 'Say what needs doing.');
    setBusy(true); setError('');
    try {
      if (source === 'google') {
        if (!list) throw new Error('Choose a list.');
        await actionsApi.perform('create_google_task', { title: text, task_list: list, ...(due ? { task_due: due } : {}), ...(notes.trim() ? { task_notes: notes.trim() } : {}) });
        onAdded?.(`Added “${text}” to ${google?.lists.find(l => l.id === list)?.title || 'Google Tasks'}`);
      } else {
        if (!project) throw new Error('Choose a project.');
        const res = await actionsApi.perform('create_jira_issue', { summary: text, project_key: project, in_sprint: inSprint, ...(due ? { task_due: due } : {}), ...(notes.trim() ? { description: notes.trim() } : {}) });
        onAdded?.(`Created ${res.action?.result_ref || 'the issue'} in ${jira?.projects.find(p => p.key === project)?.name || 'Jira'}`);
      }
      window.dispatchEvent(new Event(DASHBOARD_REFRESH_EVENT));
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Couldn’t add it.');
    } finally {
      setBusy(false);
    }
  }

  const dueChoices = [{ label: 'No date', value: '' }, { label: 'Today', value: localDay() }, { label: 'Tomorrow', value: plusDays(1) }];

  return <Drawer eyebrow="YOUR TASKS" title="Add a task" onClose={() => { if (!busy) onClose(); }}
    footer={<div className="pi-footer">{error && <p role="alert">{error}</p>}
      <DrawerButton onClick={onClose} disabled={busy}>Cancel</DrawerButton>
      <DrawerButton primary onClick={() => void save()} disabled={busy || !sideReady}>{busy ? 'Adding…' : source === 'jira' ? 'Create issue' : 'Add task'}</DrawerButton></div>}>
    <form className="pi-form at-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy}>
        <legend>Add to</legend>
        <div className="pi-choices at-source" role="group" aria-label="Where the task goes">
          <button type="button" aria-pressed={source === 'google'} onClick={() => choose('google')}>
            {GOOGLE_ICON}<span><strong>Google Tasks</strong><small>{targets && 'error' in targets.google ? WHY[targets.google.error] : 'A to-do on one of your lists'}</small></span>
          </button>
          <button type="button" aria-pressed={source === 'jira'} onClick={() => choose('jira')} className="at-jira">
            {JIRA_ICON}<span><strong>Jira</strong><small>{targets && 'error' in targets.jira ? WHY[targets.jira.error] : 'An issue assigned to you'}</small></span>
          </button>
        </div>
      </fieldset>

      {loadError && <p className="at-note at-warn" role="alert">{loadError}</p>}
      {!targets && !loadError && <p className="pi-muted" role="status">Loading your lists…</p>}
      {targets && sideWhy && <p className="at-note" role="note">{
        sideWhy === 'not_connected' ? (source === 'google' ? 'Google Tasks isn’t connected. Link it under Connections.' : 'Jira isn’t connected. Link it under Connections.')
          : sideWhy === 'read_only' ? 'Your Jira is linked by Atlassian sign-in, which can only read. Creating issues needs a Jira API-token link.'
            : sideWhy === 'no_projects' ? 'There are no Jira projects you can create issues in.'
              : source === 'google' ? 'Google Tasks can’t be reached right now.' : 'Jira can’t be reached right now.'}</p>}

      {targets && sideReady && <>
        <fieldset disabled={busy}>
          <label className="pi-legend" htmlFor="at-title">{source === 'jira' ? 'Summary' : 'What needs doing?'}</label>
          <input id="at-title" value={title} maxLength={source === 'jira' ? 255 : 300} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder={source === 'jira' ? 'e.g. Fix the login redirect on Safari' : 'e.g. Replace the furnace filter'} />
        </fieldset>

        {source === 'google' && google && <fieldset disabled={busy}>
          <legend>List</legend>
          <div className="pi-choices at-pills">{google.lists.map(l => <button key={l.id} type="button" aria-pressed={list === l.id} onClick={() => setList(l.id)}>{l.title}</button>)}</div>
        </fieldset>}

        {source === 'jira' && jira && <fieldset disabled={busy}>
          <label className="pi-legend" htmlFor="at-project">Project <small>· {jira.site}</small></label>
          {jira.projects.length <= 6
            ? <div className="pi-choices at-pills">{jira.projects.map(p => <button key={p.key} type="button" aria-pressed={project === p.key} onClick={() => setProject(p.key)}>{p.name} <small>{p.key}</small></button>)}</div>
            : <select id="at-project" className="at-select" value={project} onChange={e => setProject(e.target.value)}>
              {jira.projects.map(p => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>}
          <label className="at-check"><input type="checkbox" checked={inSprint} onChange={e => setInSprint(e.target.checked)} />
            <span>Add to the current sprint<small>The Tasks card shows your Jira issues in open sprints.</small></span></label>
        </fieldset>}

        <fieldset disabled={busy}>
          <legend>Due <small>(optional)</small></legend>
          <div className="pi-choices pi-when at-when">
            {dueChoices.map(c => <button key={c.label} type="button" aria-pressed={!custom && due === c.value} onClick={() => { setCustom(false); setDue(c.value); }}>{c.label}</button>)}
            <label className={`pi-date${custom ? ' pi-on' : ''}`}><span className="sr-only">Pick a date</span>
              <input type="date" min={localDay()} value={custom ? due : ''} onChange={e => { if (e.target.value) { setCustom(true); setDue(e.target.value); } }} /></label>
          </div>
        </fieldset>

        <fieldset disabled={busy}>
          <label className="pi-legend" htmlFor="at-notes">{source === 'jira' ? 'Description' : 'Notes'} <small>(optional)</small></label>
          <textarea id="at-notes" value={notes} maxLength={source === 'jira' ? 4000 : 2000} rows={3} onChange={e => setNotes(e.target.value)}
            placeholder={source === 'jira' ? 'What done looks like, links, steps to reproduce…' : 'e.g. 16x25x1, in the garage'} />
        </fieldset>
      </>}
    </form>
  </Drawer>;
}
