import { androidCall } from './android';

/**
 * "Only my voice" on this phone (Voiceprint.java). The voiceprint is made,
 * kept and checked on the phone; none of this ever reaches the server.
 */
export interface VoiceprintStatus {
  /** This APK has the speaker model and Android 13+ (needed to hand the recogniser the app's audio). */
  available: boolean;
  enrolled: boolean;
  /** The filter is checking turns (only meaningful when enrolled). */
  on: boolean;
  enrolledAt: number | null;
  /** A second print, taught through the car's microphone (missing on older APKs). */
  carEnrolled?: boolean;
  carEnrolledAt?: number | null;
  /** Own turns folded into the conversation prints (missing on older APKs). */
  learnedTurns?: number;
  /** Turns dropped since the app started because they weren't the owner's voice. */
  ignored: number;
  lastScore: number | null;
  lastKept: boolean;
  /** The score a turn needs to count as theirs. */
  match: number;
  /** Set while the phone is listening to teach or check. */
  enrolling: { mode: 'enroll' | 'check'; heardMs: number; needMs: number } | null;
}

export interface VoiceprintResult {
  ok: boolean;
  error?: string;
  /** check: how alike the sentence was to the print (0–1), and whether it passed. */
  score?: number;
  match?: boolean;
  /** enroll: how alike the pieces of the recording were. */
  consistency?: number;
}

export const voiceprintApi = {
  status: () => androidCall<VoiceprintStatus>('voiceprintStatus'),
  /** Resolves when the phone has finished listening. */
  listen: (mode: 'enroll' | 'check', car = false) => androidCall<VoiceprintResult>('voiceprintListen', { mode, car }),
  cancel: () => androidCall<boolean>('voiceprintCancel'),
  setOn: (on: boolean) => androidCall<VoiceprintStatus>('voiceprintFilter', { on }),
  remove: () => androidCall<VoiceprintStatus>('voiceprintDelete'),
};
