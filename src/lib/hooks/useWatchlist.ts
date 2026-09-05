'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseWatchlistGroups,
  resolveInitialWatchlist,
  subscribeToWatchlist,
  writeLocalWatchlist,
  type WatchlistGroup,
} from '@/lib/watchlist/store';
import { createWatchlistSyncQueue, watchlistPendingStorageKey } from '@/lib/watchlist/client-sync';
import { isDefaultWatchlist, mergeWatchlistGroups, type VersionedWatchlistSnapshot, type WatchlistSyncRequest } from '@/lib/watchlist/sync';
import { trackEvent } from '@/lib/analytics/client';
import { watchlistJsonRequest, watchlistJsonResult } from '@/lib/watchlist/api-client';

type WatchlistSyncQueue = ReturnType<typeof createWatchlistSyncQueue>;
export type WatchlistSyncStatus = 'local' | 'syncing' | 'synced' | 'conflict' | 'error';

function parseServerSnapshot(body: unknown): VersionedWatchlistSnapshot | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.ownerId !== 'string'
    || !Number.isSafeInteger(candidate.version)
    || Number(candidate.version) < 0
    || !Array.isArray(candidate.groups)) return null;
  const groups = parseWatchlistGroups(JSON.stringify(candidate.groups));
  return groups === null
    ? null
    : { ownerId: candidate.ownerId, version: Number(candidate.version), groups };
}

function getBrowserSyncQueue(
  ownerId: string,
  callbacks: {
    onConflict: (snapshot: VersionedWatchlistSnapshot) => void;
    onError: () => void;
  },
) {
  if (typeof window === 'undefined') return null;

  const queue = createWatchlistSyncQueue({
    storage: window.localStorage,
    storageKey: watchlistPendingStorageKey(ownerId),
    put: async (request: WatchlistSyncRequest) => {
      const result = await watchlistJsonResult<unknown>('/api/watchlist/sync', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }, 'watchlist_sync_failed');
      const snapshot = parseServerSnapshot(result.body);
      if (!snapshot || snapshot.ownerId !== ownerId) return null;
      if (!result.ok) return result.status === 409 ? { status: 'conflict' as const, snapshot } : null;
      return { status: 'saved' as const, snapshot };
    },
    applyCanonical: writeLocalWatchlist,
    onConflict: callbacks.onConflict,
    onError: callbacks.onError,
  });
  return queue;
}

async function fetchServerWatchlist() {
  const body = await watchlistJsonRequest<Record<string, unknown>>('/api/watchlist/sync', undefined, 'watchlist_sync_unavailable')
    .catch(() => null);
  if (body?.mode !== 'server') return null;
  return parseServerSnapshot(body);
}

/**
 * Server-first watchlist (W1 data-loss fix), same return signature as v1.
 *
 * Mount: paint from localStorage immediately, then reconcile with the server —
 *   pending local write → flush it before any server read;
 *   server has data → server wins (write-through to localStorage);
 *   server empty + local is user data (≠ mock defaults) → one-time migration
 *   PUT rescues the local pool onto the server;
 *   signed out / Supabase unconfigured / offline → localStorage mode as before.
 * Writes: optimistic localStorage + durable pending snapshot + immediate PUT.
 *   Navigation cannot cancel the save; failures retry on the next mount.
 */
export function useWatchlist() {
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<WatchlistSyncStatus>('local');
  const [conflictSnapshot, setConflictSnapshot] = useState<VersionedWatchlistSnapshot | null>(null);
  const [serverVersion, setServerVersion] = useState(0);
  const syncQueue = useRef<WatchlistSyncQueue | null>(null);
  const ownerIdRef = useRef<string | null>(null);

  useEffect(() => {
    let local = resolveInitialWatchlist();
    setGroups(local);

    let cancelled = false;
    (async () => {
      try {
        let server = await fetchServerWatchlist();
        if (!server || cancelled) return; // guest / local mode → stay local

        const ownerId = server.ownerId;
        const queue = getBrowserSyncQueue(ownerId, {
          onConflict: (snapshot) => {
            setConflictSnapshot(snapshot);
            setSyncStatus('conflict');
          },
          onError: () => setSyncStatus('error'),
        });
        ownerIdRef.current = server.ownerId;
        syncQueue.current = queue;
        queue?.setServerSnapshot(server);
        setServerVersion(server.version);
        if (queue?.hasPending()) {
          setSyncStatus('syncing');
          const flushed = await queue.flush();
          if (!flushed || cancelled) return;
          local = resolveInitialWatchlist();
          server = await fetchServerWatchlist();
          if (!server || server.ownerId !== ownerId || cancelled) return;
        }

        if (server.groups.length > 0) {
          writeLocalWatchlist(server.groups); // dispatches change event → setGroups below
        } else if (!isDefaultWatchlist(local)) {
          setSyncStatus('syncing');
          const saved = await queue?.enqueue(local);
          if (!saved || cancelled) return;
        }
        if (!cancelled) setSyncStatus('synced');
      } catch {
        // offline / network error → localStorage mode
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    const unsubscribe = subscribeToWatchlist((next) => {
      setGroups(next);
    });
    return () => {
      cancelled = true;
      ownerIdRef.current = null;
      syncQueue.current = null;
      unsubscribe();
    };
  }, []);

  const persistGroups = useCallback((next: WatchlistGroup[]) => {
    if (!hydrated) return;
    trackEvent('watchlist_changed', {
      groups: next.length,
      tickers: next.reduce((sum, g) => sum + g.tickers.length, 0),
    });
    setGroups(next);
    writeLocalWatchlist(next);
    if (syncQueue.current) setSyncStatus('syncing');
    syncQueue.current?.enqueue(next).then((saved) => {
      if (saved) setSyncStatus('synced');
      else console.warn('watchlist sync failed (kept locally)');
    }).catch((error) => {
      console.warn('watchlist sync failed (kept locally):', error instanceof Error ? error.message : error);
    });
  }, [hydrated]);

  const resolveSyncConflict = useCallback((strategy: 'server' | 'local' | 'merge') => {
    const queue = syncQueue.current;
    const conflict = conflictSnapshot;
    if (!queue || !conflict) return;
    if (strategy === 'server') {
      queue.acceptCanonical(conflict);
      setGroups(conflict.groups);
      setServerVersion(conflict.version);
      setConflictSnapshot(null);
      setSyncStatus('synced');
      return;
    }
    if (strategy === 'merge') {
      const merged = mergeWatchlistGroups(groups, conflict.groups, queue.getPendingBaseGroups());
      queue.discardPending();
      queue.setServerSnapshot(conflict);
      writeLocalWatchlist(merged);
      setGroups(merged);
      setConflictSnapshot(null);
      setSyncStatus('syncing');
      queue.enqueue(merged).then((saved) => {
        if (saved) setSyncStatus('synced');
      });
      return;
    }
    if (!queue.rebasePending(conflict.version, conflict.groups)) return;
    setConflictSnapshot(null);
    setSyncStatus('syncing');
    queue.flush().then((saved) => {
      if (saved) setSyncStatus('synced');
    });
  }, [conflictSnapshot, groups]);

  const applyServerSnapshot = useCallback((snapshot: VersionedWatchlistSnapshot): boolean => {
    const queue = syncQueue.current;
    if (!queue || ownerIdRef.current !== snapshot.ownerId) return false;
    queue.acceptCanonical(snapshot);
    setServerVersion(snapshot.version);
    setGroups(snapshot.groups);
    setConflictSnapshot(null);
    setSyncStatus('synced');
    return true;
  }, []);

  return {
    groups,
    hydrated,
    setGroups: persistGroups,
    syncStatus,
    conflictSnapshot,
    serverVersion,
    resolveSyncConflict,
    applyServerSnapshot,
  };
}
