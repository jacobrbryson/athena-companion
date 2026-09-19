import { useCallback, useEffect, useState } from 'react';
import { Drawer, Label, ago } from './Drawer';
import {
  initiativeApi,
  type InitiativeDiagnostics,
  type InitiativeStatus,
  type TestNotificationResult,
} from '../api/companion';
import { useWebPush } from '../athena/useWebPush';

/**
 * When Athena may speak first.
 *
 * The panel leads with the switch and the quiet window rather than the list
 * of clever things she might notice, because the question a person actually
 * has about a feature like this is "when is it going to talk to me?".
 *
 * There is no longer a "times a day" here. That cap, and the spacing rule
 * beside it, worked by discarding a true observation and recording nothing
 * about having done so — so a quiet day and a day she had been gagged looked
 * identical from this panel. Quiet hours survived because they only ever
 * delay: the nudge is written, held, and pushed when the window ends.
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
  const [testResult, setTestResult] = useState<TestNotificationResult | null>(null);
  const [why, setWhy] = useState<InitiativeDiagnostics | null>(null);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsPending, setSmsPending] = useState(false);
  const webPush = useWebPush();

  async function sendTest() {
    setBusy('test');
    setError(null);
    setTestResult(null);
    try {
      setTestResult(await initiativeApi.testNotification());
    } catch (e) {
      setError((e as Error).message || 'The test could not be sent.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * `evaluate` calls out to every linked provider, so it is a button rather
   * than something the panel does on open — but it is the only version of
   * this answer that is worth anything, because "nothing to say" and "the
   * calendar is down" look identical from outside.
   */
  async function diagnose() {
    setBusy('why');
    setError(null);
    try {
      setWhy(await initiativeApi.diagnostics(true));
    } catch (e) {
      setError((e as Error).message || 'Could not work that out.');
    } finally {
      setBusy(null);
    }
  }

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

  async function startSms() {
    setBusy('sms');
    setError(null);
    try {
      await initiativeApi.startSms(smsPhone);
      setSmsPending(true);
    } catch (e) {
      const err = e as Error & { body?: { message?: string } };
      const providerCode = (err.body as { code?: string } | undefined)?.code;
      setError(
        providerCode
          ? `${err.body?.message || err.message || 'Could not send the verification text.'} (${providerCode})`
          : err.body?.message || err.message || 'Could not send the verification text.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function confirmSms() {
    setBusy('sms');
    setError(null);
    try {
      await initiativeApi.confirmSms(smsPhone, smsCode);
      setSmsCode('');
      setSmsPending(false);
      refresh();
    } catch (e) {
      const err = e as Error & { body?: { message?: string } };
      setError(err.body?.message || err.message || 'Could not confirm that number.');
    } finally {
      setBusy(null);
    }
  }

  async function forgetSms() {
    setBusy('sms');
    setError(null);
    try {
      await initiativeApi.forgetSms();
      setSmsPhone('');
      setSmsPending(false);
      refresh();
    } catch (e) {
      setError((e as Error).message || 'Could not turn off text messages.');
    } finally {
      setBusy(null);
    }
  }

  const pref = status?.pref;
  const muted = new Set(status?.muted || []);
  const smsDevice = status?.push.devices.find((device) => device.platform === 'sms');

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
              She starts a conversation whenever she notices something worth
              saying. There's no daily limit — nothing gets dropped.
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
          <Label>when she holds off</Label>
          <div className="space-y-3 rounded border border-emerald-500/10 bg-white/[0.02] p-3">
            {/*
              There is no "times a day" any more. The cap worked by throwing
              away a true observation and recording nothing about having done
              so, which made it impossible to tell a quiet day from a day she
              had been gagged. Quiet hours stayed because they only ever
              delay — see the note under the picker.
            */}

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
              your time{pref.timezone ? ` · ${pref.timezone}` : ''} · nothing is
              lost overnight — it waits and arrives when the window ends
            </p>
            <p className="font-mono text-[10px] opacity-45">
              set both to the same hour to turn quiet hours off · there is no
              daily limit, so she tells you everything she notices
            </p>
          </div>
        </section>
      )}

      {pref?.enabled && (
        <section className="mb-8">
          <Label>where she can reach you</Label>
          {!status?.push.available ? (
            // Say so rather than offering a switch that silently does nothing.
            <p className="text-sm opacity-60">
              Notifications aren’t set up on this server, so I can only reach
              you in the app.
            </p>
          ) : (
            <div className="space-y-2">
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
                    Reach me outside the app, so I don’t have to have you open
                  </span>
                </label>
                <p className="mt-1.5 font-mono text-[10px] opacity-45">
                  {status.push.devices.length
                    ? `${status.push.devices.map((d) => d.name).join(', ')} · `
                    : 'nowhere registered yet · '}
                  same limits apply · each notification is kept
                </p>
              </div>

              {/*
                Its own row rather than folded into the switch above: the
                browser permission is granted per browser and can be refused
                here while the phone works perfectly, and one control for two
                independent grants would render that as a mystery.
              */}
              {pref.push_enabled && (
                <div className="rounded border border-emerald-500/10 bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm opacity-80">This browser</p>
                      <p className="mt-1 font-mono text-[10px] opacity-45">
                        {webPush.state === 'unsupported'
                          ? 'this browser has no notification support'
                          : webPush.state === 'unconfigured'
                            ? 'no notification key on this server'
                            : webPush.state === 'denied'
                              ? 'blocked — allow notifications for this site in your browser’s address bar'
                              : webPush.state === 'on'
                                ? 'on · works when this tab is closed, while the browser runs'
                                : 'off'}
                      </p>
                    </div>
                    {(webPush.state === 'on' || webPush.state === 'off') && (
                      <button
                        type="button"
                        disabled={busy === 'webpush'}
                        onClick={() => {
                          setBusy('webpush');
                          const done = () => setBusy(null);
                          void (webPush.state === 'on' ? webPush.disable() : webPush.enable()).finally(done);
                        }}
                        className="shrink-0 rounded border border-emerald-500/30 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
                      >
                        {webPush.state === 'on' ? 'Turn off' : 'Turn on'}
                      </button>
                    )}
                  </div>
                  {webPush.error && (
                    <p className="mt-1.5 text-xs text-amber-300/80">{webPush.error}</p>
                  )}
                </div>
              )}

              {pref.push_enabled && !status.push.transports.sms && (
                <div className="rounded border border-emerald-500/10 bg-white/[0.02] p-3">
                  <p className="text-sm opacity-80">Text messages</p>
                  <p className="mt-1 text-xs opacity-60">
                    Text messages aren’t configured on this server yet.
                  </p>
                </div>
              )}

              {pref.push_enabled && status.push.transports.sms && (
                <div className="rounded border border-emerald-500/10 bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm opacity-80">Text messages</p>
                      <p className="mt-1 font-mono text-[10px] opacity-45">
                        {smsDevice
                          ? `${smsDevice.name} · verified`
                          : smsPending
                            ? 'verification code sent · enter it below'
                            : 'not connected yet'}
                      </p>
                    </div>
                    {smsDevice && (
                      <button
                        type="button"
                        disabled={busy === 'sms'}
                        onClick={() => void forgetSms()}
                        className="shrink-0 rounded border border-emerald-500/30 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
                      >
                        Turn off
                      </button>
                    )}
                  </div>

                  {!smsDevice && (
                    <div className="mt-3 space-y-2">
                      <label className="block text-xs opacity-70" htmlFor="initiative-sms-phone">
                        Phone number
                      </label>
                      <input
                        id="initiative-sms-phone"
                        type="tel"
                        value={smsPhone}
                        disabled={busy === 'sms'}
                        onChange={(e) => setSmsPhone(e.target.value)}
                        placeholder="(555) 555-0123"
                        className="h-9 w-full rounded border border-emerald-500/20 bg-white/5 px-2 text-sm outline-none"
                      />
                      {!smsPending ? (
                        <button
                          type="button"
                          disabled={busy === 'sms' || !smsPhone.trim()}
                          onClick={() => void startSms()}
                          className="rounded border border-emerald-500/30 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
                        >
                          {busy === 'sms' ? 'Sending…' : 'Text me a verification code'}
                        </button>
                      ) : (
                        <>
                          <label className="block text-xs opacity-70" htmlFor="initiative-sms-code">
                            Verification code
                          </label>
                          <input
                            id="initiative-sms-code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={smsCode}
                            disabled={busy === 'sms'}
                            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder=" six digits"
                            className="h-9 w-full rounded border border-emerald-500/20 bg-white/5 px-2 font-mono text-sm outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy === 'sms' || smsCode.length !== 6}
                              onClick={() => void confirmSms()}
                              className="rounded border border-emerald-500/30 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
                            >
                              {busy === 'sms' ? 'Checking…' : 'Confirm number'}
                            </button>
                            <button
                              type="button"
                              disabled={busy === 'sms'}
                              onClick={() => setSmsPending(false)}
                              className="rounded px-2 py-1 text-xs opacity-60 hover:opacity-100 disabled:opacity-40"
                            >
                              start over
                            </button>
                          </div>
                        </>
                      )}
                      <p className="font-mono text-[10px] opacity-45">
                        Athena will text only this verified number. The test below sends to every registered destination.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/*
                The button this panel was missing. Everything above can look
                correct while nothing actually arrives — a wrong Firebase
                config, a refused permission, a subscription the browser
                replaced. One press is worth any amount of status text.
              */}
              {pref.push_enabled && (
                <div className="rounded border border-emerald-500/10 bg-white/[0.02] p-3">
                  <button
                    type="button"
                    disabled={busy === 'test'}
                    onClick={() => void sendTest()}
                    className="rounded border border-emerald-500/30 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
                  >
                    {busy === 'test' ? 'Sending…' : 'Send me a test notification'}
                  </button>
                  {testResult && (
                    <div className="mt-2 space-y-1">
                      <p className="font-mono text-[10px] opacity-60">
                        {testResult.skipped
                          ? `nothing sent — ${testResult.skipped}`
                          : `${testResult.sent} of ${testResult.devices} delivered`}
                      </p>
                      {/*
                        Per device and with the transport's own reason. "0 of
                        2" is not a diagnosis, and the failure is the case
                        this button exists for.
                      */}
                      {testResult.results.map((r) => (
                        <p key={r.uuid} className="font-mono text-[10px] opacity-45">
                          {r.ok ? '✓' : '✗'} {r.name}
                          {r.reason ? ` — ${r.reason}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {pref?.enabled && (
        <section className="mb-8">
          <Label>why she’s been quiet</Label>
          <div className="rounded border border-emerald-500/10 bg-white/[0.02] p-3">
            <button
              type="button"
              disabled={busy === 'why'}
              onClick={() => void diagnose()}
              className="rounded border border-emerald-500/30 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
            >
              {busy === 'why' ? 'Checking…' : 'Check right now'}
            </button>

            {why && (
              <div className="mt-2 space-y-1.5">
                {/*
                  The budget first, because when it refuses nothing else
                  matters — every trigger below could be firing perfectly and
                  she would still say nothing.
                */}
                <p className="font-mono text-[10px] opacity-60">
                  {why.budget.blocked_by
                    ? `she can’t say anything right now — ${why.budget.blocked_by}`
                    : 'she’s allowed to speak right now'}
                </p>
                <p className="font-mono text-[10px] opacity-45">
                  {why.budget.today} today · no limit
                  {/*
                    "Held" is the number that replaced the cap. It is the one
                    thing the old panel could never show, because a nudge the
                    budget refused was never written down at all.
                  */}
                  {why.held ? ` · ${why.held} waiting to be sent` : ''}
                  {why.budget.in_quiet_hours ? ' · quiet hours, holding until the window ends' : ''}
                </p>
                {/*
                  A lost background identity stops every nudge and is
                  indistinguishable from "nothing to say" anywhere else.
                */}
                {!why.model_access.ok && (
                  <p className="text-xs text-amber-300/80">
                    Her background access is failing — {why.model_access.reason}
                  </p>
                )}

                <ul className="mt-2 space-y-1">
                  {why.triggers.map((t) => (
                    <li key={t.id} className="font-mono text-[10px] opacity-45">
                      {t.blocked_by
                        ? `— ${t.label}: ${t.blocked_by}`
                        : t.would_fire
                          ? `✓ ${t.label}: ${t.brief || 'has something to say'}`
                          : t.evaluation_error
                            ? `! ${t.label}: ${t.evaluation_error}`
                            : `· ${t.label}: nothing to say`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
