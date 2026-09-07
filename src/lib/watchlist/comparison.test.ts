import { describe, expect, it } from 'vitest';
import {
  buildWatchlistComparisonContext,
  normalizeWatchlistComparisonTickers,
  watchlistComparisonMetricIssue,
  watchlistComparisonValueRoles,
  WATCHLIST_COMPARISON_METRICS,
} from './comparison';

describe('Watchlist comparison model', () => {
  it('normalizes, deduplicates and bounds selected securities', () => {
    expect(normalizeWatchlistComparisonTickers([' aapl ', 'AAPL', 'nvda', 'msft'], 2)).toEqual(['AAPL', 'NVDA']);
  });

  it('keeps every comparison metric in a named section', () => {
    expect(WATCHLIST_COMPARISON_METRICS.length).toBeGreaterThan(10);
    expect(WATCHLIST_COMPARISON_METRICS.every((metric) => !!metric.group)).toBe(true);
  });

  it('surfaces currency, market, industry, benchmark, and freshness boundaries', () => {
    const context = buildWatchlistComparisonContext([
      { ticker: 'AAPL', currency: 'USD', market: 'US', status: 'live' },
      { ticker: '0700.HK', currency: 'HKD', market: 'HK', status: 'stale' },
    ] as never, {
      AAPL: { identity: { industry: 'Technology' }, history: { value: { benchmarkTicker: 'SPY' } } },
      '0700.HK': { identity: { industry: 'Communication' }, history: { value: { benchmarkTicker: '2800.HK' } } },
    } as never);

    expect(context.issues).toEqual([
      'mixedCurrency', 'mixedMarket', 'mixedIndustry', 'differentBenchmarks', 'staleData',
    ]);
    expect(watchlistComparisonMetricIssue(
      WATCHLIST_COMPARISON_METRICS.find((metric) => metric.key === 'marketCap')!,
      context,
    )).toBe('mixedCurrency');
  });

  it('marks extrema only for metrics with an explicit preferred direction', () => {
    const periodReturn = WATCHLIST_COMPARISON_METRICS.find((metric) => metric.key === 'periodReturn')!;
    const volatility = WATCHLIST_COMPARISON_METRICS.find((metric) => metric.key === 'volatility')!;
    const pe = WATCHLIST_COMPARISON_METRICS.find((metric) => metric.key === 'pe')!;
    expect(watchlistComparisonValueRoles(periodReturn, [4, null, -2])).toEqual(['best', 'neutral', 'worst']);
    expect(watchlistComparisonValueRoles(volatility, [20, 15, 30])).toEqual(['neutral', 'best', 'worst']);
    expect(watchlistComparisonValueRoles(pe, [10, 20])).toEqual(['neutral', 'neutral']);
  });
});
