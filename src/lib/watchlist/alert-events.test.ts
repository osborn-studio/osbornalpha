import { describe, expect, it } from 'vitest';
import { isWatchlistAlertRetryPatch, parseWatchlistAlertEventQuery, parseWatchlistAlertReadPatch } from './alert-events';

describe('watchlist alert event contracts', () => {
  it('bounds list size and accepts item/unread filters', () => {
    const parsed = parseWatchlistAlertEventQuery(new URL('https://example.test?limit=999&unread=1&itemId=item-1'));
    expect(parsed).toEqual({ limit: 200, unreadOnly: true, itemId: 'item-1' });
  });

  it('parses read state without accepting truthy substitutes', () => {
    expect(parseWatchlistAlertReadPatch({ read: true })).toEqual({ read: true });
    expect(parseWatchlistAlertReadPatch({ read: false })).toEqual({ read: false });
    expect(parseWatchlistAlertReadPatch({ read: 1 })).toBeNull();
  });

  it('accepts only an explicit standalone retry operation', () => {
    expect(isWatchlistAlertRetryPatch({ retry: true })).toBe(true);
    expect(isWatchlistAlertRetryPatch({ retry: true, read: true })).toBe(false);
    expect(isWatchlistAlertRetryPatch({ retry: 1 })).toBe(false);
  });
});
