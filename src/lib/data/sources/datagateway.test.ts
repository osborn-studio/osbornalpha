import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  datagatewayConfig,
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
      apiKey: 'secret', dailyKlinePath: '/v1/market/kline/daily',
    });
  });

  it('maps supported market symbols without putting credentials in the URL', () => {
    const config = datagatewayConfig({ DATAGATEWAY_BASE_URL: 'https://gateway.example.com/api/', DATAGATEWAY_API_KEY: 'secret' })!;
    const url = datagatewayDailyKlineUrl(config, { ticker: '600519.sh', market: 'A', limit: 23, adjustment: 'qfq' })!;
    expect(url.toString()).toBe('https://gateway.example.com/v1/market/kline/daily?symbol=600519.SH&market=A&interval=1d&limit=23&adjustment=qfq');
    expect(url.toString()).not.toContain('secret');
    expect(datagatewayDailyKlineUrl(config, { ticker: '00700.HK', market: 'HK', limit: 23, adjustment: 'none' })?.searchParams.get('symbol')).toBe('0700.HK');
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

  it('sends Bearer authentication only in the server-to-server header', async () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://gateway.example.com';
    process.env.DATAGATEWAY_API_KEY = 'very-secret-key';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await fetchDatagatewayDailyKline('600519.SH', 'A', 23, 'qfq', { fetchImpl });

    expect(result?.source).toBe('datagateway');
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).not.toContain('very-secret-key');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer very-secret-key' }));
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
});
