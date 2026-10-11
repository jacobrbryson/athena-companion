import { useCallback, useEffect, useRef, useState } from 'react';
import { androidCall, isAndroidCompanion } from '../native/android';

/**
 * Click-on / click-off speech-to-text via the Web Speech API.
 *
 * Differs from the marketing app's hold-to-talk: here `toggle()` starts
 * listening on the first click and stops on the next. Unsupported browsers are
 * handled gracefully (isSupported === false, controls hidden by the caller).
 */

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: (track?: MediaStreamTrack) => void;
  abort: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

export function getCtor(): SpeechRecognitionCtor | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface VoiceInput {
  isSupported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  /** Toggle listening on/off. Final transcripts are delivered to `onResult`. */
  toggle: () => void;
  stop: () => void;
}

export function useVoiceInput(onResult: (text: string) => void, onStart?: () => void): VoiceInput {
  const [isSupported] = useState(() => isAndroidCompanion() || getCtor() !== null);
  const nativeTurn = useRef(0);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  const stop = useCallback(() => {
    nativeTurn.current += 1;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    onStartRef.current?.();
    if (isAndroidCompanion()) {
      const turn = ++nativeTurn.current;
      setError(null); setInterim(''); setListening(true);
      void androidCall<{ text: string }>('recognizeSpeech').then(({ text }) => {
        if (turn === nativeTurn.current && text.trim()) onResultRef.current(text.trim());
      }).catch((e: Error) => {
        if (turn === nativeTurn.current) setError(e.message);
      }).finally(() => { if (turn === nativeTurn.current) setListening(false); });
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) {
      setError('Voice input is not supported in this browser.');
      return;
    }
    setError(null);
    setInterim('');

    const recognition = new Ctor();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      let interimText = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        // One tap, one turn. Close before her answer can be heard back.
        recognitionRef.current = null;
        try { recognition.abort(); } catch { /* already ended */ }
        setListening(false);
        onResultRef.current(finalText.trim());
        setInterim('');
      }
    };

    recognition.onerror = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      const map: Record<string, string> = {
        'not-allowed': 'Microphone access was blocked.',
        'no-speech': "I didn't catch that — try again.",
        'audio-capture': 'No microphone was found.',
        network: 'Network error during voice recognition.',
      };
      setError(map[event.error] || 'Voice input error.');
      setListening(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (err) {
      recognitionRef.current = null;
      console.error('useVoiceInput: start failed', err);
      setError('Could not start voice input.');
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return { isSupported, listening, interim, error, toggle, stop };
}
