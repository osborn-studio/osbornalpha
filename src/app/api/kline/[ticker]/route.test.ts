import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@/lib/data/kline/reliability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/kline/reliability')>();
  return { ...actual, resolveKline: mocks.resolve };
});

import { KlineResolutionError } from '@/lib/data/kline/reliability';
import { GET } from './route';

const ctx = (ticker: string) => ({ params: Promise.resolve({ ticker }) });
const minuteBars = [{ time: '2026-08-10 09:30:00', open: 10, high: 12, low: 9, close: 11, volume: 100 }];

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    source: 'eastmoney',
    bars: minuteBars,
    adjustment: 'intraday',
    volumeUnit: 'shares',
    previousClose: 9,
    availableBars: 40,
    warmupCloses: [],
    asOfFallback: '2026-08-10 09:30:00',
    freshness: 'fresh',
    fallbackUsed: false,
    cacheStatus: 'shared-swr',
    completeness: 'partial',
    partial: false,
    warnings: ['partial_coverage'],
    fetchedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/kline/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue(resolution());
  });

  it('maps the public 1D range to the reliability layer and complete metadata', async () => {
    const response = await GET(new Request('https://example.test/api/kline/NVDA?range=1d'), ctx('NVDA'));
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith({ ticker: 'NVDA', range: '1d' });
    const body = await response.json();
    expect(body.meta).toMatchObject({
      range: '1d',
      interval: 'minute',
      granularity: '1m',
      timezone: 'America/New_York',
      source: 'eastmoney',
      adjustment: 'intraday',
      freshness: 'fresh',
      cacheStatus: 'shared-swr',
      completeness: 'partial',
      market: 'US',
      currency: '$',
      currencyCode: 'USD',
      volumeUnit: 'shares',
      rangeBasis: 'trading-sessions',
      requestedBars: 390,
      returnedBars: 1,
      availableBars: 40,
      missingBars: 350,
    });
    expect(body.bars[0].time).toBe(Date.UTC(2026, 7, 10, 9, 30) / 1000);
    expect(body.bars[0]).toMatchObject({ previousClose: 9, change: 2 });
    expect(body.bars[0].changePct).toBeCloseTo(22.222222);
  });

  it('rejects invalid ranges and unsupported Taiwan intraday', async () => {
    expect((await GET(new Request('https://example.test/api/kline/NVDA?range=2y'), ctx('NVDA'))).status).toBe(400);
    const response = await GET(new Request('https://example.test/api/kline/2330.TW?range=1d'), ctx('2330.TW'));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe('intraday_unsupported');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['2330.TW', 'twse'],
    ['5483.TWO', 'tpex'],
  ])('supports one-year daily history for %s', async (ticker, source) => {
    mocks.resolve.mockResolvedValue(resolution({
      source,
      adjustment: 'none',
      bars: [{ ...minuteBars[0], time: '2026-08-08' }],
    }));
    const response = await GET(new Request(`https://example.test/api/kline/${ticker}?range=1y`), ctx(ticker));
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith({ ticker, range: '1y' });
    expect((await response.json()).meta.timezone).toBe('Asia/Taipei');
  });

  it('keeps degraded-but-usable data successful and auditable', async () => {
    mocks.resolve.mockResolvedValue(resolution({
      source: 'tencent',
      adjustment: 'qfq',
      fallbackUsed: true,
      warnings: ['fallback_used'],
    }));
    const response = await GET(new Request('https://example.test/api/kline/600519.SH?range=1m'), ctx('600519.SH'));
    expect(response.status).toBe(200);
    expect((await response.json()).meta).toMatchObject({ source: 'tencent', fallbackUsed: true, adjustment: 'qfq' });
  });

  it('reports Max cap semantics honestly for truncated and full history', async () => {
    // Truncated: the aggregated fallback hit the daily cap → partial + lower
    // bound on the missing months.
    mocks.resolve.mockResolvedValue(resolution({
      source: 'tencent',
      adjustment: 'none',
      availableBars: 60,
      completeness: 'partial',
      warnings: ['partial_coverage'],
      bars: [{ ...minuteBars[0], time: '2026-08-01' }],
    }));
    const truncated = await GET(new Request('https://example.test/api/kline/600519.SH?range=max'), ctx('600519.SH'));
    expect(truncated.status).toBe(200);
    expect((await truncated.json()).meta).toMatchObject({
      range: 'max', interval: 'month', granularity: '1mo', rangeBasis: 'calendar-window',
      requestedBars: 600, availableBars: 60, missingBars: 540, completeness: 'partial',
    });

    // Untruncated: the provider simply has fewer months than the probe cap.
    mocks.resolve.mockResolvedValue(resolution({
      source: 'eastmoney',
      adjustment: 'none',
      availableBars: 60,
      completeness: 'complete',
      warnings: [],
      bars: [{ ...minuteBars[0], time: '2026-08-01' }],
    }));
    const full = await GET(new Request('https://example.test/api/kline/NVDA?range=max'), ctx('NVDA'));
    expect(full.status).toBe(200);
    expect((await full.json()).meta).toMatchObject({
      range: 'max', requestedBars: 600, availableBars: 60, missingBars: 0, completeness: 'complete',
    });
  });

  it('parses the adjustment override and rejects invalid values', async () => {
    const bad = await GET(new Request('https://example.test/api/kline/600519.SH?range=1y&adjust=bfq'), ctx('600519.SH'));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_adjustment');
    expect(mocks.resolve).not.toHaveBeenCalled();

    const ok = await GET(new Request('https://example.test/api/kline/600519.SH?range=1y&adjust=hfq'), ctx('600519.SH'));
    expect(ok.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith({ ticker: '600519.SH', range: '1y', adjustment: 'hfq' });

    const untouched = await GET(new Request('https://example.test/api/kline/NVDA?range=1y'), ctx('NVDA'));
    expect(untouched.status).toBe(200);
    expect(mocks.resolve).toHaveBeenLastCalledWith({ ticker: 'NVDA', range: '1y', adjustment: undefined });
  });

  it.each([
    ['invalid_data', 502],
    ['provider_unavailable', 503],
  ] as const)('maps %s failures to HTTP %i', async (code, status) => {
    mocks.resolve.mockRejectedValue(new KlineResolutionError(code, status, 'internal detail'));
    const response = await GET(new Request('https://example.test/api/kline/NVDA?range=1m'), ctx('NVDA'));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code, ticker: 'NVDA', range: '1m', bars: [] });
  });

  it('does not expose upstream error details to clients', async () => {
    mocks.resolve.mockRejectedValue(new Error('internal upstream URL and credentials'));

    const response = await GET(new Request('https://example.test/api/kline/NVDA?range=3m'), ctx('NVDA'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'provider_unavailable', ticker: 'NVDA', range: '3m', bars: [] });
  });
});
