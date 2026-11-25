/**
 * The sky map for Comet Catchers: stardust from every round lights up real
 * constellations one star at a time, in order. Each finished one shows its
 * shape and one true fact. There's always one partly lit, which is the
 * "one more round" pull — and finishing one is a natural place to stop.
 *
 * Shapes are simplified drawings (x, y in 0–1), not star charts. Kept on the
 * tablet per player, like the other games' progress (games/progress.ts).
 */

export interface Constellation {
  id: string;
  name: string;
  /** What it's called in plain words. */
  nick: string;
  stars: [number, number][];
  lines: [number, number][];
  fact: string;
}

export const CONSTELLATIONS: Constellation[] = [
  {
    id: 'big-dipper', name: 'The Big Dipper', nick: 'a giant ladle',
    stars: [[0.1, 0.35], [0.28, 0.3], [0.42, 0.38], [0.56, 0.48], [0.6, 0.72], [0.84, 0.75], [0.88, 0.5]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
    fact: 'The two stars at the end of the Big Dipper\'s cup point straight to Polaris, the North Star.',
  },
  {
    id: 'cassiopeia', name: 'Cassiopeia', nick: 'the queen\'s W',
    stars: [[0.08, 0.35], [0.3, 0.7], [0.5, 0.42], [0.7, 0.72], [0.92, 0.38]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
    fact: 'Cassiopeia looks like a big W (or an M, depending on the time of night) and sits across the North Star from the Big Dipper.',
  },
  {
    id: 'orion', name: 'Orion', nick: 'the hunter',
    stars: [[0.3, 0.12], [0.7, 0.15], [0.42, 0.5], [0.5, 0.52], [0.58, 0.54], [0.28, 0.88], [0.74, 0.86]],
    lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]],
    fact: 'Orion\'s belt is three bright stars in a neat row, one of the easiest patterns to find in the winter sky.',
  },
  {
    id: 'little-dipper', name: 'The Little Dipper', nick: 'the small ladle',
    stars: [[0.08, 0.2], [0.26, 0.28], [0.42, 0.38], [0.56, 0.5], [0.62, 0.76], [0.86, 0.78], [0.82, 0.52]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
    fact: 'The star at the end of the Little Dipper\'s handle is Polaris, the North Star. It stays in almost the same spot all night.',
  },
  {
    id: 'cygnus', name: 'Cygnus', nick: 'the swan',
    stars: [[0.5, 0.08], [0.5, 0.4], [0.5, 0.62], [0.5, 0.92], [0.15, 0.5], [0.85, 0.32]],
    lines: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]],
    fact: 'Cygnus the swan is also called the Northern Cross, because its brightest stars make a big cross shape.',
  },
  {
    id: 'leo', name: 'Leo', nick: 'the lion',
    stars: [[0.25, 0.2], [0.18, 0.38], [0.3, 0.55], [0.42, 0.62], [0.78, 0.58], [0.85, 0.35], [0.62, 0.38]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
    fact: 'Leo\'s brightest star is Regulus, and the lion\'s head and mane look like a backwards question mark.',
  },
  {
    id: 'lyra', name: 'Lyra', nick: 'the harp',
    stars: [[0.5, 0.12], [0.4, 0.4], [0.6, 0.42], [0.36, 0.82], [0.62, 0.84]],
    lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]],
    fact: 'Lyra is small, but it holds Vega, one of the brightest stars you can see on a summer night.',
  },
  {
    id: 'taurus', name: 'Taurus', nick: 'the bull',
    stars: [[0.1, 0.2], [0.42, 0.5], [0.55, 0.58], [0.62, 0.45], [0.9, 0.15], [0.78, 0.82], [0.86, 0.86]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]],
    fact: 'Taurus has a red-orange eye called Aldebaran and carries the Pleiades, a little cluster also called the Seven Sisters.',
  },
  {
    id: 'gemini', name: 'Gemini', nick: 'the twins',
    stars: [[0.3, 0.1], [0.62, 0.12], [0.3, 0.5], [0.62, 0.52], [0.22, 0.9], [0.7, 0.9]],
    lines: [[0, 2], [2, 4], [1, 3], [3, 5], [0, 1]],
    fact: 'The twins\' heads are two bright stars side by side, named Castor and Pollux.',
  },
  {
    id: 'canis-major', name: 'Canis Major', nick: 'the big dog',
    stars: [[0.3, 0.15], [0.42, 0.3], [0.48, 0.55], [0.25, 0.85], [0.7, 0.7], [0.82, 0.92]],
    lines: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5]],
    fact: 'Canis Major has Sirius, the Dog Star — the brightest star in the whole night sky.',
  },
  {
    id: 'scorpius', name: 'Scorpius', nick: 'the scorpion',
    stars: [[0.1, 0.25], [0.18, 0.4], [0.3, 0.45], [0.45, 0.55], [0.55, 0.75], [0.7, 0.88], [0.85, 0.82], [0.9, 0.65]],
    lines: [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
    fact: 'At the scorpion\'s heart is Antares, a huge red star. Its tail curls up like a fishhook.',
  },
  {
    id: 'pegasus', name: 'Pegasus', nick: 'the winged horse',
    stars: [[0.25, 0.3], [0.65, 0.28], [0.68, 0.7], [0.27, 0.72], [0.05, 0.55], [0.9, 0.12]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [1, 5]],
    fact: 'The middle of Pegasus is the Great Square: four stars that make a big box in the autumn sky.',
  },
];

/** Stardust needed to light one star of a constellation; later skies take a little more. */
export const starCost = (index: number) => 12 + index * 3;
export const costOf = (index: number) => CONSTELLATIONS[index].stars.length * starCost(index);

export interface SkyProgress {
  /** The constellation being lit, and how many of its stars are on. */
  index: number;
  lit: number;
  /** Stardust toward the next star. */
  into: number;
  need: number;
  done: string[];
}

/** Where a lifetime of stardust has got to on the map. Past the last one, the sky starts again brighter. */
export function skyFor(totalStardust: number): SkyProgress {
  let left = Math.max(0, Math.floor(totalStardust));
  const done: string[] = [];
  let i = 0;
  for (;;) {
    const idx = i % CONSTELLATIONS.length;
    const per = starCost(idx);
    const all = CONSTELLATIONS[idx].stars.length * per;
    if (left >= all) { left -= all; done.push(CONSTELLATIONS[idx].id); i += 1; continue; }
    return { index: idx, lit: Math.floor(left / per), into: left % per, need: per, done };
  }
}

/** Constellations finished by going from one total to another. */
export function finishedBetween(before: number, after: number): Constellation[] {
  const a = skyFor(before).done.length;
  const b = skyFor(after).done;
  return b.slice(a).map((id, n) => CONSTELLATIONS[(a + n) % CONSTELLATIONS.length]).filter(Boolean);
}
