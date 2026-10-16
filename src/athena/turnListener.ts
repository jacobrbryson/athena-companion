import { androidCall } from '../native/android';
import type { SpeechRecognitionCtor } from './useVoiceInput';

/**
 * Hears one utterance and hands back its words ('' for silence or a cancel).
 * Conversation mode's turn-by-turn loop opens one whenever she is quiet and
 * cancels it the moment she starts talking. Used where the recognizer can't be
 * given the echo-cancelled microphone: the Android app and mobile browsers.
 */
export interface TurnListener {
  listen: (onPartial: (text: string) => void) => Promise<string>;
  cancel: () => void;
}

/** The Android app: its own in-app recognizer (ConversationListener.java). */
export function androidTurnListener(): TurnListener {
  return {
    listen: async (onPartial) => {
      const partial = (event: Event) => onPartial(String((event as MessageEvent).data ?? ''));
      window.addEventListener('athena-conversation-partial', partial);
      try {
        const { text } = await androidCall<{ text: string }>('conversationListen', { language: navigator.language || 'en-US' });
        return (text ?? '').trim();
      } finally {
        window.removeEventListener('athena-conversation-partial', partial);
      }
    },
    cancel: () => { void androidCall('conversationCancel').catch(() => undefined); },
  };
}

/** A browser's own recognizer, one utterance per start (it ends itself on a pause). */
export function browserTurnListener(Ctor: SpeechRecognitionCtor): TurnListener {
  let current: { abort: () => void } | null = null;
  return {
    listen: (onPartial) => new Promise<string>((resolve, reject) => {
      const r = new Ctor();
      r.lang = navigator.language || 'en-US';
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;
      let finals = '';
      let live = '';
      let settled = false;
      const done = (error?: string) => {
        if (settled) return;
        settled = true;
        if (current?.abort === abort) current = null;
        if (error) reject(new Error(error));
        // Interim words still in flight when it closed are as final as they'll get.
        else resolve(`${finals} ${live}`.trim());
      };
      const abort = () => {
        live = '';
        finals = '';
        try { r.abort(); } catch { /* already ended */ }
        done();
      };
      current = { abort };
      r.onresult = (event: any) => {
        let partial = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text: string = result[0]?.transcript ?? '';
          if (result.isFinal) finals = `${finals} ${text}`.trim();
          else partial += text;
        }
        live = partial.trim();
        onPartial(`${finals} ${live}`.trim());
      };
      r.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') done('Microphone access was blocked.');
        else if (event.error === 'network') done("Couldn't reach speech recognition. Check your connection.");
        else if (event.error === 'audio-capture') done('No microphone was found.');
        // 'no-speech' and 'aborted' are ordinary here: onend follows.
      };
      r.onend = () => done();
      try { r.start(); } catch { done('Speech recognition could not start.'); }
    }),
    cancel: () => current?.abort(),
  };
}
