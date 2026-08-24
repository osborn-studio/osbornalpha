import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_PENDING_STORAGE_KEY,
  createWatchlistSyncQueue,
  watchlistPendingStorageKey,
  type StorageLike,
} from './client-sync';
import type { WatchlistGroup } from './store';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('watchlist client sync queue', () => {
  it('uses a separate pending key for each signed-in account', () => {
    expect(watchlistPendingStorageKey('user-a')).not.toBe(watchlistPendingStorageKey('user-b'));
    expect(watchlistPendingStorageKey('user-a')).toContain(WATCHLIST_PENDING_STORAGE_KEY);
  });

  it('persists a pending snapshot before starting the network save', async () => {
    const storage = new MemoryStorage();
    const request = deferred<WatchlistGroup[] | null>();
    const snapshot = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const queue = createWatchlistSyncQueue({
      storage,
      put: () => request.promise,
      applyCanonical: () => {},
    });

    const saving = queue.enqueue(snapshot);

    expect(JSON.parse(storage.getItem(WATCHLIST_PENDING_STORAGE_KEY)!)).toEqual(snapshot);
    request.resolve(snapshot);
    await expect(saving).resolves.toBe(true);
  });

  it('does not let an older response overwrite a newer snapshot', async () => {
    const storage = new MemoryStorage();
    const firstRequest = deferred<WatchlistGroup[] | null>();
    const secondRequest = deferred<WatchlistGroup[] | null>();
    const sent: WatchlistGroup[][] = [];
    const applied: WatchlistGroup[][] = [];
    const first = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const second = [{ id: 'mine', name: 'Mine', tickers: ['NVDA', 'AAPL'] }];
    const queue = createWatchlistSyncQueue({
      storage,
      put: (groups) => {
        sent.push(groups);
        return sent.length === 1 ? firstRequest.promise : secondRequest.promise;
      },
      applyCanonical: (groups) => applied.push(groups),
    });

    const firstSave = queue.enqueue(first);
    const secondSave = queue.enqueue(second);
    firstRequest.resolve([{ id: 'server-id', name: 'Mine', tickers: ['NVDA'] }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toEqual([first, second]);
    expect(applied).toEqual([]);
    expect(JSON.parse(storage.getItem(WATCHLIST_PENDING_STORAGE_KEY)!)).toEqual(second);

    const canonicalSecond = [{ id: 'server-id', name: 'Mine', tickers: ['NVDA', 'AAPL'] }];
    secondRequest.resolve(canonicalSecond);

    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([true, true]);
    expect(applied).toEqual([canonicalSecond]);
    expect(storage.getItem(WATCHLIST_PENDING_STORAGE_KEY)).toBeNull();
  });

  it('keeps a failed snapshot for retry after navigation or reload', async () => {
    const storage = new MemoryStorage();
    const snapshot = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const queue = createWatchlistSyncQueue({
      storage,
      put: async () => null,
      applyCanonical: () => {},
    });

    await expect(queue.enqueue(snapshot)).resolves.toBe(false);
    expect(queue.hasPending()).toBe(true);
    expect(JSON.parse(storage.getItem(WATCHLIST_PENDING_STORAGE_KEY)!)).toEqual(snapshot);
  });

  it('discards a malformed pending record so server reconciliation can continue', async () => {
    const storage = new MemoryStorage();
    storage.setItem(WATCHLIST_PENDING_STORAGE_KEY, '{not-json');
    const queue = createWatchlistSyncQueue({
      storage,
      put: async (groups) => groups,
      applyCanonical: () => {},
    });

    await expect(queue.flush()).resolves.toBe(true);
    expect(queue.hasPending()).toBe(false);
  });

  it('supports an explicit empty snapshot instead of restoring demo defaults', async () => {
    const storage = new MemoryStorage();
    const applied: WatchlistGroup[][] = [];
    const queue = createWatchlistSyncQueue({
      storage,
      put: async (groups) => groups,
      applyCanonical: (groups) => applied.push(groups),
    });

    await expect(queue.enqueue([])).resolves.toBe(true);
    expect(applied).toEqual([[]]);
    expect(storage.getItem(WATCHLIST_PENDING_STORAGE_KEY)).toBeNull();
  });
});
