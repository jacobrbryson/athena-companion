/**
 * Comet Catchers (owner, 11-25: "design a third mini-game … something we can
 * play together and don't want to put down"). The tablet lies flat between
 * two players. Each guards one long edge with a glowing catcher: blue at the
 * bottom, gold at the top. Comets cross the sky; a comet's colour says who must
 * catch it, but it often heads for the other player, who bounces it across —
 * a caught pass is a Relay, worth the most. White comets are anyone's.
 *
 * This is the whole simulation, with no DOM, clock or randomness of its own:
 * `step` advances the world by `dt` seconds with the `rand` it's given and
 * returns what happened, so the screen can draw and play it and the rules can
 * be tested (scripts/comet.test.mjs). World units: WIDTH × HEIGHT, y down.
 *
 * What keeps it going (from the research, without the dark patterns): short
 * rounds, a rising combo, rare golden and twin comets and meteor showers,
 * near-misses, a pace that eases off after a miss, and a shared shield bar —
 * nothing to buy, no streaks to keep, and a round always ends.
 */

export const WIDTH = 1000;
export const HEIGHT = 600;
export const CATCH_Y = { bottom: HEIGHT - 46, top: 46 } as const;
export type Side = 'bottom' | 'top';
export type Kind = 'blue' | 'gold' | 'white' | 'golden';

export interface Comet {
  id: number;
  x: number; y: number; vx: number; vy: number;
  kind: Kind;
  r: number;
  /** Bounced by the player it wasn't for: catching it now is a Relay. */
  passed: boolean;
  /** Recent positions, for the tail. */
  trail: { x: number; y: number }[];
}

export interface Catcher { side: Side; x: number; w: number; target: number }

export interface Features {
  golden: boolean;
  twins: boolean;
  showers: boolean;
  /** 1 = the gentle start; higher is faster. */
  pace: number;
}

export interface World {
  t: number;
  comets: Comet[];
  catchers: Record<Side, Catcher>;
  shields: number;
  maxShields: number;
  stardust: number;
  combo: number;
  best: number;
  catches: number;
  relays: number;
  spawnIn: number;
  /** After a miss, a short breather with nothing new. */
  calmUntil: number;
  showerUntil: number;
  nextShowerAt: number;
  over: boolean;
  nextId: number;
  features: Features;
}

export type GameEvent =
  | { type: 'catch'; side: Side; kind: Kind; x: number; y: number; points: number; relay: boolean; combo: number }
  | { type: 'pass'; side: Side; x: number; y: number }
  | { type: 'miss'; side: Side; x: number; kind: Kind }
  | { type: 'close'; side: Side; x: number }
  | { type: 'twin'; x: number; y: number }
  | { type: 'shower' }
  | { type: 'shield'; shields: number }
  | { type: 'over' };

const CATCHER_W = 150;
const CATCHER_SPEED = 2600;
const START_SHIELDS = 3;
const MAX_SHIELDS = 5;
const SHIELD_EVERY = 20;
const CALM_S = 1.6;
const SHOWER_S = 6;
const NEAR_MISS = 34;

export function featuresFor(level: number): Features {
  return { golden: level >= 2, twins: level >= 3, showers: level >= 4, pace: 1 + Math.max(0, level - 5) * 0.06 };
}

export function newWorld(features: Features, wide = false): World {
  const w = wide ? CATCHER_W * 1.35 : CATCHER_W;
  return {
    t: 0, comets: [],
    catchers: {
      bottom: { side: 'bottom', x: WIDTH / 2, w, target: WIDTH / 2 },
      top: { side: 'top', x: WIDTH / 2, w, target: WIDTH / 2 },
    },
    shields: START_SHIELDS, maxShields: MAX_SHIELDS,
    stardust: 0, combo: 0, best: 0, catches: 0, relays: 0,
    spawnIn: 1.2, calmUntil: 0, showerUntil: 0, nextShowerAt: 40,
    over: false, nextId: 1, features,
  };
}

/** Comet speed and spacing for this moment: faster as the round goes on. */
export function tempo(w: World) {
  const ramp = Math.min(1.9, 1 + w.t / 90) * w.features.pace;
  return { speed: 170 * ramp, gap: Math.max(0.55, 1.5 / ramp) };
}

/** Whose comet it is: bottom catches blue, top catches gold, white and golden are anyone's. */
export const owner = (k: Kind): Side | null => (k === 'blue' ? 'bottom' : k === 'gold' ? 'top' : null);

/** Multiplier from the combo: ×1, then +1 every 5 in a row, up to ×5. */
export const multiplier = (combo: number) => Math.min(5, 1 + Math.floor(combo / 5));

function spawn(w: World, rand: () => number, kind?: Kind, heading?: Side, at?: { x: number; y: number }): Comet {
  const { speed } = tempo(w);
  const fromLeft = at ? rand() < 0.5 : rand() < 0.5;
  const side: Side = heading || (rand() < 0.5 ? 'bottom' : 'top');
  let k: Kind = kind || 'white';
  if (!kind) {
    const roll = rand();
    if (w.showerUntil > w.t) k = 'white';
    else if (w.features.golden && roll < 0.05) k = 'golden';
    else if (roll < 0.45) k = 'blue';
    else if (roll < 0.9) k = 'gold';
    else k = 'white';
  }
  const x = at ? at.x : fromLeft ? -20 : WIDTH + 20;
  const y = at ? at.y : HEIGHT * (0.3 + rand() * 0.4);
  // Aim at a point on the target edge, somewhere a catcher can reach.
  const aimX = 120 + rand() * (WIDTH - 240);
  const aimY = CATCH_Y[side];
  const fast = k === 'golden' ? 1.25 : 1;
  const dx = aimX - x; const dy = aimY - y;
  const len = Math.hypot(dx, dy) || 1;
  const v = speed * fast * (0.85 + rand() * 0.3);
  const c: Comet = { id: w.nextId++, x, y, vx: (dx / len) * v, vy: (dy / len) * v, kind: k, r: k === 'golden' ? 15 : 12, passed: false, trail: [] };
  w.comets.push(c);
  return c;
}

/** One frame. `targets` are where each player's finger is (x), or undefined to stay put. */
export function step(w: World, dt: number, rand: () => number, targets: Partial<Record<Side, number>> = {}): GameEvent[] {
  const ev: GameEvent[] = [];
  if (w.over) return ev;
  const d = Math.min(dt, 0.05);
  w.t += d;

  // Catchers glide to the finger quickly but not instantly.
  for (const side of ['bottom', 'top'] as Side[]) {
    const c = w.catchers[side];
    if (targets[side] !== undefined) c.target = Math.max(c.w / 2, Math.min(WIDTH - c.w / 2, targets[side]!));
    const move = c.target - c.x;
    const max = CATCHER_SPEED * d;
    c.x += Math.abs(move) <= max ? move : Math.sign(move) * max;
  }

  // Meteor showers: a burst of easy white comets.
  if (w.features.showers && w.t >= w.nextShowerAt && w.showerUntil < w.t) {
    w.showerUntil = w.t + SHOWER_S;
    w.nextShowerAt = w.t + SHOWER_S + 35 + rand() * 25;
    ev.push({ type: 'shower' });
  }

  // New comets.
  w.spawnIn -= d;
  if (w.spawnIn <= 0 && w.t >= w.calmUntil) {
    const showering = w.showerUntil > w.t;
    const { gap } = tempo(w);
    w.spawnIn = showering ? gap * 0.35 : gap * (0.75 + rand() * 0.5);
    if (w.features.twins && !showering && rand() < 0.07) {
      // A twin: one comet that splits in the middle, half for each player.
      const c = spawn(w, rand, 'white');
      c.vx = Math.sign(c.vx || 1) * Math.hypot(c.vx, c.vy); c.vy = 0; c.y = HEIGHT / 2; c.r = 14;
      (c as Comet & { twin?: boolean }).twin = true;
    } else spawn(w, rand);
  }

  const keep: Comet[] = [];
  for (const c of w.comets) {
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 12) c.trail.shift();
    c.x += c.vx * d;
    c.y += c.vy * d;

    // The twin splits once it reaches the middle.
    const twin = c as Comet & { twin?: boolean };
    if (twin.twin && Math.abs(c.x - WIDTH / 2) < 30) {
      ev.push({ type: 'twin', x: c.x, y: c.y });
      spawn(w, rand, 'blue', 'bottom', { x: c.x, y: c.y });
      spawn(w, rand, 'gold', 'top', { x: c.x, y: c.y });
      continue;
    }

    const side: Side | null = c.vy > 0 && c.y >= CATCH_Y.bottom ? 'bottom' : c.vy < 0 && c.y <= CATCH_Y.top ? 'top' : null;
    if (side) {
      const cat = w.catchers[side];
      const gap = Math.abs(c.x - cat.x) - cat.w / 2;
      if (gap <= c.r) {
        const mine = owner(c.kind);
        if (mine && mine !== side) {
          // Not yours: bounce it across to your partner.
          c.vy = -c.vy * 1.04;
          c.vx += (c.x - cat.x) * 0.9;
          c.y = CATCH_Y[side] + (side === 'bottom' ? -1 : 1);
          c.passed = true;
          ev.push({ type: 'pass', side, x: c.x, y: c.y });
          keep.push(c);
          continue;
        }
        w.combo += 1;
        w.best = Math.max(w.best, w.combo);
        w.catches += 1;
        const relay = c.passed;
        if (relay) w.relays += 1;
        const base = c.kind === 'golden' ? 5 : 1;
        const points = (base + (relay ? 2 : 0)) * multiplier(w.combo);
        w.stardust += points;
        ev.push({ type: 'catch', side, kind: c.kind, x: c.x, y: c.y, points, relay, combo: w.combo });
        if (w.catches % SHIELD_EVERY === 0 && w.shields < w.maxShields) { w.shields += 1; ev.push({ type: 'shield', shields: w.shields }); }
        continue;
      }
      if (gap <= c.r + NEAR_MISS) ev.push({ type: 'close', side, x: c.x });
      // Past the line and missed: it's gone.
      w.combo = 0;
      w.shields -= 1;
      w.calmUntil = w.t + CALM_S;
      ev.push({ type: 'miss', side, x: c.x, kind: c.kind });
      if (w.shields <= 0) { w.over = true; ev.push({ type: 'over' }); }
      continue;
    }
    // Comets that drift off the sides wrap their heading back in.
    if (c.x < -60 && c.vx < 0) c.vx = -c.vx;
    if (c.x > WIDTH + 60 && c.vx > 0) c.vx = -c.vx;
    keep.push(c);
  }
  w.comets = keep;
  if (w.over) w.comets = [];
  return ev;
}

/**
 * Athena's catcher, for playing alone: she heads for the comet that will reach
 * her edge first, after a short reaction delay and with a little wobble, so
 * she catches most and misses a few — the kid is always the one who matters.
 */
export function athenaTarget(w: World, side: Side, skill = 0.86): number | undefined {
  const y = CATCH_Y[side];
  let best: { at: number; x: number; id: number } | null = null;
  for (const c of w.comets) {
    const toward = side === 'top' ? c.vy < 0 : c.vy > 0;
    if (!toward) continue;
    const at = (y - c.y) / c.vy;
    if (at < 0) continue;
    // She reacts to what she saw a moment ago.
    if (at > 3) continue;
    const x = c.x + c.vx * at;
    if (!best || at < best.at) best = { at, x, id: c.id };
  }
  if (!best) return undefined;
  // Her error is fixed per comet (not per frame), so she misjudges a few cleanly
  // instead of shaking.
  const jitter = ((best.id * 9301 + 49297) % 233280) / 233280 - 0.5;
  const wobble = (1 - skill) * 1400 * jitter;
  return best.x + wobble;
}
