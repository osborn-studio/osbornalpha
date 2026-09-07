import { describe, expect, it } from 'vitest';
import {
  clearWatchlistBulkPendingRequest,
  createWatchlistBulkPendingRequest,
  loadWatchlistBulkPendingRequest,
  retryWatchlistBulkCommand,
  saveWatchlistBulkPendingRequest,
  watchlistBulkCommandPayload,
  watchlistBulkPendingStorageKey,
} from './bulk-workflow-client';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('retryWatchlistBulkCommand', () => {
  it('serializes shared review settings into each HTTP target', () => {
    expect(watchlistBulkCommandPayload({
      operation: 'review', targets: [{ itemId: 'one', expectedVersion: 2 }],
      action: 'snooze', reviewAt: '2026-10-01T00:00:00.000Z',
    })).toEqual({
      operation: 'review', targets: [{
        itemId: 'one', expectedVersion: 2, action: 'snooze', reviewAt: '2026-10-01T00:00:00.000Z',
      }],
    });
  });

  it('keeps only retryable failed research targets', () => {
    expect(retryWatchlistBulkCommand(
      { operation: 'research', tickers: ['AAPL', 'NVDA', 'MSFT'] },
      {
        requestId: 'request-123', operation: 'research', total: 3, succeeded: 1, unchanged: 0, conflicted: 0, failed: 2,
        results: [
          { key: 'AAPL', status: 'succeeded' },
          { key: 'NVDA', status: 'failed', retryable: true },
          { key: 'MSFT', status: 'failed', retryable: false },
        ],
      },
    )).toEqual({ operation: 'research', tickers: ['NVDA'] });
  });

  it('rebases review conflicts onto the returned version', () => {
    expect(retryWatchlistBulkCommand(
      { operation: 'review', targets: [{ itemId: 'one', expectedVersion: 2 }], action: 'complete', reviewAt: null },
      {
        requestId: 'request-123', operation: 'review', total: 1, succeeded: 0, unchanged: 0, conflicted: 1, failed: 0,
        results: [{ key: 'one', status: 'conflict', retryable: true, value: { decision_version: 4 } }],
      },
    )).toEqual({
      operation: 'review', targets: [{ itemId: 'one', expectedVersion: 4 }], action: 'complete', reviewAt: null,
    });
  });

  it('returns null when no failed item is retryable', () => {
    expect(retryWatchlistBulkCommand(
      { operation: 'alert', itemIds: ['one'], rule: { alertType: 'price' } },
      {
        requestId: 'request-123', operation: 'alert', total: 1, succeeded: 0, unchanged: 1, conflicted: 0, failed: 0,
        results: [{ key: 'one', status: 'unchanged', retryable: false }],
      },
    )).toBeNull();
  });
});

describe('durable Watchlist bulk requests', () => {
  it('round-trips a pending request inside an owner-specific storage scope', () => {
    const storage = memoryStorage();
    const pending = createWatchlistBulkPendingRequest(
      { operation: 'research', tickers: ['AAPL', 'NVDA'] },
      new Date('2026-09-05T10:00:00.000Z'),
      'request-123',
    );
    saveWatchlistBulkPendingRequest(storage, 'user-1', pending);

    expect(watchlistBulkPendingStorageKey('user-1')).not.toBe(watchlistBulkPendingStorageKey('user-2'));
    expect(loadWatchlistBulkPendingRequest(
      storage,
      'user-1',
      new Date('2026-09-05T10:05:00.000Z'),
    )).toEqual(pending);
    expect(loadWatchlistBulkPendingRequest(storage, 'user-2')).toBeNull();
  });

  it('removes invalid or expired pending requests instead of replaying them', () => {
    const storage = memoryStorage();
    storage.setItem(watchlistBulkPendingStorageKey('user-1'), JSON.stringify({
      version: 1,
      requestId: 'request-123',
      command: { operation: 'research', tickers: ['AAPL'] },
      createdAt: '2026-09-03T09:00:00.000Z',
    }));

    expect(loadWatchlistBulkPendingRequest(
      storage,
      'user-1',
      new Date('2026-09-05T10:00:00.000Z'),
    )).toBeNull();
    expect(storage.getItem(watchlistBulkPendingStorageKey('user-1'))).toBeNull();
  });

  it('only clears the request that reached a terminal response', () => {
    const storage = memoryStorage();
    const now = new Date();
    const pending = createWatchlistBulkPendingRequest(
      { operation: 'research', tickers: ['AAPL'] },
      now,
      'request-123',
    );
    saveWatchlistBulkPendingRequest(storage, 'user-1', pending);

    clearWatchlistBulkPendingRequest(storage, 'user-1', 'request-456');
    expect(loadWatchlistBulkPendingRequest(
      storage,
      'user-1',
      now,
    )).toEqual(pending);
    clearWatchlistBulkPendingRequest(storage, 'user-1', 'request-123');
    expect(loadWatchlistBulkPendingRequest(
      storage,
      'user-1',
      now,
    )).toBeNull();
  });
});
