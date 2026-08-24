import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEastmoneyQuote } from './eastmoney';
import { fetchSinaQuote } from './sina';
import { fetchTencentQuote } from './tencent';

describe('quote source fetch caching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps abortable quote requests out of the Next data cache pipeline', async () => {
    const requestOptions: Array<RequestInit & { next?: unknown }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestOptions.push((init ?? {}) as RequestInit & { next?: unknown });
      throw new DOMException('aborted', 'AbortError');
    });
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await fetchEastmoneyQuote('002463.SZ', signal);
    await fetchSinaQuote('002463.SZ', 4_000, signal);
    await fetchTencentQuote('002463.SZ', 4_000, signal);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestOptions).toHaveLength(3);
    for (const options of requestOptions) {
      expect(options.cache).toBe('no-store');
      expect(options.next).toBeUndefined();
    }
  });
});
