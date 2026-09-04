import { describe, expect, it } from 'vitest';
import { normalizeWatchlistRating, WATCHLIST_ALERT_CATALOG } from './alert-catalog';

describe('watchlist alert catalog', () => {
  it.each([
    ['Strong Buy', 'buy'],
    ['跑赢行业', 'buy'],
    ['Equal-Weight', 'hold'],
    ['中性', 'hold'],
    ['Underperform', 'sell'],
    ['减持', 'sell'],
    ['unclassified', null],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeWatchlistRating(raw)).toBe(expected);
  });

  it('publishes only event kinds produced by the calendar domain', () => {
    expect(WATCHLIST_ALERT_CATALOG.values.event).toContain('earnings_announce');
    expect(WATCHLIST_ALERT_CATALOG.values.event).toContain('share_unlock');
  });
});
