import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDatagatewayIntradayKline } from './datagateway-intraday';

const base = process.env.DATAGATEWAY_BASE_URL;
const key = process.env.DATAGATEWAY_API_KEY;
const intradayEnabled = process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED;

afterEach(() => {
  if (base === undefined) delete process.env.DATAGATEWAY_BASE_URL;
  else process.env.DATAGATEWAY_BASE_URL = base;
  if (key === undefined) delete process.env.DATAGATEWAY_API_KEY;
  else process.env.DATAGATEWAY_API_KEY = key;
  if (intradayEnabled === undefined) delete process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED;
  else process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = intradayEnabled;
});

describe('DataGateway intraday adapter', () => {
  it('stays disabled unless explicitly enabled', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'secret';
    const fetchImpl = vi.fn();
    await expect(fetchDatagatewayIntradayKline('600519.SH', 'A', 240, { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('aggregates Wind ticks into one-minute OHLCV bars', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'secret';
    process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = 'true';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { symbol: '600519.SH', timestamp: '2026-08-27T01:31:05Z', last_price: 100, cumulative_volume: 1000 },
      { symbol: '600519.SH', timestamp: '2026-08-27T01:31:25Z', last_price: 102, cumulative_volume: 1100 },
      { symbol: '600519.SH', timestamp: '2026-08-27T01:32:05Z', last_price: 101, cumulative_volume: 1150 },
    ], missing: [] }), { status: 200 }));
    const result = await fetchDatagatewayIntradayKline('600519.SH', 'A', 240, { fetchImpl, now: new Date('2026-08-27T01:40:00Z') });
    expect(result?.bars).toEqual([
      { time: '2026-08-27 09:31', open: 100, high: 102, low: 100, close: 102, volume: 100 },
      { time: '2026-08-27 09:32', open: 101, high: 101, low: 101, close: 101, volume: 0 },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://gateway.example.com/v1/market-data/intraday/underlyings/query');
    expect(JSON.parse(String(init.body))).toMatchObject({ symbols: ['600519.SH'], depth: 1, purpose: 'execution_backtest' });
  });

  it('probes the previous calendar day when today has no rows', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'secret';
    process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = 'true';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], missing: [{ symbol: '600519.SH', reason: 'no_historical_rows' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
        { symbol: '600519.SH', timestamp: '2026-08-26T01:31:05Z', last_price: 100, cumulative_volume: 10 },
      ], missing: [] }), { status: 200 }));
    const result = await fetchDatagatewayIntradayKline('600519.SH', 'A', 240, { fetchImpl, now: new Date('2026-08-27T01:40:00Z') });
    expect(result?.bars).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as [URL, RequestInit])[1].body)).start).toBe('2026-08-26T00:00:00Z');
  });

  it('maps capability denials to a provider failure for the fallback chain', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'secret';
    process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = 'true';
    await expect(fetchDatagatewayIntradayKline('600519.SH', 'A', 240, {
      fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
    })).rejects.toMatchObject({ kind: 'not_found', status: 403, retryable: false });
  });

  it('ignores invalid ticks and clamps cumulative-volume resets', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'secret';
    process.env.DATAGATEWAY_INTRADAY_KLINE_ENABLED = 'true';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { symbol: '600519.SH', timestamp: '2026-08-27T01:31:05Z', last_price: 100, cumulative_volume: 100 },
      { symbol: '600519.SH', timestamp: '2026-08-27T01:31:25Z', last_price: 99, cumulative_volume: 90 },
      { symbol: '600519.SH', timestamp: '2026-08-27T01:32:05Z', last_price: null, cumulative_volume: 200 },
    ] }), { status: 200 }));
    const result = await fetchDatagatewayIntradayKline('600519.SH', 'A', 240, { fetchImpl, now: new Date('2026-08-27T01:40:00Z') });
    expect(result?.bars).toEqual([{ time: '2026-08-27 09:31', open: 100, high: 100, low: 99, close: 99, volume: 0 }]);
  });
});
