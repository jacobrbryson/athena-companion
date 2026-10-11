/**
 * How loud her voice is, moment by moment, in a clip she is about to play.
 *
 * Conversation mode uses it to tell her echo from you: the page knows exactly
 * what she is saying and when, so a microphone that is only as loud as her
 * playback predicts is hearing her, not you (useConversation).
 */

/** One level per this many ms of audio. */
export const LEVEL_FRAME_MS = 20;
export const SILENT_DB = -120;

/** Loudness (dBFS) per LEVEL_FRAME_MS of a base64 PCM16 little-endian clip. */
export function voiceLevels(audioBase64: string, sampleRate: number, channels: number): Float32Array {
  let bytes: string;
  try {
    bytes = atob(audioBase64);
  } catch {
    return new Float32Array(0);
  }
  const samples = Math.floor(bytes.length / 2);
  const perFrame = Math.max(1, Math.round((sampleRate * LEVEL_FRAME_MS) / 1000) * Math.max(1, channels));
  const levels = new Float32Array(Math.ceil(samples / perFrame));
  for (let f = 0; f < levels.length; f++) {
    let sum = 0;
    const end = Math.min(samples, (f + 1) * perFrame);
    for (let i = f * perFrame; i < end; i++) {
      let v = bytes.charCodeAt(2 * i) | (bytes.charCodeAt(2 * i + 1) << 8);
      if (v >= 32768) v -= 65536;
      sum += v * v;
    }
    const count = Math.max(1, end - f * perFrame);
    levels[f] = Math.max(SILENT_DB, 10 * Math.log10(sum / count / (32768 * 32768) + 1e-12));
  }
  return levels;
}

/**
 * The loudest she was over the `windowMs` of playback ending `elapsedMs` into
 * the clip. A window, not a point: speakers and the room add a delay, and an
 * echo can trail the moment it was played by a couple of hundred ms.
 */
export function loudestOver(levels: Float32Array, elapsedMs: number, windowMs: number): number {
  const last = Math.floor(elapsedMs / LEVEL_FRAME_MS);
  const first = Math.floor((elapsedMs - windowMs) / LEVEL_FRAME_MS);
  let loudest = SILENT_DB;
  for (let f = Math.max(0, first); f <= Math.min(levels.length - 1, last); f++) {
    if (levels[f] > loudest) loudest = levels[f];
  }
  return loudest;
}
