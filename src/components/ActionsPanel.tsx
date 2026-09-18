import { useCallback, useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import {
  actionsApi,
  consentApi,
  type ActionStatus,
  type AthenaAction,
} from '../api/companion';

/**
 * What Athena is allowed to do, and what she has done.
 *
 * This panel is the honest answer to "what can she change?" — so it lists
 * every action in the registry, including the ones this account has NOT
 * enabled, and says why each one is unavailable. A panel that showed only the
 * working actions would let the person believe the list is the whole story.
 *
 * The consent toggle at the top is the master switch. Turning it off is not
 * implemented here on purpose: consent withdrawal runs through the consent
 * panel's own audited path, and a second, quieter way to revoke it would be a
 * second thing to keep correct.
 */
export function ActionsPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<ActionStatus | null>(null);
  const [history, setHistory] = useState<AthenaAction[] | null>(null);
  const [consented, setConsented] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    actionsApi.status().then(setStatus).catch((e) => setError((e as Error).message));
    actionsApi.history(20).then(setHistory).catch(() => setHistory([]));
    consentApi
      .status()
      .then((s) => setConsented(s.consents?.action_authority?.accepted === true))
      .catch(() => setConsented(null));
  }, []);
  useEffect(refresh, [refresh]);

  async function enableActions() {
    setBusy('consent');
    setError(null);
    try {
      await consentApi.accept('action_authority');
      refresh();
    } catch (e) {
      setError((e as Error).message || 'Could not turn that on.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleAuthority(actionId: string, granted: boolean) {
    setBusy(actionId);
    setError(null);
    try {
      const res = granted
        ? await actionsApi.revokeAuthority(actionId)
        : await actionsApi.grantAuthority(actionId);
      setStatus((s) => (s ? { ...s, authorities: res.authorities } : s));
    } catch (e) {
      const err = e as Error & { body?: { message?: string } };
      setError(err.body?.message || err.message || 'Could not save that.');
    } finally {
      setBusy(null);
    }
  }

  const standing = new Set((status?.authorities || []).map((a) => a.action_id));
  const available = new Set(status?.available || []);

  return (
    <Drawer eyebrow="what athena can do" title="Actions" onClose={onClose}>
      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error}
        </p>
      )}

      <section className="mb-8">
        <Label>doing things on your behalf</Label>
        {consented ? (
          <p className="text-sm opacity-70">
            Athena can ask to change things. She always asks first, unless you
            tick one of the boxes below.
          </p>
        ) : (
          <div className="rounded border border-emerald-500/20 bg-white/[0.02] p-3">
            <p className="text-sm opacity-80">
              Right now Athena can only read and answer. Turn this on and she
              can also <em>propose</em> changes — each one shows up as a card you
              approve or decline.
            </p>
            <button
              onClick={() => void enableActions()}
              disabled={busy === 'consent' || consented === null}
              className="mt-3 h-10 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95 disabled:opacity-40"
            >
              {busy === 'consent' ? 'Saving…' : 'Let Athena propose changes'}
            </button>
          </div>
        )}
      </section>

      <section className="mb-8">
        <Label>she can do</Label>
        <ul className="space-y-2">
          {(status?.catalog || []).map((entry) => {
            const usable = available.has(entry.id);
            const isStanding = standing.has(entry.id);
            return (
              <li
                key={entry.id}
                className="rounded border border-emerald-500/10 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{entry.label}</span>
                  <span className="font-mono text-[10px] uppercase opacity-40">
                    {usable ? 'ready' : 'off'}
                  </span>
                </div>
                {/* Why it is unavailable, named specifically. "Off" with no
                    reason sends the person hunting through every menu. */}
                {!usable && (
                  <p className="mt-1 font-mono text-[10px] opacity-50">
                    {entry.consent_type === 'action_authority' && !consented
                      ? 'needs the switch above'
                      : entry.provider === 'google_calendar'
                        ? 'connect Google Calendar in Connected apps'
                        : entry.provider
                          ? `needs ${entry.provider} connected`
                          : 'unavailable'}
                  </p>
                )}
                {usable && entry.standing && (
                  <label className="mt-2 flex items-center gap-2 text-xs opacity-75">
                    <input
                      type="checkbox"
                      checked={isStanding}
                      disabled={busy === entry.id}
                      onChange={() => void toggleAuthority(entry.id, isStanding)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    Do this without asking me each time
                  </label>
                )}
                {!entry.reversible && (
                  <p className="mt-1 font-mono text-[10px] opacity-50">cannot be undone</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <Label>recently</Label>
        {history?.length === 0 && (
          <p className="text-sm opacity-60">Athena hasn’t done anything yet.</p>
        )}
        <ul className="space-y-1.5">
          {history?.map((a) => (
            <li key={a.uuid} className="flex items-start justify-between gap-2 text-xs">
              <span className="min-w-0">
                <span className="opacity-80">{a.summary}</span>
                <span className="block font-mono text-[10px] opacity-45">
                  {a.status}
                  {a.approval === 'standing' ? ' · standing approval' : ''} ·{' '}
                  {ago(a.executed_at || a.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}
