import { useEffect, useState } from 'react';
import { Label } from './Drawer';
import { localTimezone } from '../config';
import { isAndroidCompanion } from '../native/android';
import { chatSessionId, handsFreeApi, type HandsFreeStatus } from '../native/handsFree';

const STATE_TEXT: Record<HandsFreeStatus['state'], string> = {
  off: 'Off',
  starting: 'Starting…',
  waiting: 'Listening for “Athena”',
  listening: 'Hearing you…',
  thinking: 'Thinking…',
  speaking: 'Speaking',
};

/**
 * Hands-free on this phone: say "Athena", hear a chime, talk. Only in the
 * Android app — the listening runs natively (HandsFreeService) so it keeps
 * going with the screen off. Everything up to the wake word, and the words
 * after it, is heard on the phone; only the text goes to her.
 */
export function HandsFree() {
  const [status, setStatus] = useState<HandsFreeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = isAndroidCompanion();

  useEffect(() => {
    if (!available) return;
    let alive = true;
    const read = () =>
      handsFreeApi
        .status()
        .then((s) => alive && setStatus(s))
        // An APK from before hands-free doesn't know the call.
        .catch(() => alive && setStatus(null));
    read();
    const timer = window.setInterval(read, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [available]);

  if (!available || !status) return null;

  async function toggle() {
    setError(null);
    setBusy(true);
    try {
      if (status?.running) {
        setStatus(await handsFreeApi.stop());
      } else {
        const session = chatSessionId();
        if (!session) throw new Error('Open the chat once, then turn hands-free on.');
        setStatus(await handsFreeApi.start(session, localTimezone() ?? null));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const on = status.running;
  return (
    <section className="mb-8">
      <Label>hands-free</Label>
      <p className="mb-3 text-sm opacity-70">
        Just talk — “Athena, what time is it?” — screen off, phone in a pocket. She answers out loud, and you can
        follow up once without saying her name. Left on, it comes back whenever you open the app.
      </p>
      <button
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={on}
        className={`h-11 w-full rounded-full text-sm font-semibold active:scale-95 disabled:opacity-50 ${
          on ? 'border border-red-400/50 text-red-200' : 'bg-emerald-500/80 text-black'
        }`}
      >
        {on ? 'Stop listening' : 'Listen for “Athena”'}
      </button>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">
        {STATE_TEXT[status.state] ?? status.state}
        {status.transcriber ? ` · ${status.transcriber === 'on-device' ? 'android on-device' : 'offline model'}` : ''}
      </p>
      {status.lastHeard && <p className="mt-1 text-xs opacity-60">Last heard: “{status.lastHeard}”</p>}
      {(error || status.error) && (
        <p className="mt-2 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error || status.error}
        </p>
      )}
      <p className="mt-3 text-xs opacity-50">
        Nothing leaves the phone until it hears her name, and then only the words — never audio. Android shows a
        notification the whole time it listens; stop it from there or here.
      </p>
    </section>
  );
}
