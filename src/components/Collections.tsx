import { useCallback, useEffect, useState } from 'react';
import { CardHeader } from './YourDay';
import { collectionsApi, endsLabel, sourceLabel, SUGGESTED, type Collection, type CollectionItem, type PersonCollection } from '../api/collections';
import './collections.css';

/**
 * Collections in the app (owner, 2026-11-28): lists and trackers Athena keeps
 * for someone, defined as data, so a new kind of list needs no code. Home gets
 * a card per active collection (placed by its definition: "top" or "after");
 * a person's page gets their part of every list they're on. Taps here are the
 * person's own; anything said in chat goes through Athena's actions.
 */

/** Active collections, reloadable. Never throws: an error is shown, not raised. */
export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const out = await collectionsApi.all();
      setCollections(out.collections || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Your lists couldn’t load.');
    }
  }, []);
  useEffect(() => {
    void load();
    // Back from a chat that started or changed a list: show it without a reload.
    const again = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [load]);
  return { collections, error, reload: load };
}

const GIFT = <><path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" /><path d="M3 7h18v4H3zM12 7v14" /><path d="M12 7c-2-3-5.5-3-5.5-.8C6.5 7 9 7 12 7Zm0 0c2-3 5.5-3 5.5-.8C17.5 7 15 7 12 7Z" /></>;
const LIST = <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>;

function subtitleOf(c: Collection) {
  const until = endsLabel(c.endsOn);
  const parts = c.perPerson
    ? [`${c.counts.peopleDone} of ${c.counts.people} done`]
    : [`${c.counts.items} item${c.counts.items === 1 ? '' : 's'}`];
  if (c.counts.suggested) parts.push(`${c.counts.suggested} suggested`);
  if (until) parts.push(`until ${until}`);
  return parts.join(' · ');
}

/** One collection as a Home card. */
export function CollectionCard({ collection: c, onOpenPerson, onAsk, onChanged }: {
  collection: Collection;
  onOpenPerson: (personKey: string) => void;
  onAsk: (text: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(uuid: string, done: boolean) {
    setBusy(uuid);
    try { await collectionsApi.setDone(uuid, done); onChanged(); } finally { setBusy(null); }
  }
  const kept = (items: CollectionItem[]) => items.filter(i => i.status !== SUGGESTED);
  return <section className="dh-section dt-card col-card" id={`collection-${c.uuid}`}>
    <CardHeader icon="Family" glyph={c.perPerson ? GIFT : LIST} tone="rose" title={c.name} subtitle={subtitleOf(c)}
      action={c.perPerson ? 'Add someone' : 'Add to it'} actionArrow="＋"
      onAction={() => onAsk(c.perPerson ? `Add someone to my ${c.name}.` : `Add something to my ${c.name}: `)} />
    <div className="dh-section-body dt-body">
      {c.perPerson ? (c.people.length ? <ul className="col-people">{c.people.map(p => {
        const ideas = kept(p.items);
        const suggested = p.items.length - ideas.length;
        const bought = ideas.filter(i => i.status !== c.statuses[0]).length;
        return <li key={p.uuid} className={p.done ? 'col-done' : undefined}>
          <label className="col-check" title={p.done ? 'Done — tap to reopen' : 'Tick off when everything is sorted'}>
            <input type="checkbox" checked={p.done} disabled={busy === p.uuid} onChange={e => void toggle(p.uuid, e.target.checked)} />
            <span className="sr-only">{p.label} done</span>
          </label>
          <button type="button" className="col-person" onClick={() => onOpenPerson(p.personKey)}>
            <strong>{p.label}</strong>
            <small>{[
              ideas.length ? `${ideas.length} idea${ideas.length === 1 ? '' : 's'}` : 'No ideas yet',
              bought ? `${bought} ${c.statuses[1] || 'done'}` : null,
              suggested ? `${suggested} suggested` : null,
            ].filter(Boolean).join(' · ')}</small>
          </button>
          <span aria-hidden="true" className="col-chevron">›</span>
        </li>;
      })}</ul> : <p className="dashboard-empty">Nobody on it yet. <button type="button" className="dt-link" onClick={() => onAsk(`Add someone to my ${c.name}.`)}>Add someone</button></p>)
        : (c.items.length ? <ul className="col-items">{c.items.slice(0, 6).map(i => <li key={i.uuid}><strong>{i.title}</strong><small>{i.status === SUGGESTED ? sourceLabel(i) || 'Suggested' : i.status}</small></li>)}</ul>
          : <p className="dashboard-empty">Nothing on it yet.</p>)}
    </div>
  </section>;
}

/** A person's part of every active list they're on, for their page. Nothing when they're on none. */
export function PersonCollections({ personKey, name, onAsk }: { personKey: string; name: string; onAsk: (text: string) => void }) {
  const [lists, setLists] = useState<PersonCollection[] | null>(null);
  const [removed, setRemoved] = useState<CollectionItem | null>(null);
  const load = useCallback(async () => {
    try { setLists((await collectionsApi.forPerson(personKey)).collections || []); } catch { setLists([]); }
  }, [personKey]);
  useEffect(() => { void load(); }, [load]);
  if (!lists?.length) return null;

  const run = async (fn: () => Promise<unknown>) => { try { await fn(); } finally { await load(); } };
  const first = name.split(/\s+/)[0];
  return <>{lists.map(list => {
    const suggested = list.items.filter(i => i.status === SUGGESTED);
    const kept = list.items.filter(i => i.status !== SUGGESTED);
    return <section key={list.uuid} className="hp-panel pp-panel col-panel">
      <header>
        <span className="pp-panel-title"><h2>{list.name}</h2><small>{kept.length} idea{kept.length === 1 ? '' : 's'}{suggested.length ? ` · ${suggested.length} suggested` : ''}</small></span>
        <label className="col-done-toggle"><input type="checkbox" checked={list.done} onChange={e => void run(() => collectionsApi.setDone(list.subjectUuid, e.target.checked))} /> {list.done ? 'Done' : 'Mark done'}</label>
      </header>
      {kept.length > 0 && <ul className="col-items">{kept.map(i => <li key={i.uuid}>
        <span className="col-item-main"><strong>{i.title}</strong>{fieldLine(i, list) && <small>{fieldLine(i, list)}</small>}</span>
        <select aria-label={`Status of ${i.title}`} value={i.status} onChange={e => void run(() => collectionsApi.setStatus(i.uuid, e.target.value))}>
          {list.statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="col-x" aria-label={`Remove ${i.title}`} onClick={() => void run(async () => { await collectionsApi.remove(i.uuid); setRemoved(i); })}>×</button>
      </li>)}</ul>}
      {suggested.length > 0 && <>
        <p className="col-label">Athena found</p>
        <ul className="col-items col-suggested">{suggested.map(i => <li key={i.uuid}>
          <span className="col-item-main"><strong>{i.title}</strong><small>{[sourceLabel(i), i.reason].filter(Boolean).join(' — ')}</small></span>
          <button type="button" className="dt-link" onClick={() => void run(() => collectionsApi.setStatus(i.uuid, list.statuses[0]))}>Keep</button>
          <button type="button" className="col-x" aria-label={`Dismiss ${i.title}`} onClick={() => void run(async () => { await collectionsApi.remove(i.uuid); setRemoved(i); })}>×</button>
        </li>)}</ul>
      </>}
      {!list.items.length && <p className="dashboard-empty">No ideas for {first} yet.</p>}
      {removed && <p className="source-note">Removed “{removed.title}”. <button type="button" className="dt-link" onClick={() => void run(async () => { await collectionsApi.restore(removed.uuid); setRemoved(null); })}>Undo</button></p>}
      <div className="col-actions">
        <button type="button" className="dt-link" onClick={() => onAsk(`Let me tell you more about ${name}. Ask me what ${first}'s into lately so you can find good ideas for my ${list.name}.`)}>Tell me more about {first} ↗</button>
        <button type="button" className="dt-link" onClick={() => onAsk(`Add an idea for ${first} to my ${list.name}: `)}>Add an idea ↗</button>
      </div>
    </section>;
  })}</>;
}

function fieldLine(i: CollectionItem, list: PersonCollection) {
  return list.fields
    .map(f => {
      const v = i.fields[f.name];
      if (v == null || v === '') return null;
      if (f.type === 'money') return `$${Number(v).toFixed(Number(v) % 1 ? 2 : 0)}`;
      if (f.type === 'yes_no') return v ? f.label : null;
      return f.type === 'link' ? null : String(v);
    })
    .filter(Boolean)
    .join(' · ');
}
