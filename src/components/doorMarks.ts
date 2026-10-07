import type { DoorCheck, DoorMark, DoorRound, DoorStatus } from '../api/dashboard.ts';

/**
 * The walk has to work with no signal: every mark is applied to the round on
 * the phone at once and queued, and the queue is sent when a connection
 * comes back. These are the pure parts — no network, no storage.
 */

export const STATUS_LABEL: Record<DoorStatus, string> = {
  todo: 'To check', safe: 'Safe', no_answer: 'No answer', needs_help: 'Needs help', skipped: 'Skipped',
};

/** The same house however it was typed: "148 Rushing Water Lane" = "148 RUSHING WATER LN". */
export function houseKey(address: string): string {
  const words: Record<string, string> = { street: 'st', road: 'rd', lane: 'ln', drive: 'dr', avenue: 'ave', court: 'ct', circle: 'cir', trail: 'trl', boulevard: 'blvd', place: 'pl', highway: 'hwy', parkway: 'pkwy', terrace: 'ter', north: 'n', south: 's', east: 'e', west: 'w' };
  return address.split(/,|\n/)[0].toLowerCase().replace(/[.#]/g, ' ').split(/\s+/).filter(Boolean).map(w => words[w] || w).join(' ');
}

/** The round with these marks laid over it; the latest mark for a house wins. */
export function withMarks(round: DoorRound, marks: DoorMark[]): DoorRound {
  if (!marks.length) return round;
  const latest = new Map<string, DoorMark>();
  for (const m of marks) {
    const k = houseKey(m.address);
    const held = latest.get(k);
    if (!held || Date.parse(m.at) >= Date.parse(held.at)) latest.set(k, m);
  }
  const doors = round.doors.map((d): DoorCheck => {
    const m = latest.get(houseKey(d.address));
    return m ? { ...d, status: m.status, note: m.note, checkedAt: m.status === 'todo' ? null : m.at } : d;
  });
  return { ...round, doors };
}

export interface RoundProgress { total: number; checked: number; needsHelp: DoorCheck[]; left: number }

export function progress(round: DoorRound): RoundProgress {
  const checked = round.doors.filter(d => d.status !== 'todo').length;
  return { total: round.doors.length, checked, needsHelp: round.doors.filter(d => d.status === 'needs_help'), left: round.doors.length - checked };
}

/** What to keep queued after `sent` marks were delivered: anything newer than, or not among, them. */
export function afterSend(queue: DoorMark[], sent: DoorMark[]): DoorMark[] {
  const gone = new Set(sent.map(m => `${houseKey(m.address)}|${m.at}|${m.status}`));
  return queue.filter(m => !gone.has(`${houseKey(m.address)}|${m.at}|${m.status}`));
}
