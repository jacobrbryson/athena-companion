import { useEffect, useState } from 'react';
import { Label } from './Drawer';
import { isAndroidCompanion } from '../native/android';
import { carAudioApi, type CarAudioStatus } from '../native/carAudio';
import { voiceprintApi, type VoiceprintStatus } from '../native/voiceprint';

/**
 * Conversation mode in the car: talk over the car's hands-free, like a call.
 * The switch, what the phone sees right now, and — with "Only my voice" on —
 * teaching it your voice through the car's microphone, which sounds nothing
 * like the phone's own.
 */
export function CarConversation() {
  const [status, setStatus] = useState<CarAudioStatus | null>(null);
  const [voice, setVoice] = useState<VoiceprintStatus | null>(null);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const [teaching, setTeaching] = useState(false);
  const available = isAndroidCompanion();

  useEffect(() => {
    if (!available) return;
    let alive = true;
    const read = () => {
      // An APK from before car mode doesn't know the call: the section stays hidden.
      carAudioApi.status().then((s) => alive && setStatus(s)).catch(() => alive && setStatus(null));
      voiceprintApi.status().then((v) => alive && setVoice(v)).catch(() => alive && setVoice(null));
    };
    read();
    const timer = window.setInterval(read, teaching ? 400 : 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [available, teaching]);

  if (!available || !status || !status.available) return null;

  async function toggle(on: boolean) {
    setNote(null);
    try {
      setStatus(await carAudioApi.setOn(on));
    } catch (e) {
      setNote({ text: (e as Error).message, good: false });
    }
  }

  async function teachInCar() {
    setNote(null);
    setTeaching(true);
    try {
      const r = await voiceprintApi.listen('enroll', true);
      setNote(
        r.ok
          ? { text: 'Got it. In the car I’ll know your voice too.', good: true }
          : { text: r.error ?? 'That didn’t work. Try again.', good: false },
      );
    } catch (e) {
      setNote({ text: (e as Error).message, good: false });
    } finally {
      setTeaching(false);
    }
  }

  const filterOn = Boolean(voice?.enrolled && voice.on);
  const progress = voice?.enrolling ? Math.min(1, voice.enrolling.heardMs / Math.max(1, voice.enrolling.needMs)) : 0;

  return (
    <section className="mb-8">
      <Label>in the car</Label>
      <p className="mb-3 text-sm opacity-70">
        With your phone connected to the car, conversation mode talks through the car like a phone call: the car’s
        microphone hears you, and Athena answers on the car’s speakers. It sounds like a call, and the radio stays muted
        while conversation mode is on.
      </p>
      <label className="mb-2 flex items-center justify-between text-sm">
        <span>Use the car’s hands-free</span>
        <input
          type="checkbox"
          checked={status.on}
          onChange={(e) => void toggle(e.target.checked)}
          className="h-5 w-5 accent-emerald-500"
        />
      </label>
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] opacity-60">
        {status.active
          ? `talking through ${status.car ?? 'the car'}`
          : status.connected
            ? `${status.car ?? 'car'} connected`
            : 'no car connected'}
      </p>
      {status.blocked && (
        <p className="mt-2 text-xs" style={{ color: 'var(--gd-error)' }}>
          {status.blocked}
        </p>
      )}

      {filterOn && status.on && (
        <div className="mt-4">
          <p className="mb-2 text-sm opacity-70">
            “Only my voice” is on. The car’s microphone makes you sound different, so teach it your voice in the car too
            — parked, with conversation mode off.
            {voice?.carEnrolled ? ' Your car voiceprint is saved.' : ''}
          </p>
          {teaching && voice?.enrolling ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : (
            <button
              onClick={() => void teachInCar()}
              disabled={!status.connected || teaching}
              className="h-10 w-full rounded-full border border-emerald-400/50 text-xs font-semibold active:scale-95 disabled:opacity-40"
            >
              {voice?.carEnrolled ? 'Teach my voice in the car again' : 'Teach my voice in the car'}
            </button>
          )}
          {teaching && (
            <p className="mt-2 text-xs opacity-60">Read the sentences under “Only my voice” aloud.</p>
          )}
        </div>
      )}

      {note && (
        <p className="mt-2 text-xs" style={note.good ? undefined : { color: 'var(--gd-error)' }}>
          {note.text}
        </p>
      )}
    </section>
  );
}
