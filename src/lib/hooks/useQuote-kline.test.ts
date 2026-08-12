import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchKlinePayload } from './useQuote';

describe('fetchKlinePayload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the selected range and passes the cancellation signal', async () => {
    const payload = { bars: [], source: 'eastmoney', meta: {} };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(fetchKlinePayload('600519.SH', '1y', controller.signal)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/kline/600519.SH?range=1y', { signal: controller.signal });
  });

  it('preserves the API error code for localized UI states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'provider_unavailable' }), { status: 503 })));
    await expect(fetchKlinePayload('NVDA', '1m')).rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  it('allows an obsolete range request to be aborted', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = fetchKlinePayload('NVDA', '3m', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
