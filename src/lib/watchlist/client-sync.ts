import { parseWatchlistGroups, type WatchlistGroup } from './store';
import type { VersionedWatchlistSnapshot, WatchlistSyncRequest } from './sync';

export const WATCHLIST_PENDING_STORAGE_KEY = 'stock-monitor:watchlist-pending:v2';

export function watchlistPendingStorageKey(ownerId: string): string {
  return `${WATCHLIST_PENDING_STORAGE_KEY}:${ownerId}`;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type PendingWatchlistSnapshot = WatchlistSyncRequest;

export type WatchlistSaveResult =
  | { status: 'saved'; snapshot: VersionedWatchlistSnapshot }
  | { status: 'conflict'; snapshot: VersionedWatchlistSnapshot };

interface WatchlistSyncQueueOptions {
  storage: StorageLike;
  storageKey?: string;
  put: (request: WatchlistSyncRequest) => Promise<WatchlistSaveResult | null>;
  applyCanonical: (groups: WatchlistGroup[]) => void;
  onConflict?: (snapshot: VersionedWatchlistSnapshot) => void;
  onError?: () => void;
  createMutationId?: () => string;
}

function parsePending(raw: string | null, fallbackVersion: number, createMutationId: () => string) {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Migrate the v1 queue, which stored the groups array directly.
    if (Array.isArray(parsed)) {
      const groups = parseWatchlistGroups(raw);
      return groups === null
        ? null
        : { groups, expectedVersion: fallbackVersion, mutationId: createMutationId() };
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const groups = parseWatchlistGroups(JSON.stringify(candidate.groups));
    if (groups === null
      || !Number.isSafeInteger(candidate.expectedVersion)
      || Number(candidate.expectedVersion) < 0
      || typeof candidate.mutationId !== 'string'
      || candidate.mutationId.length < 8) return null;
    return {
      groups,
      expectedVersion: Number(candidate.expectedVersion),
      mutationId: candidate.mutationId,
    };
  } catch {
    return null;
  }
}

export function createWatchlistSyncQueue({
  storage,
  storageKey = WATCHLIST_PENDING_STORAGE_KEY,
  put,
  applyCanonical,
  onConflict,
  onError,
  createMutationId = () => crypto.randomUUID(),
}: WatchlistSyncQueueOptions) {
  let activeFlush: Promise<boolean> | null = null;
  let serverVersion = 0;

  function setServerVersion(version: number) {
    if (Number.isSafeInteger(version) && version >= 0) serverVersion = version;
  }

  function hasPending(): boolean {
    return storage.getItem(storageKey) !== null;
  }

  function flush(): Promise<boolean> {
    if (activeFlush) return activeFlush;

    activeFlush = (async () => {
      while (true) {
        const pendingRaw = storage.getItem(storageKey);
        if (pendingRaw === null) return true;
        const pending = parsePending(pendingRaw, serverVersion, createMutationId);
        if (pending === null) {
          storage.removeItem(storageKey);
          return true;
        }
        const normalizedRaw = JSON.stringify(pending);
        if (normalizedRaw !== pendingRaw) storage.setItem(storageKey, normalizedRaw);

        let result: WatchlistSaveResult | null;
        try {
          result = await put(pending);
        } catch {
          onError?.();
          return false;
        }
        if (result === null) {
          onError?.();
          return false;
        }
        if (result.status === 'conflict') {
          serverVersion = result.snapshot.version;
          onConflict?.(result.snapshot);
          return false;
        }

        serverVersion = result.snapshot.version;
        const latestRaw = storage.getItem(storageKey);
        if (latestRaw !== normalizedRaw) {
          const latest = parsePending(latestRaw, serverVersion, createMutationId);
          if (latest === null) {
            storage.removeItem(storageKey);
            return true;
          }
          storage.setItem(storageKey, JSON.stringify({ ...latest, expectedVersion: serverVersion }));
          continue;
        }

        storage.removeItem(storageKey);
        applyCanonical(result.snapshot.groups);
        return true;
      }
    })().finally(() => {
      activeFlush = null;
    });

    return activeFlush;
  }

  function enqueue(groups: WatchlistGroup[]): Promise<boolean> {
    const existing = parsePending(storage.getItem(storageKey), serverVersion, createMutationId);
    const pending: PendingWatchlistSnapshot = {
      groups,
      expectedVersion: existing?.expectedVersion ?? serverVersion,
      mutationId: createMutationId(),
    };
    storage.setItem(storageKey, JSON.stringify(pending));
    return flush();
  }

  function discardPending() {
    storage.removeItem(storageKey);
  }

  function rebasePending(version: number): boolean {
    const pending = parsePending(storage.getItem(storageKey), version, createMutationId);
    if (!pending) return false;
    setServerVersion(version);
    storage.setItem(storageKey, JSON.stringify({
      ...pending,
      expectedVersion: version,
      mutationId: createMutationId(),
    }));
    return true;
  }

  function acceptCanonical(snapshot: VersionedWatchlistSnapshot) {
    storage.removeItem(storageKey);
    setServerVersion(snapshot.version);
    applyCanonical(snapshot.groups);
  }

  return { enqueue, flush, hasPending, setServerVersion, discardPending, rebasePending, acceptCanonical };
}
