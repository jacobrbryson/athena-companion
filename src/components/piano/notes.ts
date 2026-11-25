/**
 * Piano Quest (owner, 11-25): the kids' offline game for learning to read
 * piano sheet music. Everything here is pure — notes, where they sit on the
 * staff, which notes each level unlocks, and the songs — so it is tested in
 * scripts/piano.test.mjs. Nothing touches the network; sound is synthesized.
 *
 * Notes are scientific pitch names, white keys only ("C4" is middle C).
 */

export type Clef = 'treble' | 'bass';
export interface StaffNote { clef: Clef; note: string }

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = typeof LETTERS[number];

export const letterOf = (note: string) => note[0] as Letter;
export const octaveOf = (note: string) => Number(note.slice(1));

/** Diatonic step count from C0: C4 = 28, D4 = 29 … */
export function step(note: string): number {
  return octaveOf(note) * 7 + LETTERS.indexOf(letterOf(note));
}
export function fromStep(n: number): string {
  return `${LETTERS[((n % 7) + 7) % 7]}${Math.floor(n / 7)}`;
}

/** The note on each clef's bottom line. */
const BOTTOM_LINE: Record<Clef, string> = { treble: 'E4', bass: 'G2' };

/**
 * Where a note sits: 0 is the bottom line, 1 the space above it, 8 the top
 * line. Negative is below the staff, above 8 is above it.
 */
export const staffPos = (n: StaffNote) => step(n.note) - step(BOTTOM_LINE[n.clef]);
export const onLine = (n: StaffNote) => staffPos(n) % 2 === 0;

/** The ledger lines a note needs, as staff positions (all even). */
export function ledgers(n: StaffNote): number[] {
  const p = staffPos(n);
  const out: number[] = [];
  for (let q = -2; q >= p; q -= 2) out.push(q);
  for (let q = 10; q <= p; q += 2) out.push(q);
  return out;
}

/** Frequency of a white-key note, equal temperament, A4 = 440. */
const SEMI: Record<Letter, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
export function freq(note: string): number {
  const semis = SEMI[letterOf(note)] + (octaveOf(note) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

/** The memory sentences for lines and spaces, shown as a tip after a miss. */
export function mnemonic(n: StaffNote): string | null {
  const p = staffPos(n);
  if (p < 0 || p > 8) return n.note === 'C4' ? 'Middle C sits on its own little line between the two staffs.' : null;
  if (n.clef === 'treble') return p % 2 === 0 ? 'Treble lines, bottom to top: Every Good Boy Does Fine (E G B D F).' : 'Treble spaces spell FACE, bottom to top.';
  return p % 2 === 0 ? 'Bass lines, bottom to top: Good Boys Do Fine Always (G B D F A).' : 'Bass spaces, bottom to top: All Cows Eat Grass (A C E G).';
}

const span = (clef: Clef, from: string, to: string): StaffNote[] => {
  const out: StaffNote[] = [];
  for (let s = step(from); s <= step(to); s += 1) out.push({ clef, note: fromStep(s) });
  return out;
};

/**
 * The notes a kid reads at each level. New notes come a few at a time, then
 * the bass clef, then both mixed.
 */
export function levelNotes(level: number): StaffNote[] {
  if (level <= 1) return span('treble', 'C4', 'E4');
  if (level === 2) return span('treble', 'C4', 'G4');
  if (level <= 4) return span('treble', 'C4', 'C5');
  if (level === 5) return span('treble', 'C4', 'G5');
  if (level === 6) return span('bass', 'C3', 'C4');
  if (level === 7) return span('bass', 'G2', 'C4');
  return [...span('treble', 'C4', 'G5'), ...span('bass', 'G2', 'B3')];
}

/** Letters on the keys until level 4; after that they're a choice that halves XP. */
export const labelsByDefault = (level: number) => level < 4;
/** From level 9 a quick answer earns a speed bonus. */
export const speedBonusFrom = 9;
export const SPEED_MS = 3000;

export const noteKey = (n: StaffNote) => `${n.clef}:${n.note}`;

/**
 * A round of notes: `count` notes from the level, the ones a kid has seen least
 * (or never) coming up more, and never the same note twice in a row.
 */
export function pickRound(pool: StaffNote[], count: number, fresh: Set<string>, rand: () => number = Math.random): StaffNote[] {
  const out: StaffNote[] = [];
  for (let i = 0; i < count; i += 1) {
    const choices = pool.filter(n => !out.length || noteKey(n) !== noteKey(out[out.length - 1]));
    const weighted = choices.flatMap(n => (fresh.has(noteKey(n)) ? [n, n, n] : [n]));
    out.push(weighted[Math.floor(rand() * weighted.length)] || pool[0]);
  }
  return out;
}

/** The keyboard for a set of notes: whole octaves, C to B, covering all of them. */
export function keyboardRange(pool: StaffNote[]): string[] {
  const steps = pool.map(n => step(n.note));
  const lo = Math.floor(Math.min(...steps) / 7) * 7;
  const hi = Math.floor(Math.max(...steps) / 7) * 7 + 6;
  const out: string[] = [];
  for (let s = lo; s <= hi; s += 1) out.push(fromStep(s));
  return out;
}

export interface Song { id: string; title: string; clef: Clef; notes: [string, number][] }

const tune = (s: string): [string, number][] =>
  s.trim().split(/\s+/).map(t => { const [n, b] = t.split(':'); return [n, Number(b || 1)]; });

/** Old public-domain tunes, white keys only, with beats for the playback. */
export const SONGS: Song[] = [
  { id: 'hot-cross-buns', title: 'Hot Cross Buns', clef: 'treble', notes: tune('E4 D4 C4:2 E4 D4 C4:2 C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 E4 D4 C4:2') },
  { id: 'mary', title: 'Mary Had a Little Lamb', clef: 'treble', notes: tune('E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4') },
  { id: 'ode-to-joy', title: 'Ode to Joy', clef: 'treble', notes: tune('E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2') },
  { id: 'jingle-bells', title: 'Jingle Bells', clef: 'treble', notes: tune('E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2') },
  { id: 'twinkle', title: 'Twinkle Twinkle Little Star', clef: 'treble', notes: tune('C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2') },
  { id: 'london-bridge', title: 'London Bridge', clef: 'treble', notes: tune('G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:2') },
  { id: 'saints', title: 'When the Saints Go Marching In', clef: 'treble', notes: tune('C4 E4 F4 G4:4 C4 E4 F4 G4:4 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4') },
  { id: 'row-boat', title: 'Row, Row, Row Your Boat', clef: 'treble', notes: tune('C4:1.5 C4:1.5 C4 D4:.5 E4:1.5 E4 D4:.5 E4 F4:.5 G4:3 C5:.5 C5:.5 C5:.5 G4:.5 G4:.5 G4:.5 E4:.5 E4:.5 E4:.5 C4:.5 C4:.5 C4:.5 G4 F4:.5 E4 D4:.5 C4:3') },
  { id: 'bass-ode', title: 'Ode to Joy (low)', clef: 'bass', notes: tune('E3 E3 F3 G3 G3 F3 E3 D3 C3 C3 D3 E3 E3:1.5 D3:.5 D3:2') },
  { id: 'bass-mary', title: 'Mary Had a Little Lamb (low)', clef: 'bass', notes: tune('E3 D3 C3 D3 E3 E3 E3:2 D3 D3 D3:2 E3 G3 G3:2') },
];

/** Songs whose every note the kid can read at this level, in the clef they're written in. */
export function songsFor(level: number): Song[] {
  const known = new Set(levelNotes(level).map(noteKey));
  const everKnown = new Set<string>();
  for (let l = 1; l <= level; l += 1) levelNotes(l).forEach(n => everKnown.add(noteKey(n)));
  return SONGS.filter(s => s.notes.every(([n]) => everKnown.has(`${s.clef}:${n}`) || known.has(`${s.clef}:${n}`)));
}
