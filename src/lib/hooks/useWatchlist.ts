'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveInitialWatchlist,
  subscribeToWatchlist,
  writeLocalWatchlist,
  type WatchlistGroup,
} from '@/lib/watchlist/store';
import { isDefaultWatchlist } from '@/lib/watchlist/sync';

const SYNC_DEBOUNCE_MS = 600;

/**
 * Server-first watchlist (W1 data-loss fix), same return signature as v1.
 *
 * Mount: paint from localStorage immediately, then reconcile with the server —
 *   server has data → server wins (write-through to localStorage);
 *   server empty + local is user data (≠ mock defaults) → one-time migration
 *   PUT rescues the local pool onto the server;
 *   signed out / Supabase unconfigured / offline → localStorage mode as before.
 * Writes: optimistic localStorage + debounced PUT; PUT failures are silent
 *   (local copy survives, next mount retries the reconcile).
 */
export function useWatchlist() {
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const local = resolveInitialWatchlist();
    setGroups(local);
    setHydrated(true);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/watchlist/sync');
        if (!res.ok || cancelled) return; // 401 guest → stay local
        const j = await res.json();
        if (j?.mode !== 'server' || cancelled) return;
        const server = (j.groups ?? []) as WatchlistGroup[];
        if (server.length > 0) {
          writeLocalWatchlist(server); // dispatches change event → setGroups below
        } else if (!isDefaultWatchlist(local)) {
          const put = await fetch('/api/watchlist/sync', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ groups: local }),
          });
          if (put.ok && !cancelled) {
            const pj = await put.json();
            if (Array.isArray(pj?.groups)) writeLocalWatchlist(pj.groups);
          }
        }
      } catch {
        // offline / network error → localStorage mode
      }
    })();

    const unsubscribe = subscribeToWatchlist((next) => {
      setGroups(next);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  const persistGroups = useCallback((next: WatchlistGroup[]) => {
    setGroups(next);
    setHydrated(true);
    writeLocalWatchlist(next);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      fetch('/api/watchlist/sync', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groups: next }),
      }).catch((e) => console.warn('watchlist sync failed (kept locally):', e?.message));
    }, SYNC_DEBOUNCE_MS);
  }, []);

  return { groups, hydrated, setGroups: persistGroups };
}
