import { useState } from 'react';
import type { LlmStatus } from '../api/companion';

/**
 * A bar across the top while Athena is running on a fallback model — Gemini
 * out of quota, say — so a slower or plainer reply, or a missing voice, has an
 * explanation (owner, 2026-11-14). Everyone signed in sees it, not just the
 * owner: it changes what they get.
 *
 * Built from the router's own outage summary (`outage` on /llm/status), which
 * the header's brain pill already polls. A backup being down (the desktop
 * asleep) doesn't raise it. "Hide" shrinks it for this outage; a different
 * one opens it again, and it goes away by itself when the model is back.
 */

const HIDDEN_KEY = 'athena.modelOutage.hidden';

function readHidden(): string | null {
  try { return sessionStorage.getItem(HIDDEN_KEY); } catch { return null; }
}
function writeHidden(key: string) {
  try { sessionStorage.setItem(HIDDEN_KEY, key); } catch { /* the state below still hides it */ }
}

export function ModelOutageBanner({ status, onOpen }: { status: LlmStatus | null; onOpen: () => void }) {
  const [hidden, setHidden] = useState<string | null>(readHidden);
  const o = status?.outage;
  if (!o || o.level === 'ok' || !o.message) return null;
  const key = `${o.level}:${o.down.map(d => `${d.endpointId}:${d.reason}`).join(',')}`;
  const drill = !!o.drill;
  const tone = o.level === 'down' ? 'border-red-400 bg-red-800' : drill ? 'border-violet-400 bg-violet-900' : 'border-amber-400 bg-amber-800';

  if (hidden === key) {
    return (
      <button onClick={() => setHidden(null)} role="status"
        className={`w-full px-4 py-1 text-left text-xs font-semibold text-white ${tone}`}>
        {drill ? 'Outage drill running' : o.level === 'down' ? 'Athena can’t answer right now' : 'Running on a backup model'}: show
      </button>
    );
  }

  return (
    <div role="status" className={`border-b px-4 py-3 text-white ${tone}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
            {drill ? `Drill: ${o.drill!.label}` : o.level === 'down' ? 'Athena is offline' : 'Running on a backup model'}
          </p>
          <p className="mt-1 text-sm leading-snug">{o.message}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onOpen} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-100">Details</button>
          <button onClick={() => { writeHidden(key); setHidden(key); }}
            className="rounded-full border border-white/50 px-3 py-1 text-xs hover:bg-white/10">Hide</button>
        </div>
      </div>
    </div>
  );
}
