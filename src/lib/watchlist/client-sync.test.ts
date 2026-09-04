import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_PENDING_STORAGE_KEY,
  createWatchlistSyncQueue,
  watchlistPendingStorageKey,
  type StorageLike,
  type WatchlistSaveResult,
} from './client-sync';
import type { VersionedWatchlistSnapshot, WatchlistSyncRequest } from './sync';
import type { WatchlistGroup } from './store';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function versioned(groups: WatchlistGroup[], version: number): VersionedWatchlistSnapshot {
  return { ownerId: 'user-1', groups, version };
}

function saved(groups: WatchlistGroup[], version: number): WatchlistSaveResult {
  return { status: 'saved', snapshot: versioned(groups, version) };
}

function ids() {
  let next = 0;
  return () => `mutation-${++next}`;
}

describe('watchlist client sync queue', () => {
  it('uses a separate pending key for each signed-in account', () => {
    expect(watchlistPendingStorageKey('user-a')).not.toBe(watchlistPendingStorageKey('user-b'));
  });

  it('persists concurrency metadata before starting the network save', async () => {
    const storage = new MemoryStorage();
    const request = deferred<WatchlistSaveResult | null>();
    const groups = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const queue = createWatchlistSyncQueue({
      storage,
      put: () => request.promise,
      applyCanonical: () => {},
      createMutationId: ids(),
    });
    queue.setServerVersion(4);

    const saving = queue.enqueue(groups);
    expect(JSON.parse(storage.getItem(WATCHLIST_PENDING_STORAGE_KEY)!)).toEqual({
      groups,
      expectedVersion: 4,
      mutationId: 'mutation-1',
    });
    request.resolve(saved(groups, 5));
    await expect(saving).resolves.toBe(true);
  });

  it('rebases a newer local edit after the older response succeeds', async () => {
    const storage = new MemoryStorage();
    const firstRequest = deferred<WatchlistSaveResult | null>();
    const secondRequest = deferred<WatchlistSaveResult | null>();
    const sent: WatchlistSyncRequest[] = [];
    const applied: WatchlistGroup[][] = [];
    const first = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const second = [{ id: 'mine', name: 'Mine', tickers: ['NVDA', 'AAPL'] }];
    const queue = createWatchlistSyncQueue({
      storage,
      put: (request) => {
        sent.push(request);
        return sent.length === 1 ? firstRequest.promise : secondRequest.promise;
      },
      applyCanonical: (groups) => applied.push(groups),
      createMutationId: ids(),
    });

    const firstSave = queue.enqueue(first);
    const secondSave = queue.enqueue(second);
    firstRequest.resolve(saved([{ id: 'server-id', name: 'Mine', tickers: ['NVDA'] }], 1));
    await Promise.resolve();
    await Promise.resolve();

    expect(sent[0]).toMatchObject({ groups: first, expectedVersion: 0 });
    expect(sent[1]).toMatchObject({ groups: second, expectedVersion: 1 });
    expect(applied).toEqual([]);

    const canonical = [{ id: 'server-id', name: 'Mine', tickers: ['NVDA', 'AAPL'] }];
    secondRequest.resolve(saved(canonical, 2));
    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([true, true]);
    expect(applied).toEqual([canonical]);
  });

  it('keeps a failed snapshot for retry', async () => {
    const storage = new MemoryStorage();
    const groups = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const queue = createWatchlistSyncQueue({
      storage,
      put: async () => null,
      applyCanonical: () => {},
      createMutationId: ids(),
    });
    await expect(queue.enqueue(groups)).resolves.toBe(false);
    expect(queue.hasPending()).toBe(true);
  });

  it('preserves local data and exposes the canonical snapshot on conflict', async () => {
    const storage = new MemoryStorage();
    const local = [{ id: 'mine', name: 'Mine', tickers: ['NVDA'] }];
    const remote = versioned([{ id: 'remote', name: 'Remote', tickers: ['AAPL'] }], 8);
    let conflict: VersionedWatchlistSnapshot | null = null;
    const queue = createWatchlistSyncQueue({
      storage,
      put: async () => ({ status: 'conflict', snapshot: remote }),
      applyCanonical: () => {},
      onConflict: (snapshot) => { conflict = snapshot; },
      createMutationId: ids(),
    });

    await expect(queue.enqueue(local)).resolves.toBe(false);
    expect(queue.hasPending()).toBe(true);
    expect(conflict).toEqual(remote);
  });

  it('discards malformed pending data and supports an explicit empty list', async () => {
    const storage = new MemoryStorage();
    storage.setItem(WATCHLIST_PENDING_STORAGE_KEY, '{not-json');
    const applied: WatchlistGroup[][] = [];
    const queue = createWatchlistSyncQueue({
      storage,
      put: async (request) => saved(request.groups, 1),
      applyCanonical: (groups) => applied.push(groups),
      createMutationId: ids(),
    });
    await expect(queue.flush()).resolves.toBe(true);
    await expect(queue.enqueue([])).resolves.toBe(true);
    expect(applied).toEqual([[]]);
  });

  it('accepts an authoritative snapshot and clears an older pending edit', async () => {
    const storage = new MemoryStorage();
    const applied: WatchlistGroup[][] = [];
    const queue = createWatchlistSyncQueue({
      storage,
      put: async () => null,
      applyCanonical: (groups) => applied.push(groups),
      createMutationId: ids(),
    });
    storage.setItem(WATCHLIST_PENDING_STORAGE_KEY, JSON.stringify({
      groups: [{ id: 'old', name: 'Old', tickers: ['NVDA'] }],
      expectedVersion: 2,
      mutationId: 'mutation-old',
    }));
    const canonical = versioned([{ id: 'server', name: 'Imported', tickers: ['AAPL'] }], 7);

    queue.acceptCanonical(canonical);

    expect(queue.hasPending()).toBe(false);
    expect(applied).toEqual([canonical.groups]);
  });
});
