import { describe, expect, it, vi } from 'vitest';
import {
  beginWatchlistBulkWorkflowRun,
  finishWatchlistBulkWorkflowRun,
  watchlistBulkWorkflowFingerprint,
} from './bulk-workflow-run-repository';

const command = {
  operation: 'research' as const,
  requestId: 'request-123',
  tickers: ['AAPL', 'NVDA'],
};
const result = {
  requestId: 'request-123', operation: 'research' as const, total: 1,
  succeeded: 1, unchanged: 0, conflicted: 0, failed: 0,
  results: [{ key: 'AAPL', status: 'succeeded' as const }],
};

describe('Watchlist bulk workflow run repository', () => {
  it('fingerprints command content without coupling it to the request id', () => {
    expect(watchlistBulkWorkflowFingerprint(command)).toBe(
      watchlistBulkWorkflowFingerprint({ ...command, requestId: 'request-456' }),
    );
    expect(watchlistBulkWorkflowFingerprint(command)).not.toBe(
      watchlistBulkWorkflowFingerprint({ ...command, tickers: ['AAPL'] }),
    );
  });

  it('claims a bounded server lease and parses replayed results', async () => {
    const acquired = { rpc: vi.fn(async () => ({
      data: { state: 'acquired', runId: 'run-1', leaseToken: 'lease-1' }, error: null,
    })) };
    await expect(beginWatchlistBulkWorkflowRun(acquired, command)).resolves.toEqual({
      state: 'acquired', runId: 'run-1', leaseToken: 'lease-1',
    });
    expect(acquired.rpc).toHaveBeenCalledWith('begin_watchlist_bulk_workflow', expect.objectContaining({
      p_request_id: 'request-123', p_operation: 'research', p_lease_minutes: 5,
    }));

    const replay = { rpc: vi.fn(async () => ({
      data: { state: 'replay', runId: 'run-1', result }, error: null,
    })) };
    await expect(beginWatchlistBulkWorkflowRun(replay, command)).resolves.toEqual({
      state: 'replay', runId: 'run-1', result,
    });
  });

  it('finishes only the lease held by the current request', async () => {
    const db = { rpc: vi.fn(async () => ({ data: true, error: null })) };
    await finishWatchlistBulkWorkflowRun(db, 'run-1', 'lease-1', result);
    expect(db.rpc).toHaveBeenCalledWith('finish_watchlist_bulk_workflow', {
      p_run_id: 'run-1', p_lease_token: 'lease-1', p_result: result,
    });
  });
});
