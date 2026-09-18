import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { dashboardApi } from '../api/dashboard';

export function NewsSourcesPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    dashboardApi.sources().then(result => { if (active) { setDraft(result.sources.join('\n')); setLoaded(true); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  async function save() {
    setBusy(true); setError('');
    try { await dashboardApi.saveSources(draft.split('\n').map(s => s.trim()).filter(Boolean)); onSaved(); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Drawer eyebrow="Your reading list" title="News sources" onClose={onClose}>
    <p className="mb-5 text-sm leading-relaxed text-slate-300">Choose up to eight public HTTPS RSS or Atom feeds. One URL per line. These sources are saved to your account and used for this dashboard only.</p>
    {error && <p role="alert" className="mb-4 text-sm text-amber-200">{error} {!loaded && <button onClick={() => setAttempt(a => a + 1)} className="underline">Retry</button>}</p>}
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <label htmlFor="news-sources" className="block text-sm mb-2">Feed URLs</label>
      <textarea id="news-sources" value={draft} disabled={!loaded || busy} onChange={e => setDraft(e.target.value)} rows={9} maxLength={16008} placeholder="https://example.com/feed.xml" className="w-full rounded-lg border border-cyan-800 bg-slate-950 p-3 text-sm" />
      <p className="my-3 text-xs text-slate-400">Leave this empty to turn off your news feed. Use a direct feed URL; redirects, private networks, and sign-in-only feeds aren’t supported.</p>
      <button disabled={!loaded || busy} className="dashboard-chat-cta" type="submit">{busy ? 'Saving…' : 'Save sources'}</button>
    </form>
  </Drawer>;
}
