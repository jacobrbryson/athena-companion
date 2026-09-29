import { useEffect, useState } from 'react';
import { Label } from './Drawer';
import { heartApi, type HeartPref } from '../api/companion';
import { isAndroidCompanion } from '../native/android';
import { heartRateApi, type Bounds, type HeartRateStatus, type Limits, type Sport } from '../native/heartRate';

const STATE_TEXT: Record<HeartRateStatus['state'], string> = {
  off: 'Off',
  starting: 'Starting…',
  scanning: 'Looking for your band…',
  choosing: 'Choose your band',
  connecting: 'Connecting…',
  connected: 'Connected',
  unavailable: 'Not connected',
};

const SPORTS: { id: Sport; label: string }[] = [
  { id: 'ride', label: 'Ride' },
  { id: 'run', label: 'Run' },
];

type Draft = Record<Sport, { above: string; below: string }>;

function toDraft(limits: Limits): Draft {
  const one = (b?: Bounds) => ({ above: b?.above ? String(b.above) : '', below: b?.below ? String(b.below) : '' });
  return { ride: one(limits.ride), run: one(limits.run) };
}

function fromDraft(draft: Draft): Limits {
  const one = (d: { above: string; below: string }): Bounds => ({
    ...(d.above.trim() ? { above: Number(d.above) } : {}),
    ...(d.below.trim() ? { below: Number(d.below) } : {}),
  });
  return { ride: one(draft.ride), run: one(draft.run) };
}

/**
 * Live heart rate from a WHOOP ("Heart Rate Broadcast") or any Bluetooth
 * heart-rate strap, read by the Android app (HeartRateService). Exercise limits
 * are checked and spoken on the phone, so they work with no signal. Sharing
 * one-minute summaries with Athena is a separate, server-side switch.
 */
export function HeartRate() {
  const [status, setStatus] = useState<HeartRateStatus | null>(null);
  const [pref, setPref] = useState<HeartPref | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const available = isAndroidCompanion();

  useEffect(() => {
    if (!available) return;
    let alive = true;
    const read = () =>
      heartRateApi
        .status()
        .then((s) => {
          if (!alive) return;
          setStatus(s);
          setDraft((d) => d ?? toDraft(s.limits));
        })
        // An APK from before heart rate doesn't know the call.
        .catch(() => alive && setStatus(null));
    read();
    // Adults only on the server; a refusal just hides the sharing switch.
    heartApi
      .status()
      .then((r) => alive && setPref(r.pref))
      .catch(() => alive && setPref(null));
    const timer = window.setInterval(read, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [available]);

  if (!available || !status || !draft) return null;

  async function run(action: () => Promise<HeartRateStatus | void>) {
    setError(null);
    setBusy(true);
    try {
      const next = await action();
      if (next) setStatus(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggleShare = (on: boolean) =>
    run(async () => {
      const res = await heartApi.setPref({ enabled: on });
      setPref(res.pref);
      return heartRateApi.share(res.pref.enabled);
    });

  const saveLimits = () =>
    run(async () => {
      setSaving(true);
      try {
        const next = await heartRateApi.limits(fromDraft(draft));
        setDraft(toDraft(next.limits));
        return next;
      } finally {
        setSaving(false);
      }
    });

  const on = status.running;
  const session = status.session;
  const field = (sport: Sport, key: 'above' | 'below', placeholder: string) => (
    <input
      type="number"
      inputMode="numeric"
      min={40}
      max={230}
      placeholder={placeholder}
      value={draft[sport][key]}
      onChange={(e) => {
        setDraft({ ...draft, [sport]: { ...draft[sport], [key]: e.target.value } });
      }}
      className="h-10 w-full rounded border border-white/15 bg-transparent px-3 text-sm tabular-nums"
      aria-label={`${sport} ${key === 'above' ? 'upper' : 'lower'} limit`}
    />
  );

  return (
    <section className="mb-8">
      <Label>heart rate</Label>
      <p className="mb-3 text-sm opacity-70">
        Live heart rate from your WHOOP (turn on Heart Rate Broadcast in the WHOOP app) or any Bluetooth heart-rate
        strap. Set limits for a ride or run and I’ll say it out loud the moment you cross one — even with no signal.
      </p>

      {on && status.bpm !== null && (
        <p className="mb-2 font-mono text-4xl tabular-nums">
          {status.bpm}
          <span className="ml-2 text-sm opacity-60">bpm</span>
        </p>
      )}

      <button
        onClick={() => void run(() => (on ? heartRateApi.stop() : heartRateApi.start(pref?.enabled ?? false)))}
        disabled={busy}
        aria-pressed={on}
        className={`h-11 w-full rounded-full text-sm font-semibold active:scale-95 disabled:opacity-50 ${
          on ? 'border border-red-400/50 text-red-200' : 'bg-emerald-500/80 text-black'
        }`}
      >
        {on ? 'Stop reading my band' : 'Connect my heart-rate band'}
      </button>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">
        {STATE_TEXT[status.state] ?? status.state}
        {status.device ? ` · ${status.device}` : ''}
      </p>

      {status.state === 'choosing' && status.found.length > 0 && (
        <div className="mt-3 space-y-2">
          {status.found.map((band) => (
            <button
              key={band.address}
              onClick={() => void run(() => heartRateApi.choose(band.address))}
              disabled={busy}
              className="h-10 w-full rounded border border-white/15 text-left text-sm px-3 active:scale-95"
            >
              {band.name}
              <span className="ml-2 font-mono text-[10px] opacity-50">{band.address.slice(-5)}</span>
            </button>
          ))}
        </div>
      )}

      {(error || status.error) && (
        <p className="mt-2 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error || status.error}
        </p>
      )}
      {status.chosen && !on && (
        <button onClick={() => void run(() => heartRateApi.forget())} className="mt-2 text-xs underline opacity-60">
          Forget this band
        </button>
      )}

      <div className="mt-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">exercise limits (bpm)</p>
        <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
          <span />
          <span className="text-xs opacity-60">Say when over</span>
          <span className="text-xs opacity-60">Say when under</span>
          {SPORTS.map((s) => (
            <div key={s.id} className="contents">
              <span className="text-sm">{s.label}</span>
              {field(s.id, 'above', 'e.g. 165')}
              {field(s.id, 'below', 'e.g. 100')}
            </div>
          ))}
        </div>
        <button
          onClick={() => void saveLimits()}
          disabled={busy}
          className="mt-3 h-10 w-full rounded-full border border-white/20 text-sm active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save limits'}
        </button>
        <p className="mt-2 text-xs opacity-50">
          {status.voice.cached >= status.voice.needed
            ? 'Every alert is saved in my voice on this phone, so it works offline.'
            : `${status.voice.cached} of ${status.voice.needed} alerts saved in my voice — save again with signal. Until then the phone’s own voice says them.`}
        </p>

        <div className="mt-4 flex gap-2">
          {session ? (
            <button
              onClick={() => void run(() => heartRateApi.session(null))}
              disabled={busy}
              className="h-11 flex-1 rounded-full border border-red-400/50 text-sm font-semibold text-red-200 active:scale-95 disabled:opacity-50"
            >
              End {session}
            </button>
          ) : (
            SPORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => void run(() => heartRateApi.session(s.id))}
                disabled={busy || !on}
                className="h-11 flex-1 rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95 disabled:opacity-40"
              >
                Start {s.label.toLowerCase()}
              </button>
            ))
          )}
        </div>
        <p className="mt-2 text-xs opacity-50">
          Limits only apply during a ride or run you start here. One alert each time you cross a limit; it resets once
          you’re back inside by a few beats. If the band drops out mid-session I’ll tell you.
        </p>
      </div>

      {pref && (
        <label className="mt-6 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={pref.enabled}
            disabled={busy}
            onChange={(e) => void toggleShare(e.target.checked)}
            className="mt-1"
          />
          <span>
            Let Athena keep one-minute summaries so she can check them when you ask
            <span className="block text-xs opacity-50">
              Low, average and high per minute — never individual readings. Kept {pref.retention_days} days; turning
              this off deletes them.
              {pref.enabled && status.queued > 0 ? ` ${status.queued} minutes waiting to send.` : ''}
            </span>
          </span>
        </label>
      )}

      <p className="mt-3 text-xs opacity-50">
        Android shows a notification while I hold the band. A band usually takes one connection — while I have it,
        Strava or Peloton can’t, so stop it here or from the notification to hand it back.
      </p>
    </section>
  );
}
