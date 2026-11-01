import { ReadInvalidatedError } from './readCache.ts';

/** Retry reads only. Discarded responses stay discarded, including across accounts. */
export async function retryRead<T>(load: () => Promise<T>, active: () => boolean,
  pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await load(); }
    catch (error) {
      const status = (error as { status?: number })?.status;
      const transient = error instanceof ReadInvalidatedError || error instanceof TypeError
        || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
        || (status !== undefined && status >= 500);
      if (!transient || attempt >= 2 || !active()) throw error;
      await pause(error instanceof ReadInvalidatedError ? 100 : 1000 * (attempt + 1));
      if (!active()) throw error;
    }
  }
}
