import { describe, expect, it, vi } from 'vitest';
import {
  parseWatchlistBulkWorkflowCommand,
  parseWatchlistBulkWorkflowResult,
  runWatchlistBatch,
  summarizeWatchlistBulkWorkflow,
} from './bulk-workflow';

describe('Watchlist bulk workflow', () => {
  it('normalizes and deduplicates research targets', () => {
    expect(parseWatchlistBulkWorkflowCommand({
      operation: 'research', requestId: 'request-123', tickers: ['aapl', ' AAPL ', '600519.sh'],
    })).toEqual({
      operation: 'research', requestId: 'request-123', tickers: ['AAPL', '600519.SH'],
    });
  });

  it('reuses the alert and review validators', () => {
    expect(parseWatchlistBulkWorkflowCommand({
      operation: 'alert', requestId: 'request-123', itemIds: ['one', 'two'],
      rule: { alertType: 'price', operator: 'gt', threshold: 100, cooldownMinutes: 60 },
    })).toMatchObject({ operation: 'alert', itemIds: ['one', 'two'], rule: { alert_type: 'price', threshold_numeric: 100 } });
    expect(parseWatchlistBulkWorkflowCommand({
      operation: 'review', requestId: 'request-123',
      targets: [{ itemId: 'one', action: 'complete', expectedVersion: 2 }],
    })).toMatchObject({ operation: 'review', targets: [{ itemId: 'one', command: { action: 'complete', expectedVersion: 2 } }] });
  });

  it('rejects oversized or malformed batches', () => {
    expect(parseWatchlistBulkWorkflowCommand({ operation: 'research', requestId: 'short', tickers: ['AAPL'] })).toBeNull();
    expect(parseWatchlistBulkWorkflowCommand({
      operation: 'research', requestId: 'request-123', tickers: Array.from({ length: 21 }, (_, index) => `T${index}`),
    })).toBeNull();
  });

  it('preserves input order while limiting concurrency', async () => {
    let active = 0;
    let maximum = 0;
    const worker = vi.fn(async (value: number) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    await expect(runWatchlistBatch([1, 2, 3, 4], worker, 2)).resolves.toEqual([2, 4, 6, 8]);
    expect(maximum).toBe(2);
  });

  it('summarizes partial results without losing per-target errors', () => {
    const command = { operation: 'research' as const, requestId: 'request-123', tickers: ['AAPL', 'NVDA'] };
    expect(summarizeWatchlistBulkWorkflow(command, [
      { key: 'AAPL', status: 'succeeded' },
      { key: 'NVDA', status: 'failed', code: 'rate_limited', retryable: true },
    ])).toMatchObject({ total: 2, succeeded: 1, failed: 1, unchanged: 0, conflicted: 0 });
  });

  it('validates response counters against item results', () => {
    const response = {
      requestId: 'request-123', operation: 'research', total: 1,
      succeeded: 1, unchanged: 0, conflicted: 0, failed: 0,
      results: [{ key: 'AAPL', status: 'succeeded', value: { id: 'job-1' } }],
    };
    expect(parseWatchlistBulkWorkflowResult(response)).toEqual(response);
    expect(parseWatchlistBulkWorkflowResult({ ...response, failed: 1 })).toBeNull();
  });

  it('round-trips structured quota details without flattening provider metadata', () => {
    const response = {
      requestId: 'request-123', operation: 'research', total: 1,
      succeeded: 0, unchanged: 0, conflicted: 0, failed: 1,
      results: [{
        key: 'AAPL', status: 'failed', code: 'watchlist_research_plan_limit', retryable: false,
        details: { quota: { used: 10, limit: 10, plan: 'free' } },
      }],
    };
    expect(parseWatchlistBulkWorkflowResult(response)).toEqual(response);
  });
});
