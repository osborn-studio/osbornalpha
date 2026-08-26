import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDatagatewayRealtimeQuote,
  fetchDatagatewayRealtimeQuotes,
  parseDatagatewayRealtimeQuotes,
} from './datagateway-quote';

const base = process.env.DATAGATEWAY_BASE_URL;
const key = process.env.DATAGATEWAY_API_KEY;
const path = process.env.DATAGATEWAY_REALTIME_QUOTE_PATH;

afterEach(() => {
  if (base === undefined) delete process.env.DATAGATEWAY_BASE_URL;
  else process.env.DATAGATEWAY_BASE_URL = base;
  if (key === undefined) delete process.env.DATAGATEWAY_API_KEY;
  else process.env.DATAGATEWAY_API_KEY = key;
  if (path === undefined) delete process.env.DATAGATEWAY_REALTIME_QUOTE_PATH;
  else process.env.DATAGATEWAY_REALTIME_QUOTE_PATH = path;
});

const rows = {
  data: [
    {
      ticker: '600519.SH', name: '贵州茅台', last: 1500, pre_close: 1490,
      open: 1495, high: 1510, low: 1488, volume: 1000, amount: 1_500_000,
      time: '2026-08-23T10:00:00+08:00', delayed: false,
    },
    {
      symbol: 'AAPL', last: '200', pre_close: '198', open: '199', high: '201', low: '197',
      rt_vol: '20', volume_unit: 'shares', rt_time: 1_755_928_800,
    },
  ],
};

describe('Datagateway Wind realtime adapter', () => {
  it('normalizes common Wind aliases and keeps one result per ticker', () => {
    const result = parseDatagatewayRealtimeQuotes(rows);
    expect(result.get('600519.SH')).toMatchObject({
      source: 'datagateway-wind', ticker: '600519.SH', market: 'A',
      price: 1500, prev_close: 1490, change: 10, change_pct: expect.closeTo(0.6711, 3),
      delayed: false,
    });
    expect(result.get('AAPL')).toMatchObject({ source: 'datagateway-wind', market: 'US', price: 200, volume: 20 });
  });

  it('accepts a fields plus rows tabular response envelope', () => {
    const result = parseDatagatewayRealtimeQuotes({
      data: {
        fields: ['ticker', 'last', 'pre_close', 'open', 'high', 'low', 'volume'],
        items: [['600519.SH', 1500, 1490, 1495, 1510, 1488, 1000]],
      },
    });
    expect(result.get('600519.SH')).toMatchObject({ price: 1500, volume: 1000, delayed: true });
  });

  it('posts one batch request with server-only Bearer authentication', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://wind-gateway.example.ts.net';
    process.env.DATAGATEWAY_API_KEY = 'test-secret';
    process.env.DATAGATEWAY_REALTIME_QUOTE_PATH = '/v1/market-data/tickers/query';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));

    const result = await fetchDatagatewayRealtimeQuotes(['600519.SH', 'AAPL'], { fetchImpl });
    expect(result.size).toBe(2);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://wind-gateway.example.ts.net/v1/market-data/tickers/query');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-secret' }));
    expect(init.body).toBe(JSON.stringify({ symbols: ['600519.SH', 'AAPL.O'] }));
    expect(url.toString()).not.toContain('test-secret');
  });

  it('supports the single-ticker call used by the single quote API', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://wind-gateway.example.ts.net';
    process.env.DATAGATEWAY_API_KEY = 'test-secret';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ ...rows.data[0] }] }), { status: 200 }));
    await expect(fetchDatagatewayRealtimeQuote('600519.SH', { fetchImpl })).resolves.toMatchObject({ ticker: '600519.SH' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('parses the DataGateway TickerQuoteQueryResponse contract', () => {
    const result = parseDatagatewayRealtimeQuotes({
      request_id: 'req-1',
      status: 'partial',
      data: [{
        symbol: '0700.HK',
        last_price: 512.4,
        source: 'wind',
        fetched_at: '2026-08-23T10:00:00Z',
      }],
      missing: [{ symbol: 'BAD.HK', reason: 'no_usable_realtime_quote' }],
    });
    expect(result.get('0700.HK')).toMatchObject({
      ticker: '0700.HK',
      market: 'HK',
      price: 512.4,
      prev_close: 512.4,
      updated_at: '2026-08-23T10:00:00.000Z',
    });
  });

  it('accepts Wind four-digit Hong Kong symbols', () => {
    const result = parseDatagatewayRealtimeQuotes({
      data: [{ symbol: '0700.HK', last_price: 512.4, source: 'wind', fetched_at: '2026-08-23T10:00:00Z' }],
    });
    expect(result.get('0700.HK')).toMatchObject({ ticker: '0700.HK', price: 512.4 });
  });

  it('times out and classifies the gateway failure for fallback', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://wind-gateway.example.ts.net';
    process.env.DATAGATEWAY_API_KEY = 'test-secret';
    const fetchImpl = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    await expect(fetchDatagatewayRealtimeQuotes(['600519.SH'], { fetchImpl, timeoutMs: 5 }))
      .rejects.toMatchObject({ kind: 'transient', retryable: true });
  });
});
