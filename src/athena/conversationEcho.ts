import { isEcho, mightBeHer } from './echo.ts';
import { SILENT_DB } from './voiceLevel.ts';

const TEXT_WINDOW_MS = 15_000;
export const ECHO_TAIL_MS = 600;

/** Recent playback survives clip changes and stop/end events. A recognizer can
 * deliver an old filler or a short echo after a reply has already started.
 */
export class ConversationEcho {
  private said: { text: string; at: number }[] = [];
  private lastLevel = SILENT_DB;
  private lastSoundAt = -Infinity;

  observe(text: string, level: number, now: number): void {
    this.said = this.said.filter((entry) => now - entry.at < TEXT_WINDOW_MS);
    const last = this.said[this.said.length - 1];
    if (last?.text === text) last.at = now;
    else this.said.push({ text, at: now });
    // Bound repeated fillers and long songs without retaining an audio recording.
    this.said = this.said.slice(-16);
    if (level > SILENT_DB) {
      this.lastLevel = level;
      this.lastSoundAt = now;
    }
  }

  /** The room still carries her voice after playback ends or is interrupted. */
  level(now: number): number {
    return now - this.lastSoundAt <= ECHO_TAIL_MS ? this.lastLevel : SILENT_DB;
  }

  rejects(text: string, now: number, voiceStartedAt: number, speaking: boolean): boolean {
    return this.said.some((entry) => {
      if (now - entry.at >= TEXT_WINDOW_MS) return false;
      if (isEcho(text, entry.text)) return true;
      // Short results need timing evidence. A new "yes" after she finishes is
      // a valid follow-up even if she herself said "yes" in the last reply.
      return (speaking || voiceStartedAt <= entry.at) && mightBeHer(text, entry.text);
    });
  }
}
