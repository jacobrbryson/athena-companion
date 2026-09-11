import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Drawer, Label, ago } from './Drawer';
import { Markdown } from './Markdown';
import { deletePhoto, loadPhotoUrl } from './photoStore';
import { memoryApi, type Fact, type MemoryEvent, type RecallResult } from '../api/companion';
import { localTimezone } from '../config';

/**
 * "What does Athena remember?" — search, browse, curate, and read her memory.
 * Everything shown here can be deleted; nothing about memory is a black box.
 */

type Tab = 'recall' | 'moments' | 'facts' | 'journal';

const KIND_ICON: Record<string, string> = {
  conversation: '💬',
  photo: '📷',
  news: '📰',
  observation: '👁',
  drive: '🚗',
  event: '📌',
  reflection: '🌙',
  fact: '◆',
  transcript: '“',
};

function Thumb({ mediaRef }: { mediaRef?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    if (mediaRef) void loadPhotoUrl(mediaRef).then((u) => setUrl((revoked = u)));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [mediaRef]);
  if (!url) return null;
  return <img src={url} alt="" className="mt-2 max-h-40 rounded border border-emerald-500/20 object-cover" />;
}

function Row({
  icon,
  title,
  text,
  meta,
  mediaRef,
  onDelete,
}: {
  icon: string;
  title?: string | null;
  text: string;
  meta: string;
  mediaRef?: string | null;
  onDelete?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="group rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-2">
      <div className="flex items-start gap-2">
        <span aria-hidden className="w-5 shrink-0 text-center">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="truncate text-sm font-semibold">{title}</p>}
          <p className="whitespace-pre-line text-sm leading-relaxed opacity-80">{text}</p>
          <Thumb mediaRef={mediaRef} />
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] opacity-40">{meta}</p>
        </div>
        {onDelete &&
          (confirm ? (
            <span className="flex shrink-0 gap-1 font-mono text-[10px] uppercase">
              <button onClick={onDelete} className="rounded border border-red-400/50 px-2 py-1 text-red-300 hover:bg-red-500/10">
                forget
              </button>
              <button onClick={() => setConfirm(false)} className="rounded border border-emerald-500/30 px-2 py-1 hover:bg-emerald-500/10">
                keep
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              aria-label="Forget this memory"
              className="shrink-0 rounded px-2 py-1 text-xs opacity-0 transition hover:bg-emerald-500/10 group-hover:opacity-60 focus:opacity-60"
            >
              ✕
            </button>
          ))}
      </div>
    </li>
  );
}

export function MemoryPanel({ onClose, initialQuery }: { onClose: () => void; initialQuery?: string }) {
  const [tab, setTab] = useState<Tab>('recall');
  const [query, setQuery] = useState(initialQuery || '');
  const [recall, setRecall] = useState<RecallResult | null>(null);
  const [events, setEvents] = useState<MemoryEvent[] | null>(null);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [journal, setJournal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState({ title: '', content: '' });

  const run = useCallback(async <T,>(fn: () => Promise<T>, set: (v: T) => void) => {
    setBusy(true);
    setError(null);
    try {
      set(await fn());
    } catch (err) {
      setError((err as Error).message || 'Memory is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }, []);

  const search = useCallback(
    (q: string) => {
      if (!q.trim()) return;
      void run(() => memoryApi.recall(q.trim(), localTimezone()), setRecall);
    },
    [run]
  );

  useEffect(() => {
    if (initialQuery) search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'moments' && !events) void run(() => memoryApi.events(), setEvents);
    if (tab === 'facts' && !facts) void run(() => memoryApi.facts(), setFacts);
    if (tab === 'journal' && journal == null) void run(() => memoryApi.journal(), setJournal);
  }, [tab, events, facts, journal, run]);

  async function forgetEvent(e: { uuid: string; media_ref?: string | null; mediaRef?: string | null }) {
    await memoryApi.deleteEvent(e.uuid).catch(() => undefined);
    const ref = e.media_ref || e.mediaRef;
    if (ref) void deletePhoto(ref);
    setEvents((list) => list?.filter((x) => x.uuid !== e.uuid) ?? null);
    setRecall((r) => (r ? { ...r, items: r.items.filter((x) => x.uuid !== e.uuid) } : r));
    setJournal(null);
  }

  async function forgetFact(uuid: string) {
    await memoryApi.deleteFact(uuid).catch(() => undefined);
    setFacts((list) => list?.filter((x) => x.uuid !== uuid) ?? null);
    setRecall((r) => (r ? { ...r, items: r.items.filter((x) => x.uuid !== uuid) } : r));
    setJournal(null);
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.content.trim()) return;
    await run(() => memoryApi.remember(note.title.trim() || note.content.trim().slice(0, 60), note.content.trim()), ({ event }) => {
      setEvents((list) => (list ? [event, ...list] : list));
      setJournal(null);
    });
    setNote({ title: '', content: '' });
    setAdding(false);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'recall', label: 'Recall' },
    { key: 'moments', label: 'Moments' },
    { key: 'facts', label: 'Facts' },
    { key: 'journal', label: 'Journal' },
  ];

  return (
    <Drawer
      eyebrow="long-term memory"
      title="What Athena remembers"
      onClose={onClose}
      footer={
        adding ? (
          <form onSubmit={addNote} className="space-y-2">
            <input
              value={note.title}
              onChange={(e) => setNote((n) => ({ ...n, title: e.target.value }))}
              placeholder="Title (optional)"
              className="h-10 w-full rounded bg-white/5 px-3 text-sm outline-none placeholder:opacity-40 focus:bg-white/10"
            />
            <textarea
              value={note.content}
              onChange={(e) => setNote((n) => ({ ...n, content: e.target.value }))}
              placeholder="What should Athena remember?"
              rows={3}
              autoFocus
              className="w-full resize-none rounded bg-white/5 px-3 py-2 text-sm outline-none placeholder:opacity-40 focus:bg-white/10"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={!note.content.trim() || busy} className="h-10 flex-1 rounded bg-emerald-500/80 text-sm font-semibold text-black disabled:opacity-30">
                Remember
              </button>
              <button type="button" onClick={() => setAdding(false)} className="h-10 rounded border border-emerald-500/30 px-4 text-sm hover:bg-emerald-500/10">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setAdding(true)} className="h-10 w-full rounded border border-emerald-500/30 font-mono text-[11px] uppercase tracking-[0.3em] hover:bg-emerald-500/10">
            + Remember something
          </button>
        )
      }
    >
      <div className="mb-4 flex gap-1 font-mono text-[10px] uppercase tracking-[0.25em]" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded border px-2 py-2 transition ${
              tab === t.key ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100' : 'border-emerald-500/15 opacity-60 hover:opacity-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>{error}</p>}

      {tab === 'recall' && (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search(query);
            }}
            className="mb-4 flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you remember about…"
              className="h-11 flex-1 rounded-full bg-white/5 px-4 text-sm outline-none placeholder:opacity-40 focus:bg-white/10"
            />
            <button type="submit" disabled={!query.trim() || busy} className="h-11 rounded-full bg-emerald-500/80 px-4 text-sm font-semibold text-black disabled:opacity-30">
              Ask
            </button>
          </form>
          {busy && <p className="py-4 text-center font-mono text-xs opacity-50">searching<span className="animate-caret">_</span></p>}
          {recall && !busy && (
            <>
              <Label>
                {recall.items.length ? `${recall.items.length} memories` : 'nothing matches'}
                {recall.timeRange ? ` · ${recall.timeRange.label}` : ''}
                {recall.semantic ? '' : ' · keyword only'}
              </Label>
              {recall.disabled && <p className="text-sm opacity-60">Memory is turned off for this account.</p>}
              <ul className="space-y-2">
                {recall.items.map((i) => (
                  <Row
                    key={`${i.type}-${i.uuid}`}
                    icon={KIND_ICON[i.type === 'event' ? i.label : i.type] || '•'}
                    title={i.type === 'fact' ? `${i.title}` : i.title}
                    text={i.text}
                    meta={[i.type === 'event' ? i.label : i.type === 'fact' ? i.label : 'chat', ago(i.when)].filter(Boolean).join(' · ')}
                    mediaRef={i.mediaRef}
                    onDelete={
                      i.type === 'fact'
                        ? () => void forgetFact(i.uuid)
                        : i.type === 'event' && i.label !== 'news'
                          ? () => void forgetEvent(i)
                          : undefined
                    }
                  />
                ))}
              </ul>
            </>
          )}
          {!recall && !busy && (
            <p className="py-6 text-center text-sm opacity-50">Ask about a person, a place, a day — “last week”, “in June”, “the beach”.</p>
          )}
        </div>
      )}

      {tab === 'moments' && (
        <ul className="space-y-2">
          {events?.length === 0 && <p className="py-6 text-center text-sm opacity-50">No moments yet. Talk to Athena — she’ll remember what matters.</p>}
          {events?.map((e) => (
            <Row
              key={e.uuid}
              icon={KIND_ICON[e.kind] || '•'}
              title={e.title}
              text={e.content}
              meta={`${e.kind} · ${ago(e.occurred_at)}`}
              mediaRef={e.media_ref}
              onDelete={() => void forgetEvent(e)}
            />
          ))}
        </ul>
      )}

      {tab === 'facts' && (
        <ul className="space-y-2">
          {facts?.length === 0 && <p className="py-6 text-center text-sm opacity-50">No facts yet.</p>}
          {facts?.map((f) => (
            <Row
              key={f.uuid}
              icon="◆"
              title={f.key}
              text={f.value || ''}
              meta={`${f.category}${f.source === 'ai' ? ' · picked up in conversation' : ''} · ${ago(f.updated_at)}`}
              onDelete={() => void forgetFact(f.uuid)}
            />
          ))}
        </ul>
      )}

      {tab === 'journal' && (journal != null ? <Markdown source={journal} /> : busy ? <p className="py-6 text-center font-mono text-xs opacity-50">reading<span className="animate-caret">_</span></p> : null)}
    </Drawer>
  );
}
