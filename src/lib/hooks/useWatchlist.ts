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
import { isDefaultWatchlist } from '@/lib/watchlist/sync';
import { trackEvent } from '@/lib/analytics/client';

type WatchlistSyncQueue = ReturnType<typeof createWatchlistSyncQueue>;

const browserSyncQueues = new Map<string, WatchlistSyncQueue>();

function getBrowserSyncQueue(ownerId: string) {
  if (typeof window === 'undefined') return null;
  const existing = browserSyncQueues.get(ownerId);
  if (existing) return existing;

  const queue = createWatchlistSyncQueue({
    storage: window.localStorage,
    storageKey: watchlistPendingStorageKey(ownerId),
    put: async (groups) => {
      const response = await fetch('/api/watchlist/sync', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groups }),
      });
      if (!response.ok) return null;
      const body = await response.json();
      if (body?.ownerId !== ownerId || !Array.isArray(body?.groups)) return null;
      return parseWatchlistGroups(JSON.stringify(body.groups));
    },
    applyCanonical: writeLocalWatchlist,
  });

  browserSyncQueues.set(ownerId, queue);
  return queue;
}

async function fetchServerWatchlist() {
  const response = await fetch('/api/watchlist/sync');
  if (!response.ok) return null;
  const body = await response.json();
  if (body?.mode !== 'server' || typeof body?.ownerId !== 'string' || !Array.isArray(body?.groups)) {
    return null;
  }
  const groups = parseWatchlistGroups(JSON.stringify(body.groups));
  return groups === null ? null : { ownerId: body.ownerId, groups };
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
  const syncQueue = useRef<WatchlistSyncQueue | null>(null);

  useEffect(() => {
    let local = resolveInitialWatchlist();
    setGroups(local);

    let cancelled = false;
    (async () => {
      try {
        let server = await fetchServerWatchlist();
        if (!server || cancelled) return; // guest / local mode → stay local

        const ownerId = server.ownerId;
        const queue = getBrowserSyncQueue(ownerId);
        syncQueue.current = queue;
        if (queue?.hasPending()) {
          const flushed = await queue.flush();
          if (!flushed || cancelled) return;
          local = resolveInitialWatchlist();
          server = await fetchServerWatchlist();
          if (!server || server.ownerId !== ownerId || cancelled) return;
        }

        if (server.groups.length > 0) {
          writeLocalWatchlist(server.groups); // dispatches change event → setGroups below
        } else if (!isDefaultWatchlist(local)) {
          await queue?.enqueue(local);
        }
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
    syncQueue.current?.enqueue(next).then((saved) => {
      if (!saved) console.warn('watchlist sync failed (kept locally)');
    }).catch((error) => {
      console.warn('watchlist sync failed (kept locally):', error instanceof Error ? error.message : error);
    });
  }, [hydrated]);

  return { groups, hydrated, setGroups: persistGroups };
}
