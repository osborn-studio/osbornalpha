import type { WatchlistHistoryRange } from '@/lib/market-returns/types';
import type { DataEnvelope } from './overview-contract';
import { peerMetricEnvelope, type WatchlistPeerMetricRow, type WatchlistPeerMetrics } from './peer-metrics';

export type PeerMetricsDatabase = object;

export async function loadWatchlistPeerMetrics(
  db: PeerMetricsDatabase,
  tickers: string[],
  historyRange: WatchlistHistoryRange = '1y',
): Promise<Record<string, DataEnvelope<WatchlistPeerMetrics>>> {
  const requested = [...new Set(tickers.filter(Boolean))];
  if (requested.length === 0) return {};
  const repository = db as {
    rpc(name: 'get_watchlist_peer_metrics', args: { p_history_range: WatchlistHistoryRange }): Promise<{
      data: WatchlistPeerMetricRow[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('get_watchlist_peer_metrics', { p_history_range: historyRange });
  if (error) throw new Error(`watchlist_peer_metrics_load_failed:${error.message}`);
  const requestedSet = new Set(requested);
  return Object.fromEntries((data ?? [])
    .filter((row) => requestedSet.has(row.ticker))
    .map((row) => [row.ticker, peerMetricEnvelope(row)]));
}

export async function loadWatchlistPeerMetricsForUser(
  db: PeerMetricsDatabase,
  userId: string,
  tickers: string[],
  historyRange: WatchlistHistoryRange = '1y',
): Promise<Record<string, DataEnvelope<WatchlistPeerMetrics>>> {
  const requested = [...new Set(tickers.filter(Boolean))];
  if (requested.length === 0) return {};
  const repository = db as {
    rpc(name: 'get_watchlist_peer_metrics_for_user', args: {
      p_user_id: string;
      p_history_range: WatchlistHistoryRange;
    }): Promise<{ data: WatchlistPeerMetricRow[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('get_watchlist_peer_metrics_for_user', {
    p_user_id: userId,
    p_history_range: historyRange,
  });
  if (error) throw new Error(`watchlist_peer_metrics_load_failed:${error.message}`);
  const requestedSet = new Set(requested);
  return Object.fromEntries((data ?? [])
    .filter((row) => requestedSet.has(row.ticker))
    .map((row) => [row.ticker, peerMetricEnvelope(row)]));
}
