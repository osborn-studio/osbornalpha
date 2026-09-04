import { describe, expect, it } from 'vitest';
import { nextWatchlistResearchRefresh } from './research-refresh-repository';

describe('watchlist research refresh scheduling', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('uses long success, shorter partial, and bounded exponential failure delays', () => {
    expect(nextWatchlistResearchRefresh(now, 'complete', 0)).toBe('2026-09-05T00:00:00.000Z');
    expect(nextWatchlistResearchRefresh(now, 'partial', 0)).toBe('2026-09-04T15:00:00.000Z');
    expect(nextWatchlistResearchRefresh(now, 'failed', 1)).toBe('2026-09-04T12:30:00.000Z');
    expect(nextWatchlistResearchRefresh(now, 'failed', 99)).toBe('2026-09-04T18:00:00.000Z');
  });
});
