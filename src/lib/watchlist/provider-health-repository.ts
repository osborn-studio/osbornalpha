import type { WatchlistProviderHealthMap } from './provider-health';
import { parseWatchlistProviderHealth } from './provider-health';

export async function loadWatchlistProviderHealth(db: object): Promise<WatchlistProviderHealthMap> {
  const repository = db as {
    rpc(name: 'get_watchlist_provider_health'): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('get_watchlist_provider_health');
  if (error) throw new Error(`watchlist_provider_health_load_failed:${error.message}`);
  return parseWatchlistProviderHealth(data);
}

export async function recordWatchlistProviderHealth(
  db: object,
  results: Array<{ id: string; status: string; latencyMs: number | null; errorCode?: string }>,
): Promise<void> {
  const repository = db as {
    rpc(name: 'record_watchlist_provider_health', args: { p_results: unknown[] }): Promise<{ error: { message: string } | null }>;
  };
  const { error } = await repository.rpc('record_watchlist_provider_health', { p_results: results });
  if (error) throw new Error(`watchlist_provider_health_record_failed:${error.message}`);
}
