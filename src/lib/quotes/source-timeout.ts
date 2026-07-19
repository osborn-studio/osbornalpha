export async function withQuoteSourceTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`quote source timed out after ${boundedTimeoutMs}ms`);
      error.name = 'TimeoutError';
      controller.abort(error);
      reject(error);
    }, boundedTimeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
