import { describe, expect, it } from 'vitest';
import {
  parseWatchlistReviewAction,
  parseWatchlistReviewQueue,
  parseWatchlistReviewQuery,
  watchlistReviewBucket,
} from './review-workflow';

const active = { status: 'watching' as const };
const now = new Date('2026-09-04T16:00:00.000Z');

describe('watchlist review workflow', () => {
  it('classifies active review dates in the user timezone', () => {
    expect(watchlistReviewBucket({ ...active, review_at: '2026-09-03T00:00:00Z' }, now, 'America/Los_Angeles')).toBe('overdue');
    expect(watchlistReviewBucket({ ...active, review_at: '2026-09-04T00:00:00Z' }, now, 'America/Los_Angeles')).toBe('due_today');
    expect(watchlistReviewBucket({ ...active, review_at: '2026-09-10T00:00:00Z' }, now, 'America/Los_Angeles')).toBe('upcoming');
    expect(watchlistReviewBucket({ ...active, review_at: '2026-10-10T00:00:00Z' }, now, 'America/Los_Angeles')).toBe('scheduled');
    expect(watchlistReviewBucket({ ...active, review_at: null }, now, 'America/Los_Angeles')).toBe('unscheduled');
    expect(watchlistReviewBucket({ status: 'paused', review_at: '2026-09-03T00:00:00Z' }, now)).toBe('inactive');
  });

  it('validates completion and snooze actions', () => {
    expect(parseWatchlistReviewAction({ action: 'complete', expectedVersion: 2 }, now)).toEqual({
      action: 'complete', expectedVersion: 2, reviewAt: null,
    });
    expect(parseWatchlistReviewAction({ action: 'snooze', expectedVersion: 2, reviewAt: '2026-09-12' }, now)).toMatchObject({
      action: 'snooze', expectedVersion: 2, reviewAt: '2026-09-12T00:00:00.000Z',
    });
    expect(parseWatchlistReviewAction({ action: 'snooze', expectedVersion: 2, reviewAt: '2026-09-01' }, now)).toBeNull();
  });

  it('parses bounded queue filters', () => {
    expect(parseWatchlistReviewQuery(new URL('https://example.test?scope=upcoming&horizonDays=14&limit=80'))).toEqual({
      scope: 'upcoming', horizonDays: 14, limit: 80,
    });
    expect(parseWatchlistReviewQuery(new URL('https://example.test?scope=unknown'))).toBeNull();
    expect(parseWatchlistReviewQuery(new URL('https://example.test?horizonDays=90'))).toBeNull();
  });

  it('parses the database queue contract without trusting malformed rows', () => {
    const value = {
      generated_at: now.toISOString(), timezone: 'America/Los_Angeles', horizon_days: 7,
      summary: { overdue: 1, due_today: 2, upcoming: 3, unscheduled: 4 },
      rows: [{
        group: { id: 'group-1', name: 'Core', description: null, sort_order: 0 },
        item: { id: 'item-1', ticker: 'AAPL' }, identity: null, review_bucket: 'overdue',
      }],
    };
    expect(parseWatchlistReviewQueue(value)).toMatchObject({ summary: { overdue: 1 }, rows: [{ reviewBucket: 'overdue' }] });
    expect(parseWatchlistReviewQueue({ ...value, rows: [{ item: null }] })).toBeNull();
  });
});
