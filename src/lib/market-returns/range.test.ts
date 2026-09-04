import { describe, expect, it } from 'vitest';
import { parseWatchlistHistoryRange, watchlistHistoryRangeForChart } from './range';

describe('watchlist history range', () => {
  it('uses a one-month risk window for intraday charts', () => {
    expect(watchlistHistoryRangeForChart('1d')).toBe('1m');
    expect(watchlistHistoryRangeForChart('5d')).toBe('1m');
    expect(watchlistHistoryRangeForChart('6m')).toBe('6m');
  });

  it('only accepts daily-and-longer analytics ranges', () => {
    expect(parseWatchlistHistoryRange('1y')).toBe('1y');
    expect(parseWatchlistHistoryRange('1d')).toBeNull();
    expect(parseWatchlistHistoryRange('bad')).toBeNull();
  });
});
