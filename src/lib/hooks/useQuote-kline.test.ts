import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchKlinePayload } from './useQuote';

describe('fetchKlinePayload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the selected range and passes the cancellation signal', async () => {
    const payload = {
      bars: [],
      source: 'eastmoney',
      meta: {
        source: 'eastmoney',
        range: '1y',
        interval: 'day',
        granularity: '1d',
        cacheTtlSeconds: 60,
        currencyCode: 'CNY',
        pricePrecision: 2,
        minMove: 0.01,
        volumeUnit: 'shares',
        requestedBars: 260,
        returnedBars: 0,
        missingBars: 260,
      },
    };
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

  it('rejects a successful response for a different business range', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      bars: [],
      source: 'eastmoney',
      meta: {
        source: 'eastmoney', range: '3m', interval: 'day', granularity: '1d',
        cacheTtlSeconds: 300, currencyCode: 'USD', pricePrecision: 2, minMove: 0.01,
        volumeUnit: 'shares', requestedBars: 66, returnedBars: 0, missingBars: 66,
      },
    }), { status: 200 })));

    await expect(fetchKlinePayload('NVDA', '1m')).rejects.toMatchObject({ code: 'invalid_data' });
  });

  it('rejects malformed successful payloads instead of passing them to the chart', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: 'eastmoney',
      bars: [{ time: 2, open: 10, high: 9, low: 8, close: 10, volume: 100 }],
      meta: { source: 'eastmoney', cacheTtlSeconds: 60 },
    }), { status: 200 })));

    await expect(fetchKlinePayload('NVDA', '1m')).rejects.toMatchObject({
      message: 'Invalid chart response',
      code: 'invalid_data',
    });
  });

  it('rejects inconsistent previous-close calculations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: 'eastmoney',
      bars: [{
        time: 2, open: 10, high: 12, low: 9, close: 11, volume: 100,
        previousClose: 10, change: 2, changePct: 20,
      }],
      meta: {
        source: 'eastmoney', range: '1m', interval: 'day', granularity: '1d', cacheTtlSeconds: 60, currencyCode: 'USD',
        pricePrecision: 2, minMove: 0.01, volumeUnit: 'shares',
        requestedBars: 22, returnedBars: 1, missingBars: 21,
      },
    }), { status: 200 })));

    await expect(fetchKlinePayload('NVDA', '1m')).rejects.toMatchObject({ code: 'invalid_data' });
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
