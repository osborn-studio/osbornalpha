import { describe, expect, it } from 'vitest';
import {
  normalizeReferrer,
  safeHeader,
  sanitizeEventMetadata,
  sanitizeEventName,
} from './sanitize';

describe('analytics sanitization', () => {
  it('removes secret-shaped keys recursively and caps strings', () => {
    expect(sanitizeEventMetadata({
      ticker: 'AAPL',
      api_key: 'should-not-survive',
      nested: {
        accessToken: 'hidden',
        note: 'x'.repeat(600),
      },
      rows: [{ refresh_token: 'hidden' }, { source: 'watchlist' }],
    })).toEqual({
      ticker: 'AAPL',
      nested: { note: 'x'.repeat(500) },
      rows: [{}, { source: 'watchlist' }],
    });
  });

  it('caps arrays and drops unsupported values', () => {
    const result = sanitizeEventMetadata({
      values: Array.from({ length: 60 }, (_, index) => index),
      callback: () => 'ignored',
    });

    expect(result.values).toEqual(Array.from({ length: 50 }, (_, index) => index));
    expect(result).not.toHaveProperty('callback');
  });

  it('keeps only origin and pathname from referrers', () => {
    expect(normalizeReferrer('https://www.osbornalpha.com/watchlist?q=secret#section'))
      .toBe('https://www.osbornalpha.com/watchlist');
    expect(normalizeReferrer('not a URL')).toBeNull();
  });

  it('length-limits request headers', () => {
    expect(safeHeader('a'.repeat(800), 500)).toHaveLength(500);
    expect(safeHeader('   ')).toBeNull();
  });

  it('accepts stable event names and rejects malformed names', () => {
    expect(sanitizeEventName('watchlist_viewed')).toBe('watchlist_viewed');
    expect(sanitizeEventName('bad event name')).toBeNull();
    expect(sanitizeEventName('x'.repeat(81))).toBeNull();
    expect(sanitizeEventName(null)).toBeNull();
  });
});
