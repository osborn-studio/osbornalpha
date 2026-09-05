import { describe, expect, it, vi } from 'vitest';
import { calculateHistoricalWatchlistMetrics } from './analytics';
import { refreshWatchlistMetricSnapshot } from './metric-snapshot-service';

const claimed = {
  ticker: 'AAPL', market: 'US' as const, history_range: '1y' as const, benchmark_ticker: 'SPY',
  status: 'running' as const, failure_count: 0, last_attempt_at: null, last_success_at: null,
  next_refresh_at: '2026-09-04T00:00:00.000Z', lease_expires_at: null, last_error: null,
  updated_at: '2026-09-04T00:00:00.000Z',
};

describe('refreshWatchlistMetricSnapshot', () => {
  it('reuses the shared calculator with total return and persists one canonical snapshot', async () => {
    const metricValue = calculateHistoricalWatchlistMetrics([
      { time: 1, close: 100, high: 101, low: 99 },
      { time: 2, close: 102, high: 103, low: 100 },
    ], { market: 'US', benchmarkTicker: 'SPY' });
    const build = vi.fn(async () => ({
      AAPL: {
        ticker: 'AAPL', market: null,
        history: { value: metricValue, asOf: '2026-09-04T00:00:00.000Z', source: 'test', status: 'fresh' as const, warnings: [] },
      },
    }));
    const persist = vi.fn(async () => undefined);
    await refreshWatchlistMetricSnapshot({}, claimed, { build, persist }, new Date('2026-09-04T12:00:00.000Z'));

    expect(build).toHaveBeenCalledWith(['AAPL'], 'en', {
      includeMarket: false, benchmarkTicker: 'SPY', historyRange: '1y', includeTotalReturn: true,
    });
    expect(persist).toHaveBeenCalledWith({}, expect.objectContaining({
      ticker: 'AAPL', benchmark_ticker: 'SPY', metrics: metricValue,
    }));
  });

  it('does not overwrite the last-known-good row when calculation is unavailable', async () => {
    const persist = vi.fn(async () => undefined);
    await expect(refreshWatchlistMetricSnapshot({}, claimed, {
      build: vi.fn(async () => ({ AAPL: {
        ticker: 'AAPL', market: null,
        history: { value: null, asOf: null, source: null, status: 'unavailable' as const, warnings: ['failed'] },
      } })),
      persist,
    })).rejects.toThrow('watchlist_metric_snapshot_unavailable');
    expect(persist).not.toHaveBeenCalled();
  });
});
