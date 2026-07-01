'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  resolveInitialWatchlist,
  subscribeToWatchlist,
  type WatchlistGroup,
  writeLocalWatchlist,
} from '@/lib/watchlist/store';

export function useWatchlist() {
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setGroups(resolveInitialWatchlist());
    setHydrated(true);
    return subscribeToWatchlist((next) => {
      setGroups(next);
      setHydrated(true);
    });
  }, []);

  const persistGroups = useCallback((next: WatchlistGroup[]) => {
    setGroups(next);
    setHydrated(true);
    writeLocalWatchlist(next);
  }, []);

  return { groups, hydrated, setGroups: persistGroups };
}
