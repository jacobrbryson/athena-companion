import { useCallback, useEffect, useState } from 'react';
import { attentionApi, type ActivityReview, type ActivityReviewStatus } from '../api/attention';
import { ago } from './Drawer';

const REASONS: Record<string, string> = {
  health_consent_required: 'Health-data consent is required.',
  whoop_connection_changed: 'Connect one WHOOP account, then enable reviews again.',
  calendar_connection_required: 'Connect Google Calendar to review activities in context.',
  processing_failed: 'A source or model could not be reached. The activity remains queued for retry.',
  source_identity_mismatch: 'The connected WHOOP account changed. Reconnect it before continuing.',
  incomplete_workout: 'WHOOP has not supplied a complete activity yet. Athena will retry.',
  ACCESS_REQUIRED: 'Athena access needs to be restored before processing can continue.',
};

export function WhoopActivityReviews({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ActivityReviewStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const refresh = useCallback(async () => {
    try { setData(await attentionApi.status()); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [open, refresh, connected]);
  async function change(fn: () => Promise<unknown>, message?: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); await refresh(); if (message) setNotice(message); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }
  const pending = (data?.queue.pending || 0) + (data?.queue.retry || 0) + (data?.queue.processing || 0);
  return <section className="mt-3 border-t border-emerald-500/10 pt-3">
    <button type="button" className="text-xs text-emerald-200" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      {open ? '▾' : '▸'} Activity reviews
    </button>
    {open && <div className="mt-3 space-y-3 text-xs">
      <p className="leading-relaxed opacity-70">Let Athena compare WHOOP activities with your calendar, memories, and corrections. Her interpretation stays separate from WHOOP’s label. This does not turn on notifications.</p>
      {error && <p role="alert" className="text-amber-200">{error}</p>}
      {notice && <p role="status" className="text-emerald-200">{notice}</p>}
      {!data && !error && <p>Loading reviews…</p>}
      {data && <>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={data.enabled} disabled={busy || (!connected && !data.enabled)}
            onChange={e => void change(() => attentionApi.enable(e.target.checked))} />
          Review my WHOOP activities in context
        </label>
        {(data.blocked_by || data.last_error) && <p className="text-amber-200">{REASONS[data.blocked_by || data.last_error || ''] || 'Reviews are waiting for a source or processing service. Your queued work is retained.'}</p>}
        <p className="opacity-60">{data.last_sync_at ? `Last checked ${ago(data.last_sync_at)}.` : 'No completed check yet.'} {pending ? `${pending} activity updates waiting.` : ''}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || !data.enabled || !!data.blocked_by} onClick={() => void change(() => attentionApi.recheck(), 'Recheck queued. Reviews refresh as Athena processes them.')} className="text-emerald-200 disabled:opacity-40">Recheck activities</button>
          <button type="button" disabled={busy} onClick={() => void refresh()} className="text-emerald-200">Refresh</button>
          <button type="button" disabled={busy} onClick={() => setForgetting(true)} className="text-red-300">Forget reviews and corrections</button>
        </div>
        {forgetting && <div className="rounded border border-red-400/30 p-3">
          <p>This deletes these saved reviews and corrections and turns activity reviews off. WHOOP and your other memories stay as they are.</p>
          <div className="mt-2 flex gap-4">
            <button type="button" disabled={busy} onClick={() => void change(async () => { await attentionApi.forget(); setForgetting(false); })}>Delete reviews</button>
            <button type="button" onClick={() => setForgetting(false)}>Keep them</button>
          </div>
        </div>}
        <p className="opacity-50">Checks cover the last seven days and activities received through WHOOP notifications. Showing the 30 most recently reviewed activities.</p>
        {data.reviews.map(review => <Review key={review.uuid} review={review} busy={busy} save={(kind, label, note) => change(() => attentionApi.feedback(review.uuid, kind, label, note), 'Saved. Athena can use your correction when reviewing later activities.')} />)}
      </>}
    </div>}
  </section>;
}

function Review({ review: r, busy, save }: { review: ActivityReview; busy: boolean; save: (kind: 'confirm' | 'correct', label: string, note?: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(r.feedback?.label || r.interpretation?.label || '');
  const [note, setNote] = useState('');
  const present = r.observation.state === 'present';
  return <article className="space-y-2 rounded border border-emerald-500/20 p-3">
    <p className="opacity-60">{r.observation.start ? new Date(r.observation.start).toLocaleString() : 'WHOOP activity'}</p>
    <p>WHOOP: <strong>{r.observation.label || r.observation.state.replace(/_/g, ' ')}</strong></p>
    {r.stale ? <p>Supporting information changed. Recheck this activity before relying on its interpretation.</p>
      : r.interpretation && <><p>{r.feedback || r.interpretation.status === 'confirmed' ? 'You confirmed' : 'Athena’s interpretation'}: <strong>{r.feedback?.label || r.interpretation.label || r.interpretation.status}</strong></p>
        <p className="opacity-70">{r.feedback?.note || r.interpretation.reason}</p>
        {!r.feedback && ['likely', 'uncertain'].includes(r.interpretation.status) && <p className="text-amber-200">Tentative — {r.interpretation.status === 'uncertain' ? 'more context is needed' : 'not yet confirmed by you'}.</p>}
        {!!r.interpretation.alternatives.length && <p className="opacity-60">Other possibilities: {r.interpretation.alternatives.join('; ')}</p>}
      </>}
    {!!r.evidence.length && <details><summary className="cursor-pointer text-emerald-200">Why Athena thinks this</summary>
      {r.evidence.map(e => <div key={e.id} className="mt-2"><p className="opacity-60">{e.kind.replace(/_/g, ' ')}</p><p className="whitespace-pre-wrap break-words">{evidenceText(e)}</p></div>)}
    </details>}
    {present && !r.stale && <div className="flex gap-4">
      {!r.feedback && r.interpretation?.label && r.interpretation.status !== 'confirmed' && <button type="button" disabled={busy} className="text-emerald-200" onClick={() => void save('confirm', r.interpretation!.label!)}>That’s right</button>}
      <button type="button" disabled={busy} className="text-emerald-200" onClick={() => setEditing(v => !v)}>Correct this</button>
    </div>}
    {editing && <form className="space-y-2" onSubmit={e => { e.preventDefault(); void save('correct', label, note).then(ok => { if (ok) setEditing(false); }); }}>
      <label className="block">What was this activity?<input className="mt-1 w-full rounded bg-white/10 p-2" value={label} onChange={e => setLabel(e.target.value)} maxLength={120} required /></label>
      <label className="block">Context for next time (optional)<textarea className="mt-1 w-full rounded bg-white/10 p-2" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></label>
      <button type="submit" disabled={busy || !label.trim()} className="rounded bg-emerald-500/80 px-3 py-2 text-black disabled:opacity-40">Save correction</button>
    </form>}
  </article>;
}

function evidenceText(e: ActivityReview['evidence'][number]): string {
  const v = e.value as Record<string, any>;
  if (e.kind === 'scheduled_event') return `${v.title} · ${v.start} – ${v.end}${v.calendar ? ` · ${v.calendar}` : ''}`;
  if (e.kind === 'memory') return `${v.key}: ${v.text}`;
  if (e.kind === 'human_correction') return `${v.original?.label || 'Activity'} → ${v.correction?.label || ''}. ${v.correction?.note || ''}`;
  return `${v.label || ''}${v.start ? ` · ${v.start}` : ''}`;
}
