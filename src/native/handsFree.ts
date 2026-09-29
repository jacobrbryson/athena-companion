import { androidCall, isAndroidCompanion } from './android';

/** What the phone's hands-free listener is doing (HandsFreeService.status). */
export interface HandsFreeStatus {
  running: boolean;
  state: 'off' | 'starting' | 'waiting' | 'listening' | 'thinking' | 'speaking';
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
 * True while this phone is listening hands-free. The service speaks its own
 * replies, so the open chat must not voice the same reply a second time.
 * APKs without hands-free (or a browser) answer false.
 */
export async function handsFreeRunning(): Promise<boolean> {
  if (!isAndroidCompanion()) return false;
  try {
    return (await handsFreeApi.status()).running;
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
