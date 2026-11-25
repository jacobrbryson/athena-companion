import { api } from './client';
import type { IspyClue, IspyGame, IspyRound } from './kid';

/**
 * A parent's practice I Spy (owner, 11-24): the kids' tablet screen, played
 * from Companion → Guardians. The game lives in this browser tab and is gone
 * when it closes. core_api only looks at the photo with the same prompts and
 * model the kids get (/guardian-missions/ispy-demo/*), and stores nothing, so
 * no round, photo or test lands on the real mission.
 *
 * Rules copied from core_api's ispy.js so the practice feels the same: turns
 * alternate, Athena gets three guesses on your round, her hints show one per
 * three misses on hers, and a guess is graded by core_api's code. Clue cards
 * work the same too: after a miss on your round Athena asks for one before she
 * guesses again, and on hers you can ask her for one (/ispy-demo/clue).
 */
export type IspyApi = {
  retry?: (uuid: string) => Promise<{ game: IspyGame }>;
  state: () => Promise<{ game: IspyGame | null }>;
  spy: (image: string, contentType: string, clue: string, answer: string) => Promise<{ game: IspyGame }>;
  athena: (image: string, contentType: string) => Promise<{ game: IspyGame }>;
  judge: (uuid: string, right: boolean, hint?: string) => Promise<{ game: IspyGame }>;
  guess: (uuid: string, guess: string) => Promise<{ right: boolean | null; game: IspyGame }>;
  reveal: (uuid: string) => Promise<{ game: IspyGame }>;
  giveClue: (uuid: string, key: string) => Promise<{ game: IspyGame }>;
  askClue: (uuid: string) => Promise<{ game: IspyGame }>;
  photo: (uuid: string) => Promise<Blob>;
};

const BASE = '/api/v1/guardian-missions/ispy-demo';
const ATHENA_TRIES = 3;
const HINT_EVERY = 3;
/** Copied from core_api ispy.js CLUES; core_api ignores any key not on its own list. */
export const ISPY_CLUES: IspyClue[] = [
  { key: 'car', label: 'In the car' }, { key: 'outside', label: 'Outside' }, { key: 'kitchen', label: 'In the kitchen' },
  { key: 'living_room', label: 'In the living room' }, { key: 'bedroom', label: 'In a bedroom' }, { key: 'floor', label: 'On the floor' },
  { key: 'wall', label: 'On a wall' }, { key: 'table', label: 'On a table' }, { key: 'up_high', label: 'Up high' },
  { key: 'down_low', label: 'Down low' }, { key: 'eat', label: 'You can eat it' }, { key: 'wear', label: 'You can wear it' },
  { key: 'play', label: 'You can play with it' }, { key: 'soft', label: "It's soft" }, { key: 'hard', label: "It's hard" },
  { key: 'wood', label: 'Made of wood' }, { key: 'metal', label: 'Made of metal' }, { key: 'plastic', label: 'Made of plastic' },
  { key: 'alive', label: "It's alive" }, { key: 'sound', label: 'It makes a sound' },
];
const labelOf = (key: string) => ISPY_CLUES.find(c => c.key === key)?.label || 'None';

type Round = {
  uuid: string; roundNo: number; athenaSpies: boolean;
  clue: string; answer: string; aliases: string[]; hints: string[];
  guesses: { athena: boolean; text: string; right: boolean | null }[];
  clues: { key: string; athena: boolean }[]; clueAsked: boolean;
  outcome: IspyRound['outcome']; photo: Blob;
};

function toBlob(base64: string, type: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function makeIspyDemo({ title, goal = 4 }: { title: string; goal?: number }): IspyApi {
  const rounds: Round[] = [];
  let n = 0;
  const done = () => rounds.filter(r => r.outcome).length;
  const open = () => rounds.find(r => !r.outcome) || null;
  // You spy first, then Athena, the way the kids alternate with her.
  const athenaTurn = () => rounds.length % 2 === 1;
  const you = { name: 'You', athena: false, me: true };
  const her = { name: 'Athena', athena: true, me: false };

  function shape(r: Round): IspyRound {
    const misses = r.guesses.filter(g => !g.right).length;
    return {
      uuid: r.uuid, roundNo: r.roundNo,
      spy: r.athenaSpies ? her : you,
      clue: r.clue, photo: true,
      guesses: r.guesses.map(g => ({ by: g.athena ? 'Athena' : 'You', athena: g.athena, text: g.text, right: g.right })),
      hints: r.athenaSpies ? r.hints.slice(0, Math.floor(misses / HINT_EVERY)) : r.hints,
      clues: r.clues.map(c => ({ key: c.key, label: labelOf(c.key), by: c.athena ? 'Athena' : 'You', athena: c.athena })),
      clueAsked: !r.outcome && !r.athenaSpies && r.clueAsked,
      cluesLeft: r.outcome || (r.athenaSpies && r.clues.some(c => c.key === 'none')) ? 0 : left(r).length,
      answer: !r.outcome && r.athenaSpies ? null : r.answer,
      outcome: r.outcome,
      solvedBy: r.outcome === 'guessed' ? (r.athenaSpies ? 'You' : 'Athena') : null,
      awaitingJudge: !r.outcome && !r.athenaSpies && !r.clueAsked && r.guesses.length > 0 && r.guesses[r.guesses.length - 1].right == null,
    };
  }
  function game(): IspyGame {
    const o = open();
    return {
      mission: { uuid: 'practice', title: `${title} (practice)` },
      goal, done: done(), clueList: ISPY_CLUES,
      players: [you, her],
      // The open round's spy, else whoever spies next: the same as core_api.
      turn: (o ? o.athenaSpies : athenaTurn()) ? her : you,
      round: o ? shape(o) : null,
      recent: rounds.filter(r => r.outcome).slice(-4).reverse().map(shape),
    };
  }
  const find = (uuid: string) => {
    const r = rounds.find(x => x.uuid === uuid && !x.outcome);
    if (!r) throw new Error('That round is over.');
    return r;
  };
  const left = (r: Round) => ISPY_CLUES.filter(c => !r.clues.some(g => g.key === c.key));
  const ready = () => {
    if (open()) throw new Error('Finish this round first.');
    if (done() >= goal) throw new Error('That was every practice round.');
  };
  async function athenaGuess(r: Round) {
    const image = await blobBase64(r.photo);
    const { guess } = await api.post<{ guess: string }>(`${BASE}/guess`, {
      image, contentType: r.photo.type, clue: r.clue, hints: r.hints, clues: r.clues.map(c => c.key),
      wrong: r.guesses.filter(g => g.right === false).map(g => g.text),
    });
    r.guesses.push({ athena: true, text: guess, right: null });
  }

  return {
    async state() { return { game: game() }; },
    async spy(image, contentType, clue, answer) {
      ready();
      if (athenaTurn()) throw new Error("It's Athena's turn to spy.");
      const r: Round = { uuid: `p${++n}`, roundNo: rounds.length + 1, athenaSpies: false, clue, answer, aliases: [], hints: [], guesses: [], clues: [], clueAsked: false, outcome: null, photo: toBlob(image, contentType) };
      await athenaGuess(r); // only kept once she has looked, so a failed look can be retried
      rounds.push(r);
      return { game: game() };
    },
    async judge(uuid, right, hint) {
      const r = find(uuid);
      const last = r.guesses[r.guesses.length - 1];
      if (!last || last.right != null) throw new Error("Athena hasn't guessed yet.");
      last.right = right;
      if (hint) r.hints.push(hint);
      if (right) r.outcome = 'guessed';
      else if (r.guesses.length >= ATHENA_TRIES) r.outcome = 'taught';
      else if (left(r).length) r.clueAsked = true; // she asks for a clue card first
      else {
        try { await athenaGuess(r); } catch (err) { last.right = null; throw err; }
      }
      return { game: game() };
    },
    async athena(image, contentType) {
      ready();
      if (!athenaTurn()) throw new Error("It's your turn to spy.");
      const pick = await api.post<{ clue: string; answer: string; aliases: string[]; hints: string[] }>(`${BASE}/pick`, { image, contentType });
      rounds.push({ uuid: `p${++n}`, roundNo: rounds.length + 1, athenaSpies: true, ...pick, guesses: [], clues: [], clueAsked: false, outcome: null, photo: toBlob(image, contentType) });
      return { game: game() };
    },
    async guess(uuid, text) {
      const r = find(uuid);
      const { right } = await api.post<{ right: boolean }>(`${BASE}/check`, { guess: text, answer: r.answer, aliases: r.aliases });
      r.guesses.push({ athena: false, text, right });
      if (right) r.outcome = 'guessed';
      return { right, game: game() };
    },
    async reveal(uuid) {
      find(uuid).outcome = 'revealed';
      return { game: game() };
    },
    async giveClue(uuid, key) {
      const r = find(uuid);
      if (!r.clueAsked) throw new Error("Athena hasn't asked for a clue.");
      r.clues.push({ key, athena: false });
      r.clueAsked = false;
      try { await athenaGuess(r); } catch (err) { r.clues.pop(); r.clueAsked = true; throw err; }
      return { game: game() };
    },
    async askClue(uuid) {
      const r = find(uuid);
      if (!r.athenaSpies) throw new Error('On your own round, Athena asks you for clues.');
      const image = await blobBase64(r.photo);
      const { key } = await api.post<{ key: string }>(`${BASE}/clue`, { image, contentType: r.photo.type, answer: r.answer, given: r.clues.map(c => c.key) });
      r.clues.push({ key, athena: true });
      return { game: game() };
    },
    async photo(uuid) {
      const r = rounds.find(x => x.uuid === uuid);
      if (!r) throw new Error('No photo');
      return r.photo;
    },
  };
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
