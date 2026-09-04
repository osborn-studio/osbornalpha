import { describe, expect, it } from 'vitest';
import { encodeWatchlistOverviewCursor, pageItems, parseWatchlistOverviewPage } from './overview-pagination';

describe('watchlist overview pagination', () => {
  it('normalizes invalid values and caps the page size', () => {
    expect(parseWatchlistOverviewPage(new URL('https://example.test?offset=-1&limit=500')))
      .toEqual({ offset: 0, limit: 50, cursor: null, invalidCursor: false });
    expect(parseWatchlistOverviewPage(new URL('https://example.test?offset=20&limit=25')))
      .toEqual({ offset: 20, limit: 25, cursor: null, invalidCursor: false });
  });

  it('round-trips an opaque keyset cursor and rejects malformed cursors', () => {
    const cursor = { groupSort: 2, itemSort: 8, itemId: '11111111-1111-5111-8111-111111111111' };
    const encoded = encodeWatchlistOverviewCursor(cursor);
    expect(parseWatchlistOverviewPage(new URL(`https://example.test?cursor=${encoded}&limit=20`)))
      .toEqual({ offset: null, limit: 20, cursor, invalidCursor: false });
    expect(parseWatchlistOverviewPage(new URL('https://example.test?cursor=%7Bbad')))
      .toMatchObject({ offset: null, cursor: null, invalidCursor: true });
  });

  it('reports whether additional rows remain', () => {
    expect(pageItems([1, 2, 3, 4], { offset: 1, limit: 2 }))
      .toEqual({ values: [2, 3], hasMore: true });
    expect(pageItems([1, 2, 3, 4], { offset: 3, limit: 2 }))
      .toEqual({ values: [4], hasMore: false });
  });
});
