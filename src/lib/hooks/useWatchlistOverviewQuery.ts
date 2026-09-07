'use client';

import { useMemo } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import type { WatchlistOverviewClientQuery } from '@/lib/watchlist/overview-query';
import { buildWatchlistOverviewClientQuery } from '@/lib/watchlist/overview-client-query';
import type { WatchlistGroup } from '@/lib/watchlist/store';
import type { WatchlistTablePreferences } from '@/lib/watchlist/ui-preferences';

export interface WatchlistOverviewQueryModel {
  query: WatchlistOverviewClientQuery | null;
  pending: boolean;
}

export function useWatchlistOverviewQuery(
  enabled: boolean,
  groups: WatchlistGroup[],
  table: WatchlistTablePreferences,
): WatchlistOverviewQueryModel {
  const normalizedQuery = table.query.trim();
  const debouncedQuery = useDebouncedValue(normalizedQuery, 250);

  return useMemo(() => ({
    query: buildWatchlistOverviewClientQuery(enabled, groups, table, debouncedQuery),
    pending: enabled && normalizedQuery !== debouncedQuery,
  }), [debouncedQuery, enabled, groups, normalizedQuery, table]);
}
