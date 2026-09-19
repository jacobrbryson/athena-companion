import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { dashboardApi, type NewsSource } from '../api/dashboard';

/**
 * The reading list. Paste the address of a news page — a front page, a section,
 * a blog — and Athena works out how often to go back.
 *
 * There is deliberately no control here for the interval. The whole point of
 * the redesign was that nobody should have to maintain a schedule, so this
 * panel only ever REPORTS the rhythm and the sentence behind it. What the
 * person does own is the list itself, and whether what she reads there becomes
 * part of what she knows about the world.
 */
const ago = (at: string | null) => {
  if (!at) return 'not yet';
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
};

export function NewsSourcesPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [maxSources, setMaxSources] = useState(12);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    dashboardApi.sources()
      .then(result => { if (active) { setSources(result.sources); setMaxSources(result.maxSources || 12); setLoaded(true); } })
      .catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [attempt]);

  const reload = () => setAttempt(a => a + 1);

  /** The list as the API wants it back: every page, with the person's own settings. */
  const asPayload = (list: NewsSource[]) => list.map(s => ({ url: s.url, label: s.label === s.host ? null : s.label, scope: s.scope }));

  async function add() {
    const pasted = draft.split(/[\n\s]+/).map(v => v.trim()).filter(Boolean);
    if (!pasted.length) return;
    setBusy('add'); setError(''); setNote('');
    try {
      const saved = await dashboardApi.saveSources([...asPayload(sources), ...pasted]);
      setSources(saved.sources);
      setDraft('');
      onSaved();
      // Read them now rather than at the next round, so adding a page shows
      // something immediately instead of an empty card until the job runs.
      setBusy('check');
      const check = await dashboardApi.checkNews();
      setNote(check.cooling ? 'Added. I will read it on my next round.' : `Added. Read ${check.checked} page${check.checked === 1 ? '' : 's'} just now.`);
      reload();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function remove(source: NewsSource) {
    setBusy(source.uuid); setError(''); setNote('');
    try {
      await dashboardApi.removeSource(source.uuid);
      setSources(list => list.filter(s => s.uuid !== source.uuid));
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function toggleShared(source: NewsSource) {
    const scope = source.scope === 'world' ? 'personal' : 'world';
    setBusy(source.uuid); setError(''); setNote('');
    try {
      const { source: updated } = await dashboardApi.updateSource(source.uuid, { scope });
      setSources(list => list.map(s => (s.uuid === source.uuid ? { ...s, scope: updated.scope } : s)));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  return <Drawer eyebrow="Your reading list" title="News sources" onClose={onClose}>
    <p className="mb-2 text-sm leading-relaxed text-slate-300">
      Paste the address of any news page — a front page, a section, a column. No feed URL to hunt for.
      I read each one in the background and decide how often to go back: daily for a quiet page, every
      few hours for a busy one, every fifteen minutes while something is actually unfolding.
    </p>
    <p className="mb-5 text-xs leading-relaxed text-slate-400">
      You never have to set a schedule, and there is nothing here to maintain. Up to {maxSources} pages.
      I read pages the way any reader does — public pages over HTTPS, and I honour a site that asks not to be read.
    </p>

    {error && <p role="alert" className="mb-4 text-sm text-amber-200">{error} {!loaded && <button onClick={reload} className="underline">Retry</button>}</p>}
    {note && <p role="status" className="mb-4 text-sm text-cyan-200">{note}</p>}

    <form onSubmit={e => { e.preventDefault(); void add(); }} className="mb-6">
      <label htmlFor="news-add" className="block text-sm mb-2">Add a page</label>
      <textarea
        id="news-add" value={draft} disabled={!loaded || !!busy} onChange={e => setDraft(e.target.value)} rows={3}
        maxLength={2000} placeholder={'apnews.com\nreuters.com/world\nyourlocalpaper.com/news'}
        className="w-full rounded-lg border border-cyan-800 bg-slate-950 p-3 text-sm"
      />
      <p className="my-3 text-xs text-slate-400">One per line. I will take a first look as soon as you add them.</p>
      <button disabled={!loaded || !!busy || !draft.trim()} className="dashboard-chat-cta" type="submit">
        {busy === 'add' ? 'Adding…' : busy === 'check' ? 'Reading them now…' : 'Add to my list'}
      </button>
    </form>

    <h3 className="mb-3 text-sm font-semibold text-slate-200">
      What I am watching {loaded && <span className="text-slate-500">· {sources.length} of {maxSources}</span>}
    </h3>
    {!loaded && !error && <p className="text-sm text-slate-400">Loading your list…</p>}
    {loaded && !sources.length && <p className="text-sm text-slate-400">Nothing yet. Paste a page above and I will start reading it.</p>}

    <ul className="flex flex-col gap-3">
      {sources.map(source => <li key={source.uuid} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">{source.label}</p>
            <p className="truncate text-xs text-slate-500">{source.url}</p>
          </div>
          <button
            onClick={() => void remove(source)} disabled={!!busy}
            className="shrink-0 text-xs text-slate-400 underline hover:text-amber-200"
          >Remove</button>
        </div>
        <p className="mt-2 text-xs text-slate-300">
          Reading it <strong className="font-semibold text-cyan-200">{source.rhythm}</strong>
          {source.setBy === 'athena' && ' — my call'}
          <span className="text-slate-500"> · last read {ago(source.lastCheckedAt)} · {source.headlines} headline{source.headlines === 1 ? '' : 's'} this week</span>
        </p>
        {/* Model-authored, shown as a sentence and never acted on. */}
        {source.setBy === 'athena' && source.reason && <p className="mt-1 text-xs italic text-slate-400">“{source.reason}”</p>}
        {source.lastError && <p className="mt-1 text-xs text-amber-200">Last time: {source.lastError}</p>}
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox" checked={source.scope === 'world'} disabled={!!busy}
            onChange={() => void toggleShared(source)}
            className="accent-cyan-400"
          />
          Remember what I read here, so I can talk about it
        </label>
      </li>)}
    </ul>
  </Drawer>;
}
