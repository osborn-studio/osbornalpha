import { describe, expect, it } from 'vitest';
import { parseWatchlistDeleteScope } from './commands';

describe('watchlist commands', () => {
  it('requires an explicit group or all-lists scope for deletion', () => {
    expect(parseWatchlistDeleteScope(new Request('https://example.com/api/watchlist/AAPL'))).toBeNull();
    expect(parseWatchlistDeleteScope(new Request('https://example.com/api/watchlist/AAPL?watchlist_id=wl-1')))
      .toEqual({ kind: 'group', watchlistId: 'wl-1' });
    expect(parseWatchlistDeleteScope(new Request('https://example.com/api/watchlist/AAPL?scope=all')))
      .toEqual({ kind: 'all' });
  });
});
