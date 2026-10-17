export async function withQuoteSourceTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal,
): Promise<T> {
  const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancelled: (error: Error) => void = () => {};
  const abort = () => {
    const reason = parent?.reason ?? new DOMException('Quote source cancelled', 'AbortError');
    rejectCancelled(reason);
    controller.abort(reason);
  };
  const timeout = new Promise<never>((_, reject) => {
    rejectCancelled = reject;
    timer = setTimeout(() => {
      const error = new Error(`quote source timed out after ${boundedTimeoutMs}ms`);
      error.name = 'TimeoutError';
      controller.abort(error);
      reject(error);
    }, boundedTimeoutMs);
  });

  parent?.addEventListener('abort', abort, { once: true });
  try {
    if (parent?.aborted) { abort(); return await timeout; }
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    parent?.removeEventListener('abort', abort);
    controller.abort();
  }
}
