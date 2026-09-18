import { useCallback, useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import { initiativeApi, type InitiativeStatus } from '../api/companion';

/**
 * When Athena may speak first.
 *
 * The panel leads with the switch and the limits rather than the list of
 * clever things she might notice, because the question a person actually has
 * about a feature like this is "how often is it going to talk to me?" — and
 * the honest answer is a number they can change.
 *
 * Every trigger is listed even when its provider isn't connected, so the list
 * is the complete set of things she could ever raise. A panel showing only
 * what currently works invites the belief that the list is exhaustive.
 */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function InitiativePanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<InitiativeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    initiativeApi
      .status()
      .then(setStatus)
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);

  async function patch(next: Parameters<typeof initiativeApi.setPref>[0], key: string) {
    setBusy(key);
    setError(null);
    try {
      // The device's own zone rides along with every change. Quiet hours are
      // meaningless without it and the server has no other way to learn it.
      const res = await initiativeApi.setPref({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...next,
      });
      setStatus((s) => (s ? { ...s, pref: res.pref } : s));
    } catch (e) {
      const err = e as Error & { body?: { message?: string } };
      setError(err.body?.message || err.message || 'Could not save that.');
    } finally {
      setBusy(null);
    }
  }

  async function resume(triggerId: string) {
    setBusy(triggerId);
    try {
      await initiativeApi.resume(triggerId);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleMute(triggerId: string, muted: boolean) {
    setBusy(triggerId);
    try {
      const res = muted
        ? await initiativeApi.unmute(triggerId)
        : await initiativeApi.mute(triggerId);
      setStatus((s) => (s ? { ...s, muted: res.muted } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pref = status?.pref;
  const muted = new Set(status?.muted || []);

  return (
    <Drawer eyebrow="when athena speaks first" title="Initiative" onClose={onClose}>
      {error && (
        <p className="mb-3 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error}
        </p>
      )}

      <section className="mb-8">
        <Label>speaking first</Label>
        {!pref?.enabled ? (
          <div className="rounded border border-emerald-500/20 bg-white/[0.02] p-3">
            <p className="text-sm opacity-80">
              Right now Athena only ever answers. Turn this on and she can also
              start a conversation — when something is about to begin, when two
              things clash, when your day looks heavier than you slept.
            </p>
            <button
              onClick={() => void patch({ enabled: true }, 'enable')}
              disabled={busy === 'enable' || !status}
              className="mt-3 h-10 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95 disabled:opacity-40"
            >
              {busy === 'enable' ? 'Saving…' : 'Let Athena speak first'}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm opacity-70">
              She can start a conversation, within the limits below.
            </p>
            <button
              onClick={() => void patch({ enabled: false }, 'enable')}
              disabled={busy === 'enable'}
              className="mt-2 rounded border border-emerald-500/20 px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-white/5 disabled:opacity-40"
            >
              turn off
            </button>
          </>
        )}
      </section>

      {pref?.enabled && (
        <section className="mb-8">
          <Label>how often, at most</Label>
          <div className="space-y-3 rounded border border-emerald-500/10 bg-white/[0.02] p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="opacity-80">Times a day</span>
              <select
                value={pref.daily_cap}
                disabled={busy === 'cap'}
                onChange={(e) => void patch({ daily_cap: Number(e.target.value) }, 'cap')}
                className="h-9 rounded bg-white/5 px-2 text-sm outline-none"
              >
                {[0, 1, 2, 3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'never' : n}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="opacity-80">Stay quiet from</span>
              <span className="flex items-center gap-1">
                <select
                  value={pref.quiet_from}
                  disabled={busy === 'quiet'}
                  onChange={(e) => void patch({ quiet_from: Number(e.target.value) }, 'quiet')}
                  className="h-9 rounded bg-white/5 px-2 text-sm outline-none"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                <span className="opacity-50">to</span>
                <select
                  value={pref.quiet_to}
                  disabled={busy === 'quiet'}
                  onChange={(e) => void patch({ quiet_to: Number(e.target.value) }, 'quiet')}
                  className="h-9 rounded bg-white/5 px-2 text-sm outline-none"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </span>
            </div>

            <p className="font-mono text-[10px] opacity-45">
              your time{pref.timezone ? ` · ${pref.timezone}` : ''} · she also
              leaves at least 90 minutes between anything she brings up
            </p>
          </div>
        </section>
      )}

      {pref?.enabled && (
        <section className="mb-8">
          <Label>on your phone</Label>
          {!status?.push.available ? (
            // Say so rather than offering a switch that silently does nothing.
            <p className="text-sm opacity-60">
              Notifications aren’t set up on this server, so I can only reach
              you in the app.
            </p>
          ) : status.push.devices.length === 0 ? (
            <p className="text-sm opacity-60">
              No paired phone is set up for notifications yet. Pair one under{' '}
              <span className="opacity-80">Phone &amp; car</span>, then allow
              notifications in the Athena app on that device.
            </p>
          ) : (
            <div className="rounded border border-emerald-500/10 bg-white/[0.02] p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pref.push_enabled}
                  disabled={busy === 'push'}
                  onChange={() => void patch({ push_enabled: !pref.push_enabled }, 'push')}
                  className="mt-0.5 h-4 w-4 accent-emerald-500"
                />
                <span className="opacity-80">
                  Send these to my phone, so I don’t have to have you open
                </span>
              </label>
              <p className="mt-1.5 font-mono text-[10px] opacity-45">
                {status.push.devices.map((d) => d.name).join(', ')} · same
                limits apply · one notification at a time
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mb-8">
        <Label>what she watches for</Label>
        <ul className="space-y-2">
          {(status?.catalog || []).map((t) => {
            const isMuted = muted.has(t.id);
            const learned = status?.scores[t.id];
            const dimmed = isMuted || learned?.suppressed;
            return (
              <li
                key={t.id}
                className={`rounded border px-3 py-2 ${dimmed ? 'border-emerald-500/10 bg-white/[0.01] opacity-60' : 'border-emerald-500/10 bg-white/[0.02]'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{t.label}</p>
                    <p className="mt-0.5 text-xs opacity-60">{t.describe}</p>
                  </div>
                  <button
                    onClick={() => void toggleMute(t.id, isMuted)}
                    disabled={busy === t.id}
                    className="shrink-0 rounded border border-emerald-500/20 px-2 py-1 font-mono text-[10px] uppercase hover:bg-white/5 disabled:opacity-40"
                  >
                    {isMuted ? 'unmute' : 'mute'}
                  </button>
                </div>

                {/* What she has learned, said plainly. A system that quietly
                    went quiet on you would be worse than one that never
                    learned — so when she has backed off, it says so, says why,
                    and offers it back. */}
                {learned?.suppressed ? (
                  <div className="mt-2 rounded border border-amber-400/25 bg-amber-500/[0.06] px-2 py-1.5">
                    <p className="text-xs opacity-80">
                      I’ve stopped bringing this up
                      {learned.last_reason ? ` — ${learned.last_reason}` : '.'}
                    </p>
                    <button
                      onClick={() => void resume(t.id)}
                      disabled={busy === t.id}
                      className="mt-1 rounded border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] uppercase hover:bg-white/5 disabled:opacity-40"
                    >
                      start again
                    </button>
                  </div>
                ) : (
                  learned &&
                  learned.samples > 0 && (
                    <p className="mt-1 font-mono text-[10px] opacity-45">
                      {learned.score >= 0.65
                        ? 'you usually find this useful'
                        : learned.score <= 0.35
                          ? 'this one seems to land badly'
                          : 'no strong feeling yet'}{' '}
                      · {learned.samples} time{learned.samples === 1 ? '' : 's'}
                    </p>
                  )
                )}

                <p className="mt-1 font-mono text-[10px] opacity-40">
                  needs {t.sources.join(' + ')}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <Label>she has brought up</Label>
        {status?.recent.length === 0 && (
          <p className="text-sm opacity-60">Nothing yet.</p>
        )}
        <ul className="space-y-1.5">
          {status?.recent.map((n) => (
            <li key={n.uuid} className="text-xs">
              <span className="opacity-80">{n.text}</span>
              <span className="block font-mono text-[10px] opacity-45">
                {n.label} · {n.status} · {ago(n.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}
