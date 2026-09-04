import { describe, expect, it } from 'vitest';
import { parseRestoreWatchlistTrashCommand } from './trash';

describe('watchlist trash restore command', () => {
  it('requires optimistic concurrency and an idempotency key', () => {
    expect(parseRestoreWatchlistTrashCommand({ expectedVersion: 3, mutationId: 'restore-1234' }))
      .toEqual({ expectedVersion: 3, mutationId: 'restore-1234' });
    expect(parseRestoreWatchlistTrashCommand({ expectedVersion: -1, mutationId: 'restore-1234' })).toBeNull();
    expect(parseRestoreWatchlistTrashCommand({ expectedVersion: 3, mutationId: 'short' })).toBeNull();
  });
});
