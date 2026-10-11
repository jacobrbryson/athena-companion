/**
 * Tells her echo from you, frame by frame, using what she is playing.
 *
 * Her voice reaches the microphone at some fixed-ish loss (speakers, room,
 * the browser's echo canceller): `coupling`, in dB, mic level minus her
 * playback level. The gate learns it from frames where only she can be
 * heard, and then a frame counts as you only when the mic is clearly louder
 * than her echo predicts, or she is quiet.
 *
 * It starts by assuming a strong echo (no canceller, loud speakers), so the
 * first seconds err toward "that was her", and learns down from there. With
 * headphones it learns that she can't be heard at all, and anything is you.
 */

/** She is quiet below this, and a mic level can't be her. */
const HER_QUIET_DB = -60;
/** Only learn from frames where she is clearly speaking. */
const HER_LOUD_DB = -45;
/** You must be this much louder than her predicted echo. */
const MARGIN_DB = 9;
const START_COUPLING_DB = -15;
const MIN_COUPLING_DB = -70;
const MAX_COUPLING_DB = 10;

export class EchoGate {
  coupling = START_COUPLING_DB;

  /** Is this mic level more than her echo would explain? */
  isYou(micDb: number, herDb: number): boolean {
    if (herDb <= HER_QUIET_DB) return true;
    return micDb > herDb + this.coupling + MARGIN_DB;
  }

  /**
   * Learn from a frame that wasn't you. Down quickly (her echo is weaker than
   * assumed), up slowly (a loud moment might have been you, mumbling).
   */
  learn(micDb: number, herDb: number): void {
    if (herDb < HER_LOUD_DB) return;
    const seen = micDb - herDb;
    this.coupling += (seen - this.coupling) * (seen < this.coupling ? 0.1 : 0.03);
    this.coupling = Math.min(MAX_COUPLING_DB, Math.max(MIN_COUPLING_DB, this.coupling));
  }
}
