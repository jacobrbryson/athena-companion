/**
 * Did the microphone just hear Athena herself?
 *
 * With conversation mode on, the microphone stays open while she talks, and
 * on a laptop's speakers her own voice reaches it. Transcribed, that would
 * come back as "the person's" next message (hands-free ran five turns in
 * seventy seconds that way on 2026-09-29).
 *
 * `isEcho` is core_api's src/services/echo.js: word pairs, never for fewer
 * than four words. `mightBeHer` is stricter, for deciding whether to stop her
 * mid-sentence: a short scrap whose every word is in what she is saying is
 * treated as her, because stopping her for her own voice is the worse mistake.
 * "Wait", "stop", "hang on" are not in her sentence, so they still get through.
 */

const MIN_WORDS = 4;
const SHARED_PAIRS = 0.6;

export function words(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function pairs(list: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < list.length; i++) out.push(`${list[i]} ${list[i + 1]}`);
  return out;
}

/** True when `heard` is most likely a transcription of `spoken`. */
export function isEcho(heard: string, spoken: string): boolean {
  const h = words(heard);
  if (h.length < MIN_WORDS) return false;
  const said = new Set(pairs(words(spoken)));
  if (!said.size) return false;
  const hp = pairs(h);
  return hp.filter((p) => said.has(p)).length / hp.length >= SHARED_PAIRS;
}

/** While she is talking: could `heard` be her own voice coming back? */
export function mightBeHer(heard: string, spoken: string): boolean {
  const h = words(heard);
  if (!h.length) return true;
  if (h.length >= MIN_WORDS) return isEcho(heard, spoken);
  const said = new Set(words(spoken));
  return h.every((word) => said.has(word));
}
