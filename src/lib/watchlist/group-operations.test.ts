import { describe, expect, it } from 'vitest';
import type { WatchlistGroup } from './store';
import {
  moveTickerBetweenWatchlistGroups,
  moveTickerWithinWatchlistGroup,
  reorderWatchlistGroups,
} from './group-operations';

const groups: WatchlistGroup[] = [
  { id: 'a', name: 'A', tickers: ['AAPL', 'MSFT'] },
  { id: 'b', name: 'B', tickers: ['NVDA'] },
];

describe('Watchlist group operations', () => {
  it('moves a ticker between groups without duplication', () => {
    expect(moveTickerBetweenWatchlistGroups(groups, 'AAPL', 'a', 'b')).toEqual([
      { id: 'a', name: 'A', tickers: ['MSFT'] },
      { id: 'b', name: 'B', tickers: ['NVDA', 'AAPL'] },
    ]);
    expect(moveTickerBetweenWatchlistGroups(groups, 'AAPL', 'a', 'missing')).toBe(groups);
  });

  it('reorders groups and tickers with stable no-op references', () => {
    expect(reorderWatchlistGroups(groups, 'a', 'b').map((group) => group.id)).toEqual(['b', 'a']);
    expect(reorderWatchlistGroups(groups, 'a', 'a')).toBe(groups);
    expect(moveTickerWithinWatchlistGroup(groups, 'a', 'MSFT', 'up')[0].tickers).toEqual(['MSFT', 'AAPL']);
    expect(moveTickerWithinWatchlistGroup(groups, 'a', 'AAPL', 'up')).toBe(groups);
  });
});
