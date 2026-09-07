import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchlistResearchJobRepositoryError } from './research-job-repository';
import { executeIdempotentWatchlistBulkWorkflow, executeWatchlistBulkWorkflow } from './bulk-workflow-service';

const dependencies = {
  enqueueResearch: vi.fn(),
  createAlert: vi.fn(),
  executeReview: vi.fn(),
};

describe('executeWatchlistBulkWorkflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns partial research results and preserves rate-limit retryability', async () => {
    dependencies.enqueueResearch
      .mockResolvedValueOnce({
        id: 'job-1', ticker: 'AAPL', status: 'queued', stage: 'queued', progress: 0,
        error_code: null, result: null, created_at: '2026-09-05T00:00:00Z', next_attempt_at: '2026-09-05T00:00:00Z',
      })
      .mockRejectedValueOnce(new WatchlistResearchJobRepositoryError('watchlist_research_rate_limit'));
    const result = await executeWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'research', requestId: 'request-123', tickers: ['AAPL', 'NVDA'],
    }, dependencies);
    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(result.results[1]).toMatchObject({ key: 'NVDA', code: 'rate_limited', retryable: true });
  });

  it('treats duplicate alert rules as idempotent unchanged results', async () => {
    dependencies.createAlert
      .mockResolvedValueOnce({ data: { id: 'alert-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } });
    const result = await executeWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'alert', requestId: 'request-123', itemIds: ['one', 'two'],
      rule: { alert_type: 'price', operator: 'gt', threshold_numeric: 100, config: {}, enabled: true, cooldown_minutes: 1440 },
    }, dependencies);
    expect(result).toMatchObject({ succeeded: 1, unchanged: 1, failed: 0 });
  });

  it('reports review conflicts while recognizing an already-applied snooze', async () => {
    const reviewAt = '2026-10-01T00:00:00.000Z';
    dependencies.executeReview
      .mockResolvedValueOnce({ status: 'conflict', currentItem: { id: 'one', review_at: reviewAt } })
      .mockResolvedValueOnce({ status: 'conflict', currentItem: { id: 'two', review_at: null } });
    const command = { action: 'snooze' as const, expectedVersion: 1, reviewAt };
    const result = await executeWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'review', requestId: 'request-123', targets: [
        { itemId: 'one', command }, { itemId: 'two', command },
      ],
    }, dependencies);
    expect(result).toMatchObject({ unchanged: 1, conflicted: 1, failed: 0 });
  });

  it('returns partial failures when alert or review workers throw', async () => {
    dependencies.createAlert
      .mockResolvedValueOnce({ data: { id: 'alert-1' }, error: null })
      .mockRejectedValueOnce(new Error('offline'));
    const alerts = await executeWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'alert', requestId: 'request-123', itemIds: ['one', 'two'],
      rule: { alert_type: 'price', operator: 'gt', threshold_numeric: 100, config: {}, enabled: true, cooldown_minutes: 1440 },
    }, dependencies);
    expect(alerts).toMatchObject({ succeeded: 1, failed: 1 });

    dependencies.executeReview
      .mockResolvedValueOnce({ status: 'updated', item: { id: 'one' } })
      .mockRejectedValueOnce(new Error('offline'));
    const reviews = await executeWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'review', requestId: 'request-123', targets: [
        { itemId: 'one', command: { action: 'complete', expectedVersion: 1, reviewAt: null } },
        { itemId: 'two', command: { action: 'complete', expectedVersion: 1, reviewAt: null } },
      ],
    }, dependencies);
    expect(reviews).toMatchObject({ succeeded: 1, failed: 1 });
  });

  it('replays durable results without executing item workers again', async () => {
    const replay = {
      requestId: 'request-123', operation: 'research' as const, total: 1,
      succeeded: 1, unchanged: 0, conflicted: 0, failed: 0,
      results: [{ key: 'AAPL', status: 'succeeded' as const }],
    };
    const idempotency = {
      begin: vi.fn(async () => ({ state: 'replay' as const, runId: 'run-1', result: replay })),
      finish: vi.fn(),
      execute: vi.fn(),
    };
    await expect(executeIdempotentWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'research', requestId: 'request-123', tickers: ['AAPL'],
    }, idempotency as never)).resolves.toEqual(replay);
    expect(idempotency.execute).not.toHaveBeenCalled();
    expect(idempotency.finish).not.toHaveBeenCalled();
  });

  it('persists an acquired result before returning it', async () => {
    const value = {
      requestId: 'request-123', operation: 'research' as const, total: 1,
      succeeded: 1, unchanged: 0, conflicted: 0, failed: 0,
      results: [{ key: 'AAPL', status: 'succeeded' as const }],
    };
    const idempotency = {
      begin: vi.fn(async () => ({ state: 'acquired' as const, runId: 'run-1', leaseToken: 'lease-1' })),
      execute: vi.fn(async () => value),
      finish: vi.fn(async () => undefined),
    };
    await expect(executeIdempotentWatchlistBulkWorkflow({} as never, 'user-1', {
      operation: 'research', requestId: 'request-123', tickers: ['AAPL'],
    }, idempotency as never)).resolves.toEqual(value);
    expect(idempotency.finish).toHaveBeenCalledWith({}, 'run-1', 'lease-1', value);
  });
});
