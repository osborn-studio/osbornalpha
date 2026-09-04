import { describe, expect, it } from 'vitest';
import { aggregateWatchlistOperations, parseWatchlistOperationCommand } from './watchlist-operations';

const run = {
  id: 'run-1', status: 'succeeded' as const, started_at: '2026-09-04T11:59:00Z',
  finished_at: '2026-09-04T12:00:00Z', duration_ms: 60_000, evaluated: 10,
  triggered: 1, unavailable: 0, delivery_claimed: 1, delivery_delivered: 1,
  delivery_failed: 0, delivery_dead_letter: 0, delivery_skipped: 0,
  delivery_deferred: 0, saturated: false, error: null,
};

describe('watchlist operations aggregate', () => {
  it('reports a recent successful run with no dead letters as healthy', () => {
    expect(aggregateWatchlistOperations({
      now: '2026-09-04T12:10:00Z', alertRuns: [run],
      eventCounts: { pending: 2, processing: 0, failed: 0, dead_letter: 0 },
      researchDue: 3, researchFailed: 0,
    })).toMatchObject({ status: 'healthy', alerts: { backlog: 2, latestRunAgeMinutes: 10 } });
  });

  it('reports stale runs, large backlogs, or dead letters as degraded', () => {
    expect(aggregateWatchlistOperations({
      now: '2026-09-04T13:00:00Z', alertRuns: [run],
      eventCounts: { pending: 0, processing: 0, failed: 1, dead_letter: 1 },
      researchDue: 0, researchFailed: 2,
    }).status).toBe('degraded');
  });
});

describe('watchlist operation commands', () => {
  it('parses bounded delivery and research commands', () => {
    expect(parseWatchlistOperationCommand({ action: 'retry_dead_letter', limit: 25 })).toMatchObject({
      action: 'retry_dead_letter', limit: 25, tickers: [],
    });
    expect(parseWatchlistOperationCommand({
      action: 'retry_failed_research', tickers: ['aapl', 'AAPL', '0700.HK'],
    })?.tickers).toEqual(['AAPL', '0700.HK']);
  });

  it('rejects broad or mismatched commands', () => {
    expect(parseWatchlistOperationCommand({ action: 'retry_dead_letter', limit: 501 })).toBeNull();
    expect(parseWatchlistOperationCommand({ action: 'retry_failed_delivery', tickers: ['AAPL'] })).toBeNull();
    expect(parseWatchlistOperationCommand({ action: 'release_stale_processing', olderThanMinutes: 5 })).toBeNull();
  });
});
