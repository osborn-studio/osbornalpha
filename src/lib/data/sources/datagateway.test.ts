import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  datagatewayConfig,
  datagatewayDailyKlineBody,
  datagatewayDailyKlineUrl,
  datagatewaySymbol,
  fetchDatagatewayDailyKline,
  parseDatagatewayDailyKline,
} from './datagateway';

const originalBaseUrl = process.env.DATAGATEWAY_BASE_URL;
const originalApiKey = process.env.DATAGATEWAY_API_KEY;
const originalPath = process.env.DATAGATEWAY_DAILY_KLINE_PATH;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.DATAGATEWAY_BASE_URL;
  else process.env.DATAGATEWAY_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete process.env.DATAGATEWAY_API_KEY;
  else process.env.DATAGATEWAY_API_KEY = originalApiKey;
  if (originalPath === undefined) delete process.env.DATAGATEWAY_DAILY_KLINE_PATH;
  else process.env.DATAGATEWAY_DAILY_KLINE_PATH = originalPath;
});

const payload = {
  data: {
    adjustment: 'qfq',
    volume_unit: 'shares',
    bars: [{ date: '20260811', open: '10', high: '12', low: '9', close: '11', volume: '1234' }],
  },
};

describe('Datagateway daily K-line adapter', () => {
  it('requires an HTTPS URL and a server-side key', () => {
    expect(datagatewayConfig({ DATAGATEWAY_BASE_URL: 'http://gateway.example.com', DATAGATEWAY_API_KEY: 'secret' })).toBeNull();
    expect(datagatewayConfig({ DATAGATEWAY_BASE_URL: 'https://gateway.example.com', DATAGATEWAY_API_KEY: '' })).toBeNull();
    expect(datagatewayConfig({ DATAGATEWAY_BASE_URL: 'https://gateway.example.com', DATAGATEWAY_API_KEY: 'secret' })).toMatchObject({
      apiKey: 'secret', dailyKlinePath: '/v1/market-data/security-prices/history/query',
    });
    expect(datagatewayConfig({
      DATAGATEWAY_BASE_URL: 'https://gateway.example.com',
      DATAGATEWAY_API_KEY: 'secret',
      DATAGATEWAY_DAILY_KLINE_PATH: '/v1/market/kline/daily',
    })?.dailyKlinePath).toBe('/v1/market-data/security-prices/history/query');
  });

  it('maps supported market symbols without putting credentials in the URL', () => {
    const config = datagatewayConfig({ DATAGATEWAY_BASE_URL: 'https://gateway.example.com/api/', DATAGATEWAY_API_KEY: 'secret' })!;
    const url = datagatewayDailyKlineUrl(config, { ticker: '600519.sh', market: 'A', limit: 23, adjustment: 'qfq' })!;
    expect(url.toString()).toBe('https://gateway.example.com/v1/market-data/security-prices/history/query');
    expect(url.toString()).not.toContain('secret');
    expect(datagatewayDailyKlineBody({ ticker: '00700.HK', market: 'HK', limit: 23 })?.symbols).toEqual(['0700.HK']);
    const body = datagatewayDailyKlineBody({ ticker: '00700.HK', market: 'HK', limit: 23 });
    expect(body).toMatchObject({ symbols: ['0700.HK'], mode: 'strict_sync' });
    expect(body?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body?.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(datagatewaySymbol('7203.T', 'JP')).toBe('7203.T');
    expect(datagatewaySymbol('005930.KS', 'KR')).toBe('005930.KS');
    expect(datagatewaySymbol('broken value', 'US')).toBeNull();
  });

  it('normalizes daily bars and rejects unit or adjustment mismatches', () => {
    expect(parseDatagatewayDailyKline(payload, 'qfq')).toEqual({
      source: 'datagateway', adjustment: 'qfq', volumeUnit: 'shares',
      bars: [{ time: '2026-08-11', open: 10, high: 12, low: 9, close: 11, volume: 1234 }],
    });
    expect(() => parseDatagatewayDailyKline({ data: { ...payload.data, volume_unit: 'lots' } }, 'qfq')).toThrow(/shares/);
    expect(() => parseDatagatewayDailyKline({ data: { ...payload.data, adjustment: 'none' } }, 'qfq')).toThrow(/adjustment/);
  });

  it('accepts Wind-style uppercase fields, numeric YYYYMMDD dates, and tabular rows', () => {
    const result = parseDatagatewayDailyKline({
      DATA: 'ignored',
      FIELDS: ['TRADE_DT', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOL'],
      ITEMS: [[20260811, 10, 12, 9, 11, 1234]],
      ADJUSTMENT: 'qfq',
      VOLUME_UNIT: 'shares',
    }, 'qfq');
    expect(result.bars).toEqual([{ time: '2026-08-11', open: 10, high: 12, low: 9, close: 11, volume: 1234 }]);
  });

  it('accepts a direct data array and ISO timestamps', () => {
    const result = parseDatagatewayDailyKline({
      adjustment: 'none',
      data: [{ TRADE_DT: '2026-08-11T00:00:00Z', OPEN: 10, HIGH: 12, LOW: 9, CLOSE: 11, VOL: 1234 }],
    }, 'none');
    expect(result.bars[0]).toEqual({ time: '2026-08-11', open: 10, high: 12, low: 9, close: 11, volume: 1234 });
  });

  it('converts DataGateway daily close history into simplified candles', () => {
    const result = parseDatagatewayDailyKline({
      request_id: 'test',
      status: 'success',
      data: [
        { symbol: '600519.SH', date: '2026-08-10', value: 100, source: 'wind', quality: 'observed' },
        { symbol: '600519.SH', date: '2026-08-11', value: 110, source: 'wind', quality: 'observed' },
      ],
      missing: [],
    }, 'qfq');
    expect(result).toEqual({
      source: 'datagateway', adjustment: 'qfq', volumeUnit: 'shares',
      bars: [
        { time: '2026-08-10', open: 100, high: 100, low: 100, close: 100, volume: 0 },
        { time: '2026-08-11', open: 100, high: 110, low: 100, close: 110, volume: 0 },
      ],
    });
  });

  it('sends Bearer authentication only in the server-to-server header', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'very-secret-key';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await fetchDatagatewayDailyKline('600519.SH', 'A', 23, 'qfq', { fetchImpl });

    expect(result?.source).toBe('datagateway');
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).not.toContain('very-secret-key');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer very-secret-key' }));
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(JSON.parse(String(init.body))).toMatchObject({ symbols: ['600519.SH'], mode: 'strict_sync' });
    expect(init.cache).toBe('no-store');
  });

  it('turns upstream outages and oversized payloads into safe provider failures', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'very-secret-key';
    await expect(fetchDatagatewayDailyKline('NVDA', 'US', 23, 'none', {
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    })).rejects.toMatchObject({ kind: 'transient', status: 503, retryable: true });
    await expect(fetchDatagatewayDailyKline('NVDA', 'US', 23, 'none', {
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 200, headers: { 'content-length': '1000001' } })),
    })).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('keeps the timeout active while reading a streaming response body', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'very-secret-key';
    const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"data":'));
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const outcome = await Promise.race([
      fetchDatagatewayDailyKline('NVDA', 'US', 23, 'none', { fetchImpl, timeoutMs: 5 }).catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve('still-pending'), 50)),
    ]);
    expect(outcome).toMatchObject({ kind: 'transient', retryable: true });
  });

  it('allows a cold strict-sync history request to finish within the production latency budget', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'very-secret-key';
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
        const responseTimer = setTimeout(() => {
          resolve(new Response(JSON.stringify(payload), { status: 200 }));
        }, 4_500);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(responseTimer);
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      }));

      const outcomePromise = fetchDatagatewayDailyKline('600519.SH', 'A', 23, 'qfq', { fetchImpl })
        .then((result) => ({ result }), (error) => ({ error }));

      await vi.advanceTimersByTimeAsync(4_500);
      expect(await outcomePromise).toMatchObject({ result: { source: 'datagateway' } });
    } finally {
      vi.useRealTimers();
    }
  });
});
