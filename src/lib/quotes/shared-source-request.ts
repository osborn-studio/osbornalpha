import { withQuoteSourceTimeout } from './source-timeout';

/** One process, exact caller-defined key. Each subscriber owns only its wait. */
export function createSharedSourceRequests<T>(timeoutMs: number) {
  type Entry = { controller: AbortController; promise: Promise<T>; subscribers: number; settled: boolean };
  const entries = new Map<string, Entry>();

  return async (key: string, operation: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> => {
    parent?.throwIfAborted();
    let entry = entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
      const created: Entry = { controller, promise, subscribers: 0, settled: false };
      entries.set(key, created);
      const settle = () => {
        created.settled = true;
        if (entries.get(key) === created) entries.delete(key);
      };
      // Publish a real promise before synchronous operation dispatch/re-entry.
      void withQuoteSourceTimeout(operation, timeoutMs, controller.signal).then(
        value => { settle(); resolve(value); },
        error => { settle(); reject(error); },
      );
      entry = created;
    }
    const current = entry;
    current.subscribers += 1;
    let rejectCancelled: (reason: unknown) => void = () => {};
    const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
    const abort = () => rejectCancelled(parent?.reason ?? new DOMException('Quote subscriber cancelled', 'AbortError'));
    parent?.addEventListener('abort', abort, { once: true });
    try {
      if (parent?.aborted) abort();
      return await Promise.race([current.promise, cancelled]);
    } finally {
      parent?.removeEventListener('abort', abort);
      current.subscribers -= 1;
      if (current.subscribers === 0 && !current.settled) {
        // No caller remains. Remove before abort so a later caller starts fresh.
        if (entries.get(key) === current) entries.delete(key);
        current.controller.abort(new DOMException('No quote subscribers remain', 'AbortError'));
      }
    }
  };
}
