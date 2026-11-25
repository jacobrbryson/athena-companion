/**
 * Levels and XP for the kids' offline mini-games (owner, 11-25: the kids
 * played Signal Relay and "quickly got bored" — every run was the same).
 *
 * This is the games' own progression, kept on the tablet per kid and per game,
 * so it works with no network at all. It is NOT Guardian XP: a Signal Relay
 * run still earns its fixed Guardian XP through api/relay.ts, unchanged. Game
 * XP only decides what a game offers next (longer words, new notes, new
 * rounds) and gives the kids something to climb.
 *
 * Everything here is pure except `xpStore`, so it is tested in
 * scripts/gameProgress.test.mjs.
 */

export type GameId = 'relay' | 'piano' | 'comet';

export interface Level {
  level: number;
  title: string;
  /** Total XP needed to reach this level. */
  at: number;
  /** What reaching it brings, said on the level-up banner. */
  unlock?: string;
}

/**
 * The XP to reach each level. Early levels come in one or two rounds, so a
 * kid sees a level-up in their first sitting; later ones take a few sittings.
 */
export const LEVEL_XP = [0, 60, 150, 270, 420, 600, 820, 1080, 1380, 1720, 2100, 2550, 3050, 3600, 4200];

export function levels(titles: string[], unlocks: Record<number, string> = {}): Level[] {
  return LEVEL_XP.map((at, i) => ({ level: i + 1, at, title: titles[Math.min(i, titles.length - 1)], unlock: unlocks[i + 1] }));
}

export interface Standing {
  level: Level;
  next: Level | null;
  /** XP earned inside the current level, and needed to finish it. */
  into: number;
  need: number;
  /** 0–1 across the current level (1 at the top level). */
  progress: number;
}

export function standing(xp: number, table: Level[]): Standing {
  const total = Math.max(0, Math.floor(xp));
  let i = 0;
  while (i + 1 < table.length && total >= table[i + 1].at) i += 1;
  const level = table[i];
  const next = table[i + 1] || null;
  const into = total - level.at;
  const need = next ? next.at - level.at : 0;
  return { level, next, into, need, progress: next ? into / need : 1 };
}

/** The levels passed going from one total to another, oldest first. */
export function levelsGained(before: number, after: number, table: Level[]): Level[] {
  const from = standing(before, table).level.level;
  return table.filter(l => l.level > from && l.at <= after);
}

/**
 * Combo bonus: a run of right answers in a row pays a little extra at 5, 10,
 * 15… so a careful streak is worth more than rushing. Returns the bonus for
 * reaching `streak`.
 */
export const comboBonus = (streak: number) => (streak > 0 && streak % 5 === 0 ? Math.min(25, streak) : 0);

/** Per kid, per game, on this tablet. A full or blocked storage just means this visit's XP isn't kept. */
const key = (game: GameId, who: string) => `game_xp_v1:${game}:${who}`;
export const xpStore = {
  get(game: GameId, who: string): number {
    try { return Math.max(0, Number(localStorage.getItem(key(game, who))) || 0); } catch { return 0; }
  },
  set(game: GameId, who: string, xp: number) {
    try { localStorage.setItem(key(game, who), String(Math.max(0, Math.floor(xp)))); } catch { /* kept for this visit only */ }
  },
};
