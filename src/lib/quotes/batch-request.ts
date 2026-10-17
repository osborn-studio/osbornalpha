import { shouldRetryQuoteBatchError, type QuoteBatchPayload } from './batch-client';

export const QUOTE_CHUNK_ATTEMPT_MS = 25_000;
export const QUOTE_CHUNK_TOTAL_MS = 50_000;
export const QUOTE_CHUNK_MAX_ATTEMPTS = 2;

// Retry-After is a minimum wait, never shortened to fit our request budget.
export function quoteRetryAfterMs(value: string | null, now: number): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1000 ? seconds * 1000 : Infinity;
  }
  // HTTP-date only; Date.parse alone also accepts unrelated numeric strings.
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.max(0, parsed - now) : null;
}

/** Client transport bound only. Provider retries on the server are separate. */
export async function requestQuoteBatch<T>(url: string, fetcher: typeof fetch = fetch): Promise<QuoteBatchPayload<T>> {
  const started = performance.now();
  for (let attempt = 0; attempt < QUOTE_CHUNK_MAX_ATTEMPTS; attempt += 1) {
    const remaining = QUOTE_CHUNK_TOTAL_MS - (performance.now() - started);
    if (remaining <= 0) throw new DOMException('Quote request deadline', 'AbortError');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryAfter: number | null = null;
    let failure: unknown;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new DOMException('Quote request deadline', 'AbortError'));
          controller.abort();
        }, Math.min(QUOTE_CHUNK_ATTEMPT_MS, remaining));
      });
      const operation = (async () => {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) {
          retryAfter = quoteRetryAfterMs(response.headers.get('Retry-After'), Date.now());
          // Do not consume an error body or retain provider exception details.
          throw new Error(`quote batch HTTP ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid quote batch response');
        return payload as QuoteBatchPayload<T>;
      })();
      return await Promise.race([operation, deadline]);
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
      controller.abort(); // Release unread error bodies and any losing operation.
    }
    if (!shouldRetryQuoteBatchError(failure, attempt)) throw failure;
    const wait = Math.max(250, retryAfter ?? 0);
    if (wait >= QUOTE_CHUNK_TOTAL_MS - (performance.now() - started)) throw failure;
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
  throw new Error('quote batch attempts exhausted');
}
