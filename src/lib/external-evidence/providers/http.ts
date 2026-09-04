export interface SearchFetchOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class SearchProviderRequestError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly attempts: number;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      status?: number | null;
      retryable: boolean;
      attempts: number;
      retryAfterSeconds?: number | null;
    },
  ) {
    super(message);
    this.name = 'SearchProviderRequestError';
    this.status = options.status ?? null;
    this.retryable = options.retryable;
    this.attempts = options.attempts;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

const DEFAULT_OPTIONS: Required<SearchFetchOptions> = {
  timeoutMs: 7_000,
  maxAttempts: 3,
  baseDelayMs: 150,
  maxDelayMs: 2_000,
};

function optionsOf(value: number | SearchFetchOptions): Required<SearchFetchOptions> {
  const input = typeof value === 'number' ? { timeoutMs: value } : value;
  return {
    timeoutMs: Number.isFinite(input.timeoutMs) ? Math.max(1, Math.floor(input.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs)) : DEFAULT_OPTIONS.timeoutMs,
    maxAttempts: Number.isFinite(input.maxAttempts) ? Math.min(4, Math.max(1, Math.floor(input.maxAttempts ?? DEFAULT_OPTIONS.maxAttempts))) : DEFAULT_OPTIONS.maxAttempts,
    baseDelayMs: Number.isFinite(input.baseDelayMs) ? Math.max(0, Math.floor(input.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs)) : DEFAULT_OPTIONS.baseDelayMs,
    maxDelayMs: Number.isFinite(input.maxDelayMs) ? Math.max(0, Math.floor(input.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs)) : DEFAULT_OPTIONS.maxDelayMs,
  };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30, Math.ceil(seconds));
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.min(30, Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000)));
}

function delayMs(attempt: number, options: Required<SearchFetchOptions>, retryAfter: number | null): number {
  const hinted = retryAfter == null ? 0 : retryAfter * 1_000;
  const exponential = options.baseDelayMs * (2 ** Math.max(0, attempt - 1));
  return Math.min(options.maxDelayMs, Math.max(hinted, exponential));
}

function sleep(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

export async function fetchSearchJson(
  url: string,
  init: RequestInit,
  timeoutOrOptions: number | SearchFetchOptions = DEFAULT_OPTIONS,
): Promise<unknown> {
  const options = optionsOf(timeoutOrOptions);
  let lastError: SearchProviderRequestError | null = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
        throw new SearchProviderRequestError(`search_provider_http_${response.status}`, {
          status: response.status,
          retryable: retryableStatus(response.status),
          attempts: attempt,
          retryAfterSeconds: retryAfter,
        });
      }
      try {
        return await response.json();
      } catch {
        throw new SearchProviderRequestError('search_provider_invalid_json', {
          retryable: true,
          attempts: attempt,
        });
      }
    } catch (error) {
      const normalized = error instanceof SearchProviderRequestError
        ? error
        : new SearchProviderRequestError(timedOut ? 'search_provider_timeout' : 'search_provider_network_error', {
          retryable: true,
          attempts: attempt,
        });
      lastError = normalized;
      if (!normalized.retryable || attempt >= options.maxAttempts) throw normalized;
      // Do not keep an aborted request timer alive while backing off.
      clearTimeout(timeout);
      await sleep(delayMs(attempt, options, normalized.retryAfterSeconds));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new SearchProviderRequestError('search_provider_request_failed', {
    retryable: false,
    attempts: options.maxAttempts,
  });
}

export function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
