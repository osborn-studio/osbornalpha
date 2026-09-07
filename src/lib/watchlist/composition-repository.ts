import type { WatchlistHistoryRange } from '@/lib/market-returns/types';
import { compositionEnvelope, type WatchlistComposition } from './composition';
import type { DataEnvelope } from './overview-contract';

export async function loadWatchlistComposition(
  db: object,
  historyRange: WatchlistHistoryRange = '1y',
): Promise<DataEnvelope<WatchlistComposition>> {
  const repository = db as {
    rpc(name: 'get_watchlist_composition_metrics', args: { p_history_range: WatchlistHistoryRange }): Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('get_watchlist_composition_metrics', { p_history_range: historyRange });
  if (error) throw new Error(`watchlist_composition_load_failed:${error.message}`);
  return compositionEnvelope(data);
}
