import { describe, expect, it } from 'vitest';
import { pageItems, parseWatchlistOverviewPage } from './overview-pagination';

describe('watchlist overview pagination', () => {
  it('normalizes invalid values and caps the page size', () => {
    expect(parseWatchlistOverviewPage(new URL('https://example.test?offset=-1&limit=500')))
      .toEqual({ offset: 0, limit: 50 });
    expect(parseWatchlistOverviewPage(new URL('https://example.test?offset=20&limit=25')))
      .toEqual({ offset: 20, limit: 25 });
  });

  it('reports whether additional rows remain', () => {
    expect(pageItems([1, 2, 3, 4], { offset: 1, limit: 2 }))
      .toEqual({ values: [2, 3], hasMore: true });
    expect(pageItems([1, 2, 3, 4], { offset: 3, limit: 2 }))
      .toEqual({ values: [4], hasMore: false });
  });
});
