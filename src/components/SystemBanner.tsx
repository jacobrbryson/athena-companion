import { useCallback, useState } from 'react';
import { dashboardApi, type SystemHealth } from '../api/dashboard';
import { usePresentPoll } from '../athena/idle';

/**
 * A red bar across the top of every screen while part of Athena is actually
 * broken — a provider rejecting its key, a job running without an identity,
 * saved sign-ins she can't open — so the owner hears it from her instead of
 * finding out weeks later in a nightly report (owner, 2026-11-05).
 *
 * Only for the owner (the server says so with `owner`), and only for checks
 * that are `down`; "needs a look" stays on the System page and in the
 * notifications. "Hide" shrinks it to a slim bar rather than removing it, and
 * a different set of problems opens it fully again. It goes away by itself
 * once the checks pass. A failed read keeps the last answer standing.
 */

const POLL_MS = 5 * 60_000;
const HIDDEN_KEY = 'athena.systemBanner.hidden';

function readHidden(): string | null {
  try { return sessionStorage.getItem(HIDDEN_KEY); } catch { return null; }
}
function writeHidden(key: string) {
  try { sessionStorage.setItem(HIDDEN_KEY, key); } catch { /* the state below still hides it */ }
}

export function SystemBanner({ onOpen }: { onOpen: () => void }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [hidden, setHidden] = useState<string | null>(readHidden);
  const refresh = useCallback(() => {
    dashboardApi.systemHealth().then(setHealth).catch(() => undefined);
  }, []);
  usePresentPoll(refresh, POLL_MS);

  const broken = health?.owner ? health.checks.filter(c => c.status === 'down') : [];
  if (!broken.length) return null;
  const key = broken.map(c => `${c.id}:${c.detail}`).join('|');

  if (hidden === key) {
    return (
      <button onClick={() => setHidden(null)} role="alert"
        className="w-full bg-red-700 px-4 py-1 text-left text-xs font-semibold text-white hover:bg-red-600">
        {broken.length === 1 ? `${broken[0].label} is broken` : `${broken.length} things are broken`} — show
      </button>
    );
  }

  return (
    <div role="alert" className="border-b border-red-400 bg-red-700 px-4 py-3 text-white shadow-lg shadow-red-900/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Something is broken</p>
          <ul className="mt-1 space-y-1">
            {broken.map(c => (
              <li key={c.id} className="text-sm leading-snug">
                <span className="font-semibold">{c.label}:</span> {c.detail}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onOpen} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">System</button>
          <button onClick={() => { writeHidden(key); setHidden(key); }}
            className="rounded-full border border-white/50 px-3 py-1 text-xs hover:bg-white/10">Hide</button>
        </div>
      </div>
    </div>
  );
}
