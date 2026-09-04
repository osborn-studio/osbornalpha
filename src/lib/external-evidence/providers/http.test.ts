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
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ error: 'limited' }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetcher);

    await expect(fetchSearchJson('https://provider.test/search', {}, {
      maxAttempts: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    })).resolves.toEqual({ ok: true });
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
});
