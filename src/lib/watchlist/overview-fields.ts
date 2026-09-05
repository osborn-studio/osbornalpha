export const WATCHLIST_OVERVIEW_QUERY_SORTS = [
  'position', 'ticker', 'name', 'group', 'price', 'change', 'open', 'prevClose',
  'dayRange', 'volume', 'amount', 'marketCap', 'pe', 'pb', 'turnover',
  'volumeRatio', 'amplitude', 'dayPosition', 'oneYearReturn', 'volatility',
  'maxDrawdown', 'rangePosition', 'rsi14', 'macdHistogram',
  'bollingerPosition', 'atr14', 'excessReturn', 'beta', 'volumeZScore20',
  'research', 'decision', 'freshness',
] as const;

export type WatchlistOverviewQuerySort = typeof WATCHLIST_OVERVIEW_QUERY_SORTS[number];

import { WATCHLIST_METRIC_KEYS, type WatchlistMetricKey } from './metric-registry';

export const WATCHLIST_OVERVIEW_METRICS: readonly WatchlistMetricKey[] = WATCHLIST_METRIC_KEYS;

export type WatchlistOverviewMetric = WatchlistMetricKey;

export const WATCHLIST_OVERVIEW_QUOTE_STATUSES = [
  'live', 'delayed', 'stale', 'unavailable',
] as const;

export type WatchlistOverviewQuoteStatus = typeof WATCHLIST_OVERVIEW_QUOTE_STATUSES[number];
