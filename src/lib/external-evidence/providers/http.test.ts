import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSearchJson } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  } as Response;
}

describe('search provider HTTP reliability', () => {
  it('retries transient responses and succeeds within the request budget', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ error: 'busy' }, 503))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetcher);

    await expect(fetchSearchJson('https://provider.test/search', {}, {
      maxAttempts: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    })).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honors a bounded Retry-After hint for rate limits', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ error: 'limited' }, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetcher);

    try {
      const pending = fetchSearchJson('https://provider.test/search', {}, {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 3_000,
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails immediately for non-retryable provider responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: 'unauthorized' }, 401));
    vi.stubGlobal('fetch', fetcher);

    await expect(fetchSearchJson('https://provider.test/search', {}, {
      maxAttempts: 4,
      baseDelayMs: 0,
    })).rejects.toMatchObject({
      message: 'search_provider_http_401',
      retryable: false,
      attempts: 1,
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry after caller cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error('missing signal'));
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const pending = fetchSearchJson('https://provider.test/search', { signal: controller.signal });
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toMatchObject({
      message: 'search_provider_aborted', retryable: false, attempts: 1,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
