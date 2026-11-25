/**
 * Real International Morse code for the Signal Relay game (owner, 11-24),
 * plus a keyer that reads one telegraph key the way an operator would: a
 * press is a dot or a dash by its length, and silence ends a letter.
 *
 * Kids don't key at 20 words a minute, so the timing learns each one: the
 * dot length starts slow and follows their own presses, and the letter gap
 * is long enough that a kid can glance at the code book mid-letter. Every
 * number here is a pure function of the presses so far, tested in
 * scripts/morse.test.mjs. Nothing here touches the network.
 */

export type Sym = '.' | '-';

export const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
};

const FROM_MORSE: Record<string, string> = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/** The letter a pattern spells, or null when it spells nothing. */
export const decode = (pattern: string): string | null => FROM_MORSE[pattern] ?? null;

/** A word as one pattern per letter. Unknown characters are dropped. */
export const encode = (word: string): string[] =>
  word.toUpperCase().split('').map(c => MORSE[c]).filter((p): p is string => Boolean(p));

/** A kid's first dot, before any press has taught us their speed (~7 wpm). */
export const START_DOT_MS = 170;
const MIN_DOT_MS = 70;
const MAX_DOT_MS = 380;
/** Shorter than this is a bounce or a brush, not a press. */
export const BOUNCE_MS = 22;

/** Dot if shorter than two dot-lengths (the midpoint of 1 and 3 units). */
export const classify = (pressMs: number, dotMs: number): Sym => (pressMs < dotMs * 2 ? '.' : '-');

/** Follows the kid's own rhythm: each press nudges the dot length a fifth of the way. */
export function adapt(dotMs: number, pressMs: number, sym: Sym): number {
  const unit = sym === '.' ? pressMs : pressMs / 3;
  const next = dotMs * 0.8 + unit * 0.2;
  return Math.min(MAX_DOT_MS, Math.max(MIN_DOT_MS, next));
}

/**
 * How long a silence ends a letter, and a word. Real Morse is 3 and 7 units;
 * a kid needs longer, so these never drop below a floor.
 */
export const letterGapMs = (dotMs: number) => Math.max(750, dotMs * 4.5);
export const wordGapMs = (dotMs: number) => Math.max(1900, dotMs * 10);
/** When the letter already matches what was asked, a short pause is enough to take it. */
export const settleMs = (dotMs: number) => Math.max(320, dotMs * 2.2);

/** Roughly how fast they're keying, in words per minute (PARIS = 50 units). */
export const wpm = (dotMs: number) => Math.round(1200 / dotMs);

export type LetterCheck = 'match' | 'prefix' | 'wrong';
/** How the symbols so far compare with the letter being sent. */
export function check(sent: string, target: string): LetterCheck {
  if (sent === target) return 'match';
  if (target.startsWith(sent)) return 'prefix';
  return 'wrong';
}

/**
 * The words a relay asks for, by length. Which tiers a run draws from grows
 * with the kid's relay level (runPlan), so the game gets longer and harder as
 * they climb instead of repeating the same five messages (owner, 11-25).
 */
export const TIERS: string[][] = [
  ['HI', 'GO', 'ME', 'WE', 'IT', 'AT', 'ON'],
  ['SOS', 'CAR', 'SUN', 'MAP', 'FUN', 'SKY', 'ZOO', 'DOG', 'CAT', 'YES'],
  ['BUS', 'OWL', 'BEE', 'HAT', 'TOY', 'FOX', 'KEY', 'JAM'],
  ['ROAD', 'TRIP', 'HOME', 'STAR', 'MOON', 'TREE', 'HERO', 'BEAM', 'FAST'],
  ['BRAVE', 'LIGHT', 'RADIO', 'SPACE', 'ROBOT', 'TIGER', 'CLOUD', 'TRAIN', 'MAGIC', 'QUEST'],
  ['ROCKET', 'PLANET', 'SIGNAL', 'BRIDGE', 'JUNGLE', 'DRAGON', 'WIZARD', 'GALAXY'],
];
export const FINAL_MESSAGE = 'ATHENA';

/** Words Athena blinks to the kid in an Incoming round, short to longer. */
export const INCOMING: string[][] = [
  ['HI', 'GO', 'SOS', 'SUN', 'CAT', 'DOG', 'YES', 'FUN', 'ZOO', 'OWL'],
  ['STAR', 'MOON', 'HOME', 'TREE', 'HERO', 'FAST', 'ROAD'],
];

export interface RunPlan {
  /** Which TIERS each sent message comes from, in order. */
  tiers: number[];
  /** An Incoming round (Athena sends, the kid decodes) before her name, or null. */
  incoming: number | null;
}

/** What a run looks like at each relay level (see RELAY_UNLOCKS in RelayGame). */
export function runPlan(level: number): RunPlan {
  if (level <= 1) return { tiers: [0, 1], incoming: null };
  if (level === 2) return { tiers: [0, 1, 2], incoming: null };
  if (level === 3) return { tiers: [0, 1, 2], incoming: 0 };
  if (level === 4) return { tiers: [1, 2, 3], incoming: 0 };
  if (level <= 6) return { tiers: [1, 2, 3, 4], incoming: level === 6 ? 1 : 0 };
  if (level <= 8) return { tiers: [2, 3, 4, 5], incoming: 1 };
  return { tiers: [3, 4, 4, 5], incoming: 1 };
}

const pick = (list: string[], taken: string[], rand: () => number) => {
  const left = list.filter(w => !taken.includes(w));
  return left[Math.floor(rand() * left.length)] || list[0];
};

/** One run's messages for a level: a different word from each planned tier, then her name. */
export function pickMessages(level = 1, rand: () => number = Math.random): string[] {
  const out: string[] = [];
  for (const t of runPlan(level).tiers) out.push(pick(TIERS[t], out, rand));
  return [...out, FINAL_MESSAGE];
}

/** The word for this run's Incoming round, or null when the level has none. */
export function pickIncoming(level: number, rand: () => number = Math.random): string | null {
  const tier = runPlan(level).incoming;
  return tier === null ? null : pick(INCOMING[tier], [], rand);
}

/**
 * Four letters to choose from while decoding one: the right one and three
 * others, preferring letters whose code looks alike (same length) so it takes
 * real reading, in a shuffled order.
 */
export function choicesFor(letter: string, rand: () => number = Math.random): string[] {
  const letters = Object.keys(MORSE).filter(c => /[A-Z]/.test(c) && c !== letter);
  const len = MORSE[letter]?.length ?? 0;
  const alike = letters.filter(c => MORSE[c].length === len);
  const pool = [...alike, ...letters.filter(c => !alike.includes(c))];
  const others: string[] = [];
  while (others.length < 3 && pool.length) {
    // Mostly look-alikes, but not always the same three.
    const from = others.length < 2 && alike.some(c => !others.includes(c)) ? alike.filter(c => !others.includes(c)) : pool.filter(c => !others.includes(c));
    others.push(from[Math.floor(rand() * from.length)]);
  }
  const all = [letter, ...others];
  for (let i = all.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}
