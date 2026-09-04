import type { WatchlistItem } from '@/lib/supabase/database.types';

/** States that represent an actively monitored item. Paused and invalidated
 * items remain visible for history, but must not consume research or alert work. */
export const WATCHLIST_MONITORED_STATUSES = [
  'inbox', 'researching', 'watching', 'ready',
] as const satisfies ReadonlyArray<WatchlistItem['status']>;

export type MonitoredWatchlistItemStatus = typeof WATCHLIST_MONITORED_STATUSES[number];

export function isMonitoredWatchlistItemStatus(
  status: WatchlistItem['status'] | string | null | undefined,
): status is MonitoredWatchlistItemStatus {
  return typeof status === 'string'
    && (WATCHLIST_MONITORED_STATUSES as readonly string[]).includes(status);
}
