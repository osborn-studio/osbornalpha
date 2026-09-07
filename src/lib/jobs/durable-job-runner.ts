export type DurableJobExecutionState = 'active' | 'cancelled' | 'superseded';

function stableCode(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9_:-]+$/i.test(value)
    ? value.slice(0, 120)
    : null;
}

export function durableJobErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = stableCode((error as { code?: unknown }).code);
    if (code) return code;
  }
  return stableCode(error instanceof Error ? error.message : null) ?? fallback;
}

export function durableJobShouldRetry(
  error: unknown,
  code: string,
  attemptCount: number,
  maxAttempts: number,
  permanentCodes: ReadonlySet<string> = new Set(),
): boolean {
  if (attemptCount >= maxAttempts || permanentCodes.has(code)) return false;
  if (error && typeof error === 'object' && 'retryable' in error) {
    return (error as { retryable?: unknown }).retryable === true;
  }
  return true;
}

export function durableJobRetryAt(attemptCount: number, now: Date, maximumMinutes = 30): string {
  const delayMinutes = Math.min(maximumMinutes, 2 ** Math.max(0, attemptCount - 1));
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

export function monitorDurableJobState(
  readState: () => Promise<DurableJobExecutionState>,
  controller: AbortController,
  errorPrefix: string,
  intervalMs = 1_000,
): () => void {
  let checking = false;
  const timer = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    void readState()
      .then((state) => {
        if (state !== 'active') controller.abort(new Error(`${errorPrefix}_${state}`));
      })
      .catch(() => controller.abort(new Error(`${errorPrefix}_lease_check_failed`)))
      .finally(() => { checking = false; });
  }, intervalMs);
  return () => clearInterval(timer);
}
