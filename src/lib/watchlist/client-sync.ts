import { parseWatchlistGroups, type WatchlistGroup } from './store';

export const WATCHLIST_PENDING_STORAGE_KEY = 'stock-monitor:watchlist-pending:v1';

export function watchlistPendingStorageKey(ownerId: string): string {
  return `${WATCHLIST_PENDING_STORAGE_KEY}:${ownerId}`;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface WatchlistSyncQueueOptions {
  storage: StorageLike;
  storageKey?: string;
  put: (groups: WatchlistGroup[]) => Promise<WatchlistGroup[] | null>;
  applyCanonical: (groups: WatchlistGroup[]) => void;
}

export function createWatchlistSyncQueue({
  storage,
  storageKey = WATCHLIST_PENDING_STORAGE_KEY,
  put,
  applyCanonical,
}: WatchlistSyncQueueOptions) {
  let activeFlush: Promise<boolean> | null = null;

  function hasPending(): boolean {
    return storage.getItem(storageKey) !== null;
  }

  function flush(): Promise<boolean> {
    if (activeFlush) return activeFlush;

    activeFlush = (async () => {
      while (true) {
        const pendingRaw = storage.getItem(storageKey);
        if (pendingRaw === null) return true;

        let pending: WatchlistGroup[] | null;
        try {
          pending = parseWatchlistGroups(pendingRaw);
        } catch {
          storage.removeItem(storageKey);
          return true;
        }
        if (pending === null) {
          storage.removeItem(storageKey);
          return true;
        }

        let canonical: WatchlistGroup[] | null;
        try {
          canonical = await put(pending);
        } catch {
          return false;
        }
        if (canonical === null) return false;

        // A user may edit again while this request is in flight. In that case,
        // skip the stale response and continue with the newest durable snapshot.
        if (storage.getItem(storageKey) !== pendingRaw) continue;

        storage.removeItem(storageKey);
        applyCanonical(canonical);
        return true;
      }
    })().finally(() => {
      activeFlush = null;
    });

    return activeFlush;
  }

  function enqueue(groups: WatchlistGroup[]): Promise<boolean> {
    storage.setItem(storageKey, JSON.stringify(groups));
    return flush();
  }

  return { enqueue, flush, hasPending };
}
