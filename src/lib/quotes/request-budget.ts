export const QUOTE_ROUTE_BUDGET_MS = 20_000;

/** Bounds awaited route work and propagates cancellation; inner cached work may ignore it. */
export async function withQuoteRequestBudget<T>(parent: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancelled: (reason: Error) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
  const stop = (reason: Error) => { rejectCancelled(reason); controller.abort(reason); };
  const abort = () => stop(new DOMException('Quote request cancelled', 'AbortError'));
  const expire = () => stop(new DOMException('Quote request deadline', 'TimeoutError'));
  parent.addEventListener('abort', abort, { once: true });
  try {
    if (parent.aborted) abort();
    else timer = setTimeout(expire, QUOTE_ROUTE_BUDGET_MS);
    // No work is dispatched for an already-aborted request.
    if (controller.signal.aborted) return await cancelled;
    return await Promise.race([operation(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
    controller.abort();
  }
}

export async function waitQuoteRetry(signal: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason ?? new DOMException('Quote retry cancelled', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else timer = setTimeout(resolve, 200);
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
