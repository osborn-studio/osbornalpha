import type {
  WatchlistMetricRefreshState,
  WatchlistMetricSnapshot,
} from '@/lib/supabase/database.types';
import type { WatchlistHistoryRange } from '@/lib/market-returns/types';
import { nextWatchlistMetricRefresh } from './metric-snapshot';
import { watchlistBenchmarkTicker } from './analytics';
import { builtInMarketCalendar, type MarketCalendarProvider } from '@/lib/market/calendar';

/** Both the session client and service-role client satisfy repositoryOf below. */
export type MetricDatabase = object;

export async function loadWatchlistMetricSnapshots(
  db: MetricDatabase,
  tickers: string[],
  historyRange: WatchlistHistoryRange = '1y',
): Promise<Record<string, WatchlistMetricSnapshot>> {
  if (tickers.length === 0) return {};
  const repository = db as unknown as {
    from(name: 'watchlist_metric_snapshots'): {
      select(columns: '*'): {
        eq(column: 'history_range', value: WatchlistHistoryRange): {
          in(column: 'ticker', values: string[]): Promise<{
            data: WatchlistMetricSnapshot[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await repository.from('watchlist_metric_snapshots').select('*')
    .eq('history_range', historyRange).in('ticker', [...new Set(tickers)]);
  if (error) throw new Error(`watchlist_metric_snapshot_load_failed:${error.message}`);
  return Object.fromEntries((data ?? [])
    .filter((snapshot) => snapshot.benchmark_ticker === watchlistBenchmarkTicker(snapshot.market))
    .map((snapshot) => [snapshot.ticker, snapshot]));
}

export async function upsertWatchlistMetricSnapshot(
  db: MetricDatabase,
  snapshot: WatchlistMetricSnapshot,
): Promise<void> {
  const repository = db as unknown as {
    from(name: 'watchlist_metric_snapshots'): {
      upsert(value: WatchlistMetricSnapshot, options: { onConflict: string }): Promise<{
        error: { message: string } | null;
      }>;
    };
  };
  const { error } = await repository.from('watchlist_metric_snapshots').upsert(snapshot, {
    onConflict: 'ticker,history_range,benchmark_ticker',
  });
  if (error) throw new Error(`watchlist_metric_snapshot_upsert_failed:${error.message}`);
}

export async function claimWatchlistMetricRefresh(
  db: MetricDatabase,
  limit: number,
): Promise<WatchlistMetricRefreshState[]> {
  const repository = db as unknown as {
    rpc(name: 'claim_watchlist_metric_refresh', args: {
      p_limit: number;
      p_lease_minutes: number;
    }): Promise<{ data: WatchlistMetricRefreshState[] | null; error: { message: string } | null }>;
  };
  const { data, error } = await repository.rpc('claim_watchlist_metric_refresh', {
    p_limit: Math.min(Math.max(Math.floor(limit), 1), 25),
    p_lease_minutes: 10,
  });
  if (error) throw new Error(`watchlist_metric_refresh_claim_failed:${error.message}`);
  return data ?? [];
}

export async function finishWatchlistMetricRefresh(
  db: MetricDatabase,
  claimed: WatchlistMetricRefreshState,
  outcome: 'succeeded' | 'failed',
  errorMessage: string | null,
  now = new Date(),
  calendar: MarketCalendarProvider = builtInMarketCalendar,
): Promise<void> {
  const failureCount = outcome === 'failed' ? claimed.failure_count + 1 : 0;
  const repository = db as unknown as {
    from(name: 'watchlist_metric_refresh_state'): {
      update(value: Partial<WatchlistMetricRefreshState>): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const { error } = await repository.from('watchlist_metric_refresh_state').update({
    status: outcome,
    failure_count: failureCount,
    last_success_at: outcome === 'succeeded' ? now.toISOString() : claimed.last_success_at,
    next_refresh_at: nextWatchlistMetricRefresh(claimed.market, now, outcome, failureCount, calendar),
    lease_expires_at: null,
    last_error: errorMessage?.slice(0, 500) ?? null,
    updated_at: now.toISOString(),
  }).eq('ticker', claimed.ticker)
    .eq('history_range', claimed.history_range)
    .eq('benchmark_ticker', claimed.benchmark_ticker);
  if (error) throw new Error(`watchlist_metric_refresh_finish_failed:${error.message}`);
}
