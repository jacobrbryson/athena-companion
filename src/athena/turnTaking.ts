/**
 * When has the person finished talking? (conversation mode, useConversation)
 *
 * The browser's recognizer already waits for a pause before it finalises
 * words. This adds a look at the words themselves: a turn that ends "…and",
 * "um" or on a comma is very likely not over, so it waits longer for the rest
 * than one that ends like a sentence.
 */

/** After the recognizer finalises: how much longer to wait for more. */
export const END_WAIT_MS = 300;
export const UNFINISHED_WAIT_MS = 1600;

// A turn ending on one of these is very likely not over.
const TRAILING = new Set([
  'and', 'but', 'or', 'so', 'because', 'cause', 'um', 'uh', 'er', 'erm', 'hmm', 'like', 'the', 'a', 'an',
  'to', 'of', 'with', 'for', 'if', 'then', 'about', 'my', 'your', 'our', 'is', 'was', 'are', 'what', 'that',
  'i', 'we', 'when', 'where', 'which', 'in', 'on', 'at', 'from', 'maybe', 'actually',
]);

export function turnWaitMs(text: string): number {
  const t = text.trim().toLowerCase();
  if (!t) return END_WAIT_MS;
  if (/[,;:\-–—]$/.test(t)) return UNFINISHED_WAIT_MS;
  const last = t.replace(/[^a-z'\s]/g, ' ').trim().split(/\s+/).pop() ?? '';
  return TRAILING.has(last) ? UNFINISHED_WAIT_MS : END_WAIT_MS;
}
