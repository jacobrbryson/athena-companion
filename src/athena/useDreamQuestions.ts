import { useCallback, useEffect, useState } from 'react';
import { dreamsApi, type DreamQuestion } from '../api/dashboard';
import { DASHBOARD_REFRESH_EVENT } from './useChat';
import { usePresentPoll } from './idle';

/** Slow on purpose: a question waits for the person, nothing here is urgent. */
const POLL_MS = 120_000;

/**
 * The questions Athena is holding from her dreaming, for the Notifications bell.
 *
 * Answering one happens in conversation, which is where she asks; the person
 * can also close one themselves once it's been dealt with.
 * A failed read leaves the previous list standing rather than clearing the
 * badge, so a flaky network never reads as "nothing is waiting".
 */
export function useDreamQuestions(enabled: boolean) {
  const [questions, setQuestions] = useState<DreamQuestion[]>([]);
  const refresh = useCallback(() => {
    if (!enabled) return;
    dreamsApi.questions().then(r => setQuestions(r.questions.filter(q => q.status === 'pending'))).catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) { setQuestions([]); return; }
    window.addEventListener(DASHBOARD_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, refresh);
  }, [enabled, refresh]);
  // Paused while nobody is here; the questions wait on the server regardless.
  usePresentPoll(refresh, POLL_MS, enabled);
  /** Close a question from the bell; removed locally first so it never lingers. */
  const dismiss = useCallback((uuid: string) => {
    setQuestions(prev => prev.filter(q => q.uuid !== uuid));
    dreamsApi.dismissQuestion(uuid).catch(refresh);
  }, [refresh]);
  return { questions, refresh, dismiss };
}
