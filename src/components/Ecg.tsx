import { useEffect, useId, useRef, useState } from 'react';
import { isAndroidCompanion } from '../native/android';
import { heartRateApi } from '../native/heartRate';

/**
 * A heart-monitor trace that beats at `bpm`: a bright head sweeps left to
 * right at a fixed paper speed, writing one PQRST complex per beat and erasing
 * just ahead of itself, with the older trace fading behind it like phosphor.
 * Beat spacing comes from the rate, so 50 bpm and 120 bpm look different at a
 * glance. A rate change (a live reading every couple of seconds) takes effect
 * from the next beat with no jump.
 *
 * Decorative: with no rate, or with reduced motion asked for, it draws the old
 * still trace.
 */

const W = 200;
const BASE = 30;
/** Paper speed in viewBox units a second — four seconds a sweep, so four beats at 60 bpm. */
const SPEED = 50;
const STEP = 0.5;
const N = W / STEP;
/** Erased columns ahead of the head. */
const GAP = 14;
/** One beat, [seconds after it starts, offset from the baseline]; up is negative. */
const BEAT: [number, number][] = [
  [0, 0], [0.04, -3], [0.08, 0], [0.15, 0], [0.17, 2], [0.2, -22], [0.23, 8], [0.26, 0],
  [0.34, 0], [0.43, -5], [0.52, 0],
];
const STILL = 'M0 30h22l4-6 4 6h12l3-22 5 38 4-16h18l4-8 4 8h14l3-18 5 30 4-12h20l4-7 4 7h14l3-14 4 22 3-8h16';

function beatAt(t: number, squeeze: number) {
  const s = t / squeeze;
  if (s >= BEAT[BEAT.length - 1][0]) return 0;
  for (let i = 1; i < BEAT.length; i++) {
    const [t1, y1] = BEAT[i];
    if (s <= t1) {
      const [t0, y0] = BEAT[i - 1];
      return y0 + ((y1 - y0) * (s - t0)) / (t1 - t0 || 1);
    }
  }
  return 0;
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Ecg({ bpm }: { bpm: number | null }) {
  const id = useId().replace(/:/g, '');
  const fresh = useRef<SVGPathElement>(null);
  const old = useRef<SVGPathElement>(null);
  const grad = useRef<SVGLinearGradientElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const rate = useRef(bpm);
  rate.current = bpm;
  const animate = bpm != null && bpm > 0 && !reducedMotion();

  useEffect(() => {
    if (!animate) return;
    const ys = new Float32Array(N).fill(BASE);
    let col = 0;
    let sinceBeat = 0;
    // The next beat's interval, with a little beat-to-beat variation so it reads as a heart, not a metronome.
    const nextInterval = () => (60 / Math.max(25, Math.min(240, rate.current || 60))) * (1 + (Math.random() - 0.5) * 0.04);
    let interval = nextInterval();
    let carry = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // A hidden tab pauses frames; pick up where it was rather than racing to catch up.
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      carry += (dt * SPEED) / STEP;
      while (carry >= 1) {
        carry -= 1;
        sinceBeat += STEP / SPEED;
        if (sinceBeat >= interval) {
          sinceBeat -= interval;
          interval = nextInterval();
        }
        // Fast rates squeeze the complex so the T wave finishes before the next beat.
        ys[col] = BASE + beatAt(sinceBeat, Math.min(1, interval / 0.75));
        col = (col + 1) % N;
      }
      const head = (col - 1 + N) % N;
      let a = '';
      for (let i = 0; i <= head; i++) a += `${i ? 'L' : 'M'}${(i * STEP).toFixed(1)} ${ys[i].toFixed(1)}`;
      let b = '';
      for (let i = head + GAP; i < N; i++) b += `${i === head + GAP ? 'M' : 'L'}${(i * STEP).toFixed(1)} ${ys[i].toFixed(1)}`;
      fresh.current?.setAttribute('d', a);
      old.current?.setAttribute('d', b);
      // The fade is pinned to the head and repeats, so the wrapped-around old trace keeps fading.
      const hx = head * STEP;
      grad.current?.setAttribute('x1', String(hx - W));
      grad.current?.setAttribute('x2', String(hx));
      dot.current?.setAttribute('cx', String(hx));
      dot.current?.setAttribute('cy', String(ys[head]));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  if (!animate) {
    return <svg className="hp-ecg" viewBox="0 0 200 50" aria-hidden="true"><path d={STILL} fill="none" stroke="#3ee4ff" strokeWidth="1.6" /></svg>;
  }
  return <svg className="hp-ecg" viewBox="0 0 200 50" aria-hidden="true">
    <defs>
      <linearGradient id={`ecg${id}`} ref={grad} gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1={-W} x2={0} y1={0} y2={0}>
        <stop offset="0" stopColor="#3ee4ff" stopOpacity=".18" />
        <stop offset=".75" stopColor="#3ee4ff" stopOpacity=".6" />
        <stop offset="1" stopColor="#3ee4ff" stopOpacity="1" />
      </linearGradient>
    </defs>
    <path ref={old} fill="none" stroke={`url(#ecg${id})`} strokeWidth="1.6" strokeLinejoin="round" />
    <path ref={fresh} fill="none" stroke={`url(#ecg${id})`} strokeWidth="1.6" strokeLinejoin="round" />
    <circle ref={dot} className="hp-ecg-head" r="1.9" cx="0" cy={BASE} />
  </svg>;
}

/**
 * The phone's live heart rate while the Android app is reading a band
 * (Phone & car → Heart rate); null anywhere else, or until a reading arrives.
 * Only asks the phone — nothing is sent anywhere.
 */
export function useLiveHeartRate(): number | null {
  const [bpm, setBpm] = useState<number | null>(null);
  useEffect(() => {
    if (!isAndroidCompanion()) return;
    let alive = true;
    const read = () => heartRateApi.status()
      .then(s => alive && setBpm(s.running && s.state === 'connected' && s.bpm ? s.bpm : null))
      // An APK from before heart rate doesn't know the call.
      .catch(() => alive && setBpm(null));
    read();
    const timer = window.setInterval(read, 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return bpm;
}
