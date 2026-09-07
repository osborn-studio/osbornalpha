import { describe, expect, it } from 'vitest';
import { buildWatchlistOverviewClientQuery } from './overview-client-query';
import { DEFAULT_WATCHLIST_TABLE_PREFERENCES } from './ui-preferences';

const groups = [{ id: 'group-1', name: 'Core', tickers: ['AAPL'] }];

describe('buildWatchlistOverviewClientQuery', () => {
  it('returns no query when disabled or no server-backed behavior is active', () => {
    expect(buildWatchlistOverviewClientQuery(false, groups, DEFAULT_WATCHLIST_TABLE_PREFERENCES, '')).toBeNull();
    expect(buildWatchlistOverviewClientQuery(true, groups, {
      ...DEFAULT_WATCHLIST_TABLE_PREFERENCES,
      sortKey: 'quality',
    }, '')).toBeNull();
  });

  it('normalizes filters and resolves a legacy group name to its id', () => {
    expect(buildWatchlistOverviewClientQuery(true, groups, {
      ...DEFAULT_WATCHLIST_TABLE_PREFERENCES,
      sortKey: 'relativeStrengthRank',
      asc: false,
      groupFilter: 'Core',
      marketFilter: 'US',
      statusFilter: 'stale',
      decisionFilter: 'watching',
      tagFilter: ' core ',
      historyRange: '6m',
      metricFilter: 'liquidityPercentile',
      metricMin: 70,
      metricMax: 100,
    }, ' apple ')).toEqual({
      sort: 'relativeStrengthRank',
      direction: 'desc',
      groupId: 'group-1',
      market: 'US',
      quoteStatus: 'stale',
      query: 'apple',
      decisionStatus: 'watching',
      tag: 'core',
      historyRange: '6m',
      metric: 'liquidityPercentile',
      metricMin: 70,
      metricMax: 100,
    });
  });

  it('does not send unsupported loading status or thresholds without a metric', () => {
    expect(buildWatchlistOverviewClientQuery(true, groups, {
      ...DEFAULT_WATCHLIST_TABLE_PREFERENCES,
      sortKey: 'ticker',
      statusFilter: 'loading',
      metricMin: 10,
      metricMax: 20,
    }, '')).toMatchObject({
      quoteStatus: null,
      metric: null,
      metricMin: null,
      metricMax: null,
    });
  });

  it('does not compare raw currency metrics until one market is selected', () => {
    expect(buildWatchlistOverviewClientQuery(true, groups, {
      ...DEFAULT_WATCHLIST_TABLE_PREFERENCES,
      sortKey: 'averageTradedAmount20',
      metricFilter: 'averageTradedAmount20',
      metricMin: 1_000_000,
    }, '')).toBeNull();

    expect(buildWatchlistOverviewClientQuery(true, groups, {
      ...DEFAULT_WATCHLIST_TABLE_PREFERENCES,
      sortKey: 'averageTradedAmount20',
      marketFilter: 'US',
      metricFilter: 'averageTradedAmount20',
      metricMin: 1_000_000,
    }, '')).toMatchObject({
      sort: 'averageTradedAmount20',
      market: 'US',
      metric: 'averageTradedAmount20',
      metricMin: 1_000_000,
    });
  });
});
