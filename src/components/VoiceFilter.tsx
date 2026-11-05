import { useEffect, useState } from 'react';
import { Label } from './Drawer';
import { isAndroidCompanion } from '../native/android';
import { voiceprintApi, type VoiceprintResult, type VoiceprintStatus } from '../native/voiceprint';

/** Read aloud while the phone learns your voice: varied sounds, nothing personal. */
const SENTENCES = [
  'The quick brown fox jumps over the lazy dog by the river.',
  'Remind me to water the garden when I get home tonight.',
  'What will the weather be like on Saturday morning?',
  'Six thick thistle sticks were stacked beside the old barn.',
  'Please add milk, eggs, and a loaf of bread to the list.',
];

/**
 * "Only my voice": the phone learns its owner's voice so conversation mode
 * and hands-free ignore everyone else in the room. The print never leaves
 * the phone (Voiceprint.java); this panel only teaches, checks and deletes.
 */
export function VoiceFilter() {
  const [status, setStatus] = useState<VoiceprintStatus | null>(null);
  const [result, setResult] = useState<{ text: string; good: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = isAndroidCompanion();

  useEffect(() => {
    if (!available) return;
    let alive = true;
    const read = () =>
      voiceprintApi
        .status()
        .then((s) => alive && setStatus(s))
        // An APK from before the voice filter doesn't know the call.
        .catch(() => alive && setStatus(null));
    read();
    // Fast while the phone is listening, so the progress bar moves.
    const timer = window.setInterval(read, status?.enrolling ? 400 : 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [available, Boolean(status?.enrolling)]);

  if (!available || !status || !status.available) return null;

  async function listen(mode: 'enroll' | 'check') {
    setError(null);
    setResult(null);
    const started = voiceprintApi.listen(mode);
    // The call answers only when it's done; show the listening state now.
    window.setTimeout(() => void voiceprintApi.status().then(setStatus).catch(() => undefined), 150);
    try {
      const r: VoiceprintResult = await started;
      if (!r.ok) setError(r.error ?? 'That didn’t work. Try again.');
      else if (mode === 'enroll') setResult({ text: 'Got it. From now on I only answer your voice.', good: true });
      else
        setResult(
          r.match
            ? { text: `That sounded like you (${r.score?.toFixed(2)}).`, good: true }
            : { text: `That didn’t sound like you (${r.score?.toFixed(2)}). Try teaching me again somewhere quiet.`, good: false },
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(await voiceprintApi.status().catch(() => null));
    }
  }

  async function act(fn: () => Promise<VoiceprintStatus>) {
    setError(null);
    setResult(null);
    try {
      setStatus(await fn());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const busy = status.enrolling;
  const progress = busy ? Math.min(1, busy.heardMs / Math.max(1, busy.needMs)) : 0;

  return (
    <section className="mb-8">
      <Label>only my voice</Label>
      <p className="mb-3 text-sm opacity-70">
        Teach the phone your voice and conversation mode and hands-free ignore everyone else: what someone else says
        is dropped on the phone before anything is sent.
      </p>

      {busy ? (
        <div className="rounded border border-emerald-400/40 bg-emerald-500/5 p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] opacity-60">
            {busy.mode === 'enroll' ? 'listening — read these aloud' : 'listening — say a sentence'}
          </p>
          {busy.mode === 'enroll' && (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
              {SENTENCES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <button
            onClick={() => void voiceprintApi.cancel()}
            className="mt-3 h-9 w-full rounded-full border border-white/20 text-xs active:scale-95"
          >
            Stop
          </button>
        </div>
      ) : status.enrolled ? (
        <>
          <label className="mb-3 flex items-center justify-between text-sm">
            <span>Only answer my voice</span>
            <input
              type="checkbox"
              checked={status.on}
              onChange={(e) => void act(() => voiceprintApi.setOn(e.target.checked))}
              className="h-5 w-5 accent-emerald-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => void listen('check')}
              className="h-10 flex-1 rounded-full border border-emerald-400/50 text-xs font-semibold active:scale-95"
            >
              Check it knows me
            </button>
            <button
              onClick={() => void listen('enroll')}
              className="h-10 flex-1 rounded-full border border-white/20 text-xs active:scale-95"
            >
              Teach again
            </button>
          </div>
          <button
            onClick={() => void act(voiceprintApi.remove)}
            className="mt-2 h-9 w-full rounded-full border border-red-400/40 text-xs text-red-200 active:scale-95"
          >
            Delete my voiceprint
          </button>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">
            {status.on ? 'on' : 'off'}
            {status.ignored > 0 ? ` · ignored ${status.ignored} ${status.ignored === 1 ? 'turn' : 'turns'} from someone else` : ''}
          </p>
        </>
      ) : (
        <button
          onClick={() => void listen('enroll')}
          className="h-11 w-full rounded-full bg-emerald-500/80 text-sm font-semibold text-black active:scale-95"
        >
          Teach Athena your voice
        </button>
      )}

      {result && (
        <p className="mt-2 text-xs" style={result.good ? undefined : { color: 'var(--gd-error)' }}>
          {result.text}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--gd-error)' }}>
          {error}
        </p>
      )}
      <p className="mt-3 text-xs opacity-50">
        It takes about 15 seconds of you reading aloud. Your voiceprint is made and kept on this phone, encrypted, and
        used only to recognise you. It never goes to Athena’s servers, and Delete removes it for good.
      </p>
    </section>
  );
}
