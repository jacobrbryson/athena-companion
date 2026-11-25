import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { kidSound } from '../../api/kid';
import { LevelUpBanner, XpBar, useGameXp } from '../games/GameXp';
import { levels } from '../games/progress';
import { CATCH_Y, HEIGHT, WIDTH, athenaTarget, featuresFor, multiplier, newWorld, step, type Comet, type GameEvent, type Kind, type Side, type World } from './engine';
import { CONSTELLATIONS, costOf, finishedBetween, skyFor, type Constellation } from './constellations';
import './comet.css';

/**
 * Comet Catchers (owner, 11-25): the Guardians' third mini-game, made to be
 * played together. Lay the tablet flat between two people: blue guards the
 * bottom edge, gold the top. Comets say by colour who must catch them; one
 * that heads for the wrong player gets bounced across, and catching a pass is
 * a Relay. Alone, Athena plays gold. Rules live in engine.ts (tested); this
 * file draws them, plays them, and keeps the sky map.
 *
 * Everything runs on the tablet: canvas drawing, synthesized sound, and
 * progress in localStorage per player — no network, like the other games.
 */

type Phase = 'menu' | 'play' | 'over' | 'sky';
type Mode = 'duo' | 'athena';

export const COMET_LEVELS = levels(
  ['Stargazer', 'Comet Spotter', 'Sky Scout', 'Orbit Ace', 'Meteor Wrangler', 'Star Sailor', 'Nebula Navigator', 'Comet Captain',
    'Galaxy Guardian', 'Supernova', 'Cosmic Keeper', 'Starlight Legend', 'Sky Sage', 'Aurora Ace', 'Master of the Sky'],
  {
    2: 'Golden comets — worth five!',
    3: 'Twin comets that split for both of you',
    4: 'Meteor showers',
    6: 'Faster skies',
  },
);

const totalKey = (who: string) => `comet_stardust_v1:${who}`;
const bestKey = (who: string) => `comet_best_v1:${who}`;
const store = {
  num: (k: string) => { try { return Math.max(0, Number(localStorage.getItem(k)) || 0); } catch { return 0; } },
  set: (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* this visit only */ } },
};

const COLORS: Record<Kind, string> = { blue: '#4cc9ff', gold: '#ffc94d', white: '#f4f7ff', golden: '#ffe066' };
const SIDE_COLOR: Record<Side, string> = { bottom: '#4cc9ff', top: '#ffc94d' };
// A pentatonic scale, so any run of catches sounds like a tune.
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

function useSky() {
  const ctx = useRef<AudioContext | null>(null);
  const get = () => {
    if (!ctx.current) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx.current = new Ctx();
      } catch { return null; }
    }
    if (ctx.current.state === 'suspended') void ctx.current.resume();
    return kidSound.on() ? ctx.current : null;
  };
  const note = useCallback((f: number, at = 0, dur = 0.35, vol = 0.14, type: OscillatorType = 'triangle') => {
    const c = get(); if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }, []);
  const sweep = useCallback((from: number, to: number, dur: number, vol = 0.08) => {
    const c = get(); if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(from, c.currentTime); o.frequency.exponentialRampToValueAtTime(to, c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
  }, []);
  useEffect(() => () => { void ctx.current?.close(); }, []);
  return useMemo(() => ({ note, sweep }), [note, sweep]);
}

const vibrate = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* no motor */ } };

interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface Floater { x: number; y: number; text: string; life: number; color: string; flip: boolean; big?: boolean }
interface Hud { stardust: number; shields: number; combo: number; shower: boolean }

/** Glow sprites drawn once, so the frame never uses canvas shadows (slow on old tablets). */
function glowSprite(color: string, r: number) {
  const c = document.createElement('canvas');
  const s = r * 6; c.width = s; c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.18, color); grad.addColorStop(0.45, `${color}55`); grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  return c;
}

function ConstellationArt({ c, lit, size = 120 }: { c: Constellation; lit: number; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="cc-const">
      {c.lines.map(([a, b], i) => {
        const on = a < lit && b < lit;
        return <line key={i} x1={c.stars[a][0] * 100} y1={c.stars[a][1] * 100} x2={c.stars[b][0] * 100} y2={c.stars[b][1] * 100} className={on ? 'on' : ''} />;
      })}
      {c.stars.map(([x, y], i) => <circle key={i} cx={x * 100} cy={y * 100} r={i < lit ? 3.6 : 2.2} className={i < lit ? 'on' : ''} />)}
    </svg>
  );
}

export function CometCatchers({ who, onClose }: { who: string; onClose: () => void }) {
  const xpGame = useGameXp('comet', who, COMET_LEVELS);
  const sound = useSky();
  const [phase, setPhase] = useState<Phase>('menu');
  const [mode, setMode] = useState<Mode>('duo');
  const [hud, setHud] = useState<Hud>({ stardust: 0, shields: 3, combo: 0, shower: false });
  const [total, setTotal] = useState(() => store.num(totalKey(who)));
  const [best, setBest] = useState(() => store.num(bestKey(who)));
  const [result, setResult] = useState<{ stardust: number; best: number; relays: number; catches: number; newBest: boolean; finished: Constellation[] } | null>(null);
  const [showFact, setShowFact] = useState<Constellation | null>(null);
  const [soundOn, setSoundOn] = useState(kidSound.on());

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const world = useRef<World | null>(null);
  const pointers = useRef(new Map<number, { side: Side; x: number }>());
  const keys = useRef(new Set<string>());
  const sparks = useRef<Spark[]>([]);
  const floaters = useRef<Floater[]>([]);
  const shake = useRef(0);
  const view = useRef({ scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 });
  const sprites = useRef<Record<string, HTMLCanvasElement>>({});
  const stars = useMemo(() => Array.from({ length: 140 }, (_, i) => ({ x: ((i * 7919) % 1000), y: ((i * 104729) % 600), r: 0.5 + ((i * 31) % 10) / 9, p: (i * 0.37) % 6.28 })), []);
  const randRef = useRef(Math.random);
  // Set once a round's end is on its way, so stardust is banked exactly once.
  const ending = useRef(false);

  const sky = skyFor(total);
  const current = CONSTELLATIONS[sky.index];

  // ── sizing: the 1000×600 world fits the screen, centred ────────────────────
  const fit = useCallback(() => {
    const el = canvas.current; if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = el.clientWidth; const h = el.clientHeight;
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    const scale = Math.min(w / WIDTH, h / HEIGHT);
    view.current = { scale, ox: (w - WIDTH * scale) / 2, oy: (h - HEIGHT * scale) / 2, w, h, dpr };
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const el = canvas.current!; const r = el.getBoundingClientRect(); const v = view.current;
    return { x: (clientX - r.left - v.ox) / v.scale, y: (clientY - r.top - v.oy) / v.scale };
  };

  // ── events → sound, sparks and words ──────────────────────────────────────
  const react = useCallback((events: GameEvent[]) => {
    let hudChanged = false;
    for (const e of events) {
      if (e.type === 'catch') {
        hudChanged = true;
        const color = COLORS[e.kind];
        for (let i = 0; i < (e.relay || e.kind === 'golden' ? 22 : 12); i += 1) {
          const a = Math.random() * Math.PI * 2; const v = 120 + Math.random() * 260;
          sparks.current.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, color });
        }
        const flip = e.side === 'top';
        floaters.current.push({ x: e.x, y: e.y + (flip ? 40 : -40), text: `+${e.points}`, life: 1, color, flip });
        if (e.relay) { floaters.current.push({ x: e.x, y: e.y + (flip ? 80 : -80), text: 'RELAY!', life: 1.2, color: '#ff8af0', flip, big: true }); sound.note(PENTA[4], 0, 0.3); sound.note(PENTA[7], 0.08, 0.4); vibrate([15, 30, 25]); }
        else if (e.kind === 'golden') { [0, 2, 4, 7, 9].forEach((n, i) => sound.note(PENTA[n], i * 0.05, 0.4, 0.12)); vibrate(30); }
        else { sound.note(PENTA[Math.min(PENTA.length - 1, (e.combo - 1) % 8 + (multiplier(e.combo) - 1))], 0, 0.3); vibrate(12); }
        if (e.combo > 0 && e.combo % 5 === 0) floaters.current.push({ x: WIDTH / 2, y: HEIGHT / 2 + (flip ? -30 : 30), text: `COMBO ×${multiplier(e.combo)}!`, life: 1.3, color: '#7dffb2', flip: false, big: true });
      } else if (e.type === 'pass') {
        sound.note(PENTA[2], 0, 0.15, 0.1, 'sine'); vibrate(8);
        floaters.current.push({ x: e.x, y: e.y + (e.side === 'top' ? 40 : -40), text: 'PASS!', life: 0.8, color: '#dfe7ff', flip: e.side === 'top' });
      } else if (e.type === 'miss') {
        hudChanged = true; shake.current = 0.3; sound.sweep(180, 70, 0.35, 0.12); vibrate([40, 30, 40]);
      } else if (e.type === 'close') {
        floaters.current.push({ x: e.x, y: CATCH_Y[e.side] + (e.side === 'top' ? 60 : -60), text: 'SO CLOSE!', life: 1, color: '#ffb3c1', flip: e.side === 'top' });
      } else if (e.type === 'twin') {
        sound.note(PENTA[5], 0, 0.25); sound.note(PENTA[3], 0.04, 0.25);
        floaters.current.push({ x: e.x, y: e.y - 30, text: 'TWINS!', life: 1, color: '#ffffff', flip: false, big: true });
      } else if (e.type === 'shower') {
        hudChanged = true; sound.sweep(300, 1200, 0.8, 0.07);
        floaters.current.push({ x: WIDTH / 2, y: HEIGHT / 2, text: '☄ METEOR SHOWER ☄', life: 2, color: '#ffffff', flip: false, big: true });
      } else if (e.type === 'shield') {
        hudChanged = true; sound.note(PENTA[6], 0, 0.3); sound.note(PENTA[8], 0.1, 0.4);
      }
    }
    if (hudChanged && world.current) {
      const w = world.current;
      setHud({ stardust: w.stardust, shields: w.shields, combo: w.combo, shower: w.showerUntil > w.t });
    }
  }, [sound]);

  // ── the round ends: bank stardust, light the sky, show the result ─────────
  const finish = useCallback(() => {
    const w = world.current; if (!w) return;
    const before = store.num(totalKey(who));
    const after = before + w.stardust;
    store.set(totalKey(who), after);
    setTotal(after);
    const newBest = w.stardust > store.num(bestKey(who));
    if (newBest) { store.set(bestKey(who), w.stardust); setBest(w.stardust); }
    xpGame.add(w.stardust, 'stardust');
    const finished = finishedBetween(before, after);
    setResult({ stardust: w.stardust, best: w.best, relays: w.relays, catches: w.catches, newBest, finished });
    [9, 7, 5, 4, 2, 0].forEach((n, i) => sound.note(PENTA[n], i * 0.09, 0.4, 0.1));
    if (finished.length) later(() => [0, 4, 7, 9, 10].forEach((n, i) => sound.note(PENTA[n], i * 0.1, 0.6, 0.12)), 700);
    setPhase('over');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, xpGame.add, sound]);

  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  // ── the loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    fit();
    const el = canvas.current!; const g = el.getContext('2d')!;
    if (!sprites.current.blue) for (const k of Object.keys(COLORS) as Kind[]) sprites.current[k] = glowSprite(COLORS[k], k === 'golden' ? 15 : 12);
    let raf = 0; let last = performance.now();

    const frame = (now: number) => {
      const w = world.current!;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (document.visibilityState === 'visible') {
        const targets: Partial<Record<Side, number>> = {};
        for (const p of pointers.current.values()) targets[p.side] = p.x;
        const kb = keys.current;
        if (kb.has('ArrowLeft')) targets.bottom = w.catchers.bottom.x - 40;
        if (kb.has('ArrowRight')) targets.bottom = w.catchers.bottom.x + 40;
        if (kb.has('a')) targets.top = w.catchers.top.x - 40;
        if (kb.has('d')) targets.top = w.catchers.top.x + 40;
        if (mode === 'athena') { const t = athenaTarget(w, 'top'); if (t !== undefined) targets.top = t; }
        const events = step(w, dt, randRef.current, targets);
        if (events.length) react(events);
        if (w.over && !ending.current) { ending.current = true; later(finish, 900); }
      }
      draw(g, now / 1000, dt);
      raf = requestAnimationFrame(frame);
    };

    const draw = (g: CanvasRenderingContext2D, time: number, dt: number) => {
      const v = view.current; const w = world.current!;
      g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      // Sky fills the whole screen; the play field is centred in it.
      const bg = g.createLinearGradient(0, 0, 0, v.h);
      bg.addColorStop(0, '#2a1d05'); bg.addColorStop(0.18, '#0b1230'); bg.addColorStop(0.82, '#061530'); bg.addColorStop(1, '#03253a');
      g.fillStyle = bg; g.fillRect(0, 0, v.w, v.h);
      let sx = 0; let sy = 0;
      if (shake.current > 0) { shake.current -= dt; sx = (Math.random() - 0.5) * 10; sy = (Math.random() - 0.5) * 10; }
      g.translate(v.ox + sx, v.oy + sy); g.scale(v.scale, v.scale);

      for (const s of stars) {
        g.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.3 + s.p);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      // The middle line, and a faint tint for each player's half.
      g.fillStyle = '#ffc94d0d'; g.fillRect(0, 0, WIDTH, HEIGHT / 2);
      g.fillStyle = '#4cc9ff0d'; g.fillRect(0, HEIGHT / 2, WIDTH, HEIGHT / 2);
      g.strokeStyle = '#ffffff22'; g.setLineDash([8, 14]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, HEIGHT / 2); g.lineTo(WIDTH, HEIGHT / 2); g.stroke(); g.setLineDash([]);
      if (w.showerUntil > w.t) { g.fillStyle = `rgba(255,255,255,${0.04 + 0.03 * Math.sin(time * 8)})`; g.fillRect(0, 0, WIDTH, HEIGHT); }

      // Comets: a fading tail, then the glowing head.
      for (const c of w.comets) drawComet(g, c, time);

      // Catchers.
      for (const side of ['bottom', 'top'] as Side[]) {
        const cat = w.catchers[side]; const y = CATCH_Y[side]; const col = SIDE_COLOR[side];
        const grad = g.createLinearGradient(cat.x - cat.w / 2, 0, cat.x + cat.w / 2, 0);
        grad.addColorStop(0, `${col}00`); grad.addColorStop(0.15, col); grad.addColorStop(0.85, col); grad.addColorStop(1, `${col}00`);
        g.fillStyle = `${col}33`; g.beginPath(); g.ellipse(cat.x, y, cat.w / 2 + 14, 22, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = grad; g.beginPath(); g.ellipse(cat.x, y, cat.w / 2, 9, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffffcc'; g.beginPath(); g.ellipse(cat.x, y - (side === 'bottom' ? 2 : -2), cat.w / 2 - 18, 2.5, 0, 0, Math.PI * 2); g.fill();
      }

      // Sparks and words.
      sparks.current = sparks.current.filter(p => (p.life -= dt) > 0);
      for (const p of sparks.current) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
        g.globalAlpha = Math.max(0, p.life / 0.7); g.fillStyle = p.color;
        g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
      }
      g.globalAlpha = 1;
      floaters.current = floaters.current.filter(f => (f.life -= dt) > 0);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const f of floaters.current) {
        g.save();
        g.translate(f.x, f.y + (f.flip ? 1 : -1) * (1 - f.life) * 40);
        if (f.flip) g.rotate(Math.PI);
        g.globalAlpha = Math.min(1, f.life * 1.6);
        g.font = `900 ${f.big ? 38 : 26}px system-ui, sans-serif`;
        g.lineWidth = 6; g.strokeStyle = '#00000099'; g.strokeText(f.text, 0, 0);
        g.fillStyle = f.color; g.fillText(f.text, 0, 0);
        g.restore();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    };

    const drawComet = (g: CanvasRenderingContext2D, c: Comet, time: number) => {
      const col = COLORS[c.kind];
      c.trail.forEach((p, i) => {
        const a = (i + 1) / c.trail.length;
        g.globalAlpha = a * 0.5; g.fillStyle = col;
        g.beginPath(); g.arc(p.x, p.y, c.r * a * 0.9, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;
      const s = sprites.current[c.kind]; const size = c.r * 6 * (c.kind === 'golden' ? 1 + 0.12 * Math.sin(time * 12) : 1);
      g.drawImage(s, c.x - size / 2, c.y - size / 2, size, size);
      if (c.passed) { g.strokeStyle = '#ff8af0'; g.lineWidth = 2; g.beginPath(); g.arc(c.x, c.y, c.r + 6, 0, Math.PI * 2); g.stroke(); }
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', fit);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, [phase, mode, fit, react, finish, stars]);

  // Keyboard for testing on a computer: ←/→ for blue, A/D for gold.
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── touch: each finger steers the catcher on its own half ─────────────────
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.type === 'pointerdown') { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } }
    if (e.type === 'pointerup' || e.type === 'pointercancel') { pointers.current.delete(e.pointerId); return; }
    if (e.type === 'pointermove' && !pointers.current.has(e.pointerId) && e.buttons === 0 && e.pointerType === 'mouse') return;
    const p = toWorld(e.clientX, e.clientY);
    const known = pointers.current.get(e.pointerId);
    const side: Side = known?.side || (p.y < HEIGHT / 2 ? 'top' : 'bottom');
    if (mode === 'athena' && side === 'top') return;
    pointers.current.set(e.pointerId, { side, x: p.x });
  };

  const start = (m: Mode) => {
    const level = xpGame.st.level.level;
    setMode(m);
    world.current = newWorld(featuresFor(level), level <= 2);
    randRef.current = Math.random;
    ending.current = false;
    sparks.current = []; floaters.current = []; pointers.current.clear();
    xpGame.resetRun();
    setHud({ stardust: 0, shields: world.current.shields, combo: 0, shower: false });
    setResult(null);
    setPhase('play');
    // Development only: lets a test drive the round from the console.
    if (import.meta.env.DEV) (window as unknown as { __comet?: unknown }).__comet = { world, react };
    sound.note(PENTA[0], 0, 0.2); sound.note(PENTA[2], 0.08, 0.2); sound.note(PENTA[4], 0.16, 0.3);
  };

  const toggleSound = () => { const on = !soundOn; kidSound.set(on); setSoundOn(on); };
  const shieldDots = (n: number, max: number) => Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />);

  return createPortal(
    <div className={`cc cc-phase-${phase}`} role="dialog" aria-label="Comet Catchers">
      {phase === 'play' && (
        <>
          <canvas ref={canvas} className="cc-canvas" onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} onPointerCancel={onPointer} />
          {/* One readout across the middle, readable from both sides. */}
          <div className="cc-mid" aria-live="polite">
            <span className="cc-mid-top">{hud.combo >= 2 ? `×${multiplier(hud.combo)} · ` : ''}{hud.stardust} ✦</span>
            <span className="cc-shields">{shieldDots(hud.shields, world.current?.maxShields ?? 5)}</span>
            <span className="cc-mid-bottom">{hud.stardust} ✦{hud.combo >= 2 ? ` · ×${multiplier(hud.combo)}` : ''}</span>
          </div>
          {mode === 'athena' && <span className="cc-athena-tag">Athena</span>}
          <button type="button" className="cc-quit" onClick={() => { if (world.current) world.current.over = true; }} aria-label="End round">⏹</button>
        </>
      )}

      {phase !== 'play' && (
        <div className="cc-screen">
          <header className="cc-top">
            <div className="cc-title"><b>☄ COMET CATCHERS</b><small>{phase === 'sky' ? 'Sky map' : phase === 'over' ? 'Round over' : 'Catch together'}</small></div>
            <XpBar xp={xpGame.xp} st={xpGame.st} pops={xpGame.pops} />
            <div className="cc-tools">
              {phase !== 'menu' && <button type="button" onClick={() => setPhase('menu')} aria-label="Menu">🏠</button>}
              <button type="button" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Sound off' : 'Sound on'}>{soundOn ? '🔊' : '🔇'}</button>
              <button type="button" onClick={onClose} aria-label="Back to Base">✕</button>
            </div>
          </header>

          {phase === 'menu' && (
            <main className="cc-menu">
              <div className="cc-how">
                <p><b className="blue">Blue</b> guards the bottom. <b className="gold">Gold</b> guards the top. Slide your finger along your edge.</p>
                <p>A comet's colour says who catches it. Heading the wrong way? <b>Bounce it to your partner</b> — catching a pass is a <b className="pink">Relay</b> and worth the most. White comets are anyone's.</p>
              </div>
              <div className="cc-modes">
                <button type="button" className="cc-mode primary" onClick={() => start('duo')}><span aria-hidden>👫</span><b>Play together</b><small>Lay the tablet flat between you</small></button>
                <button type="button" className="cc-mode" onClick={() => start('athena')}><span aria-hidden>🤖</span><b>Play with Athena</b><small>You're blue, she's gold</small></button>
              </div>
              <button type="button" className="cc-sky-peek" onClick={() => setPhase('sky')}>
                <ConstellationArt c={current} lit={sky.lit} size={72} />
                <span><b>{current.name}</b><small>{sky.lit} of {current.stars.length} stars lit · {sky.need - sky.into} ✦ to the next</small></span>
              </button>
              {best > 0 && <p className="cc-best">Best round: {best} ✦</p>}
            </main>
          )}

          {phase === 'over' && result && (
            <main className="cc-over">
              <div className="cc-confetti" aria-hidden>{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
              <h2>{result.newBest ? '🌟 New best!' : 'Nice catching!'}</h2>
              <p className="cc-big">+{result.stardust} ✦ stardust</p>
              <ul className="cc-stats">
                <li><b>{result.catches}</b>caught</li>
                <li><b>{result.relays}</b>relays</li>
                <li><b>{result.best}</b>best combo</li>
              </ul>
              {result.finished.length ? (
                <button type="button" className="cc-finished" onClick={() => setShowFact(result.finished[0])}>
                  <ConstellationArt c={result.finished[0]} lit={99} size={96} />
                  <span><small>You lit up</small><b>{result.finished[0].name}!</b><em>Tap to learn about it</em></span>
                </button>
              ) : (
                <div className="cc-progress">
                  <ConstellationArt c={current} lit={sky.lit} size={84} />
                  <span><b>{current.name}</b><small>{current.stars.length - sky.lit} more {current.stars.length - sky.lit === 1 ? 'star' : 'stars'} to finish it</small>
                    <span className="cc-bar"><i style={{ width: `${Math.round(((sky.lit * sky.need + sky.into) / costOf(sky.index)) * 100)}%` }} /></span></span>
                </div>
              )}
              <div className="cc-actions">
                <button type="button" className="cc-btn primary" onClick={() => start(mode)}>☄ Again!</button>
                <button type="button" className="cc-btn" onClick={() => setPhase('sky')}>✨ Sky map</button>
              </div>
              {result.finished.length > 0 && <p className="cc-rest">A whole constellation — a great place to stop, or keep going!</p>}
            </main>
          )}

          {phase === 'sky' && (
            <main className="cc-sky">
              <p className="cc-sky-help">Every round's stardust lights the next star. Tap a finished constellation to learn about it.</p>
              <ul>
                {CONSTELLATIONS.map((c, i) => {
                  const done = sky.done.includes(c.id);
                  const now = !done && i === sky.index;
                  return (
                    <li key={c.id}>
                      <button type="button" className={`cc-card${done ? ' done' : now ? ' now' : ' locked'}`} disabled={!done} onClick={() => setShowFact(c)}>
                        <ConstellationArt c={c} lit={done ? 99 : now ? sky.lit : 0} size={84} />
                        <b>{done || now ? c.name : '???'}</b>
                        <small>{done ? c.nick : now ? `${sky.lit} / ${c.stars.length} stars` : 'Still dark'}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </main>
          )}
        </div>
      )}

      {showFact && (
        <div className="cc-fact-back" onClick={() => setShowFact(null)}>
          <div className="cc-fact" onClick={e => e.stopPropagation()}>
            <ConstellationArt c={showFact} lit={99} size={180} />
            <h3>{showFact.name}</h3>
            <small>{showFact.nick}</small>
            <p>{showFact.fact}</p>
            <button type="button" className="cc-btn primary" onClick={() => setShowFact(null)}>Cool!</button>
          </div>
        </div>
      )}

      <LevelUpBanner level={xpGame.levelUp} onClose={xpGame.dismissLevelUp} />
    </div>,
    document.body,
  );
}
