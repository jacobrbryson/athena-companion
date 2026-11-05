import { androidCall, isAndroidCompanion } from './android';

/** What the phone's hands-free listener is doing (HandsFreeService.status). */
export interface HandsFreeStatus {
  running: boolean;
  state: 'off' | 'starting' | 'waiting' | 'listening' | 'thinking' | 'speaking' | 'page';
  /**
   * 'conversation': the chat's conversation mode, carried on by the phone
   * while Athena is off screen (the page listens while she is on it).
   * Missing on APKs before 2026-11-04, which only had the wake word.
   */
  mode?: 'wake' | 'conversation';
  /**
   * Conversation mode is talking through the car's hands-free (CarAudio): the
   * phone has the whole conversation, on screen too, and voices every reply.
   */
  car?: boolean;
  /** Replies the phone itself has spoken lately, so the page doesn't repeat them. */
  voiced?: string[];
  lastHeard: string | null;
  error: string | null;
  /** How the request after the wake word was transcribed — always on the phone. */
  transcriber: 'on-device' | 'vosk' | null;
}

export const handsFreeApi = {
  status: () => androidCall<HandsFreeStatus>('handsFreeStatus'),
  start: (sessionId: string, timezone: string | null) => androidCall<HandsFreeStatus>('handsFreeStart', { sessionId, timezone }),
  stop: () => androidCall<HandsFreeStatus>('handsFreeStop'),
};

/**
 * True while this phone is listening hands-free for her name. The service
 * speaks its own replies, so the open chat must not voice the same reply a
 * second time. Conversation mode's phone side doesn't count: while Athena is
 * on screen the page does the talking. APKs without hands-free (or a
 * browser) answer false.
 */
export async function handsFreeRunning(): Promise<boolean> {
  if (!isAndroidCompanion()) return false;
  try {
    const status = await handsFreeApi.status();
    return status.running && status.mode !== 'conversation';
  } catch {
    return false;
  }
}

/**
 * The phone has spoken (or is about to speak) this reply itself: hands-free
 * is on, or conversation mode answered it while the screen was locked.
 */
export async function phoneVoices(text: string): Promise<boolean> {
  if (!isAndroidCompanion()) return false;
  try {
    const status = await handsFreeApi.status();
    if (!status.running) return false;
    if (status.mode !== 'conversation') return true;
    if (status.car) return true;
    if (status.state === 'thinking' || status.state === 'speaking') return true;
    return (status.voiced ?? []).includes(text.trim());
  } catch {
    return false;
  }
}

/** The chat's session on this device (useChat keeps it per profile). */
export function chatSessionId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('companion_sessionId:')) return localStorage.getItem(key);
    }
  } catch {
    // Storage unavailable: hands-free needs the chat opened once.
  }
  return null;
}
