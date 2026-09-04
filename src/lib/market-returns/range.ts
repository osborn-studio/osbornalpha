import type { KlineRange } from '@/lib/chart/kline';
import type { WatchlistHistoryRange } from './types';

export const WATCHLIST_HISTORY_RANGES = ['1m', '6m', 'ytd', '1y', '5y', 'all'] as const satisfies readonly WatchlistHistoryRange[];

export function watchlistHistoryRangeForChart(range: KlineRange): WatchlistHistoryRange {
  return range === '1d' || range === '5d' ? '1m' : range;
}

export function parseWatchlistHistoryRange(value: string | null): WatchlistHistoryRange | null {
  return value && (WATCHLIST_HISTORY_RANGES as readonly string[]).includes(value)
    ? value as WatchlistHistoryRange
    : null;
}
