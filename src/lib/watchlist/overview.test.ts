import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveKline: vi.fn(),
  loadReturn: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: (callback: unknown) => callback,
}));
vi.mock('@/lib/data/kline/reliability', () => ({ resolveKline: mocks.resolveKline }));
vi.mock('@/lib/market-returns/service', () => ({ loadMarketReturnSnapshot: mocks.loadReturn }));

import { buildComputedWatchlistOverview } from './overview';

function bars(start: number) {
  return Array.from({ length: 30 }, (_, index) => ({
    time: Date.UTC(2026, 0, index + 1) / 1_000,
    open: start + index,
    high: start + index + 1,
    low: start + index - 1,
    close: start + index,
    volume: 1_000,
    previousClose: index === 0 ? null : start + index - 1,
    change: index === 0 ? null : 1,
    changePct: index === 0 ? null : 1,
  }));
}

function returnSnapshot(ticker: string, totalReturnPct: number) {
  return {
    ticker,
    market: 'US' as const,
    range: '6m' as const,
    source: 'yahoo-chart',
    currency: 'USD',
    priceReturnPct: totalReturnPct - 1,
    totalReturnPct,
    distributionContributionPct: 1,
    dividendCount: 2,
    splitCount: 0,
    coverageStart: '2026-01-01',
    coverageEnd: '2026-06-30',
    asOf: '2026-06-30',
    methodology: {
      priceBasis: 'unadjusted_close' as const,
      totalReturnBasis: 'adjusted_close_reinvestment' as const,
    },
    warnings: [],
  };
}

describe('buildComputedWatchlistOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveKline.mockImplementation(async ({ ticker, range }: { ticker: string; range: string }) => ({
      bars: bars(ticker === 'SPY' ? 200 : 100),
      source: 'test-kline',
      adjustment: 'none',
      fetchedAt: '2026-06-30T20:00:00.000Z',
      freshness: 'fresh',
      warnings: [],
      range,
    }));
    mocks.loadReturn.mockImplementation(async (ticker: string) => (
      ticker === 'SPY' ? returnSnapshot(ticker, 6) : returnSnapshot(ticker, 10)
    ));
  });

  it('uses the requested window and total-return snapshots for a targeted row', async () => {
    const result = await buildComputedWatchlistOverview(['AAPL'], 'en', {
      historyRange: '6m',
      includeTotalReturn: true,
    });

    expect(mocks.resolveKline).toHaveBeenCalledWith({ ticker: 'AAPL', range: '6m' });
    expect(mocks.resolveKline).toHaveBeenCalledWith({ ticker: 'SPY', range: '6m' });
    expect(mocks.loadReturn).toHaveBeenCalledWith('AAPL', '6m');
    expect(mocks.loadReturn).toHaveBeenCalledWith('SPY', '6m');
    expect(result.AAPL.history.value).toMatchObject({
      periodReturnPct: 9,
      totalReturnPct: 10,
      benchmarkTotalReturnPct: 6,
      excessTotalReturnPct: 4,
      methodology: { historyRange: '6m', priceReturnSource: 'yahoo-chart' },
    });
    expect(result.AAPL.history.warnings).toContain('total_return_adjusted_close');
  });

  it('does not call the total-return provider for a bulk overview', async () => {
    const result = await buildComputedWatchlistOverview(['AAPL', 'MSFT'], 'en');

    expect(mocks.loadReturn).not.toHaveBeenCalled();
    expect(result.AAPL.history.value?.methodology.historyRange).toBe('1y');
    expect(result.AAPL.history.warnings).toContain('total_return_unavailable');
  });
});
