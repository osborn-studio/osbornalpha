import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  WatchlistResearchRefreshState,
  WatchlistResearchTickerRefreshState,
} from '@/lib/supabase/database.types';
import { WATCHLIST_MONITORED_STATUSES } from './item-status';

function repositoryOf(db: SupabaseClient<Database>) {
  return db as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: WatchlistResearchRefreshState[] | null;
      error: { message: string } | null;
    }>;
    from: (name: 'watchlist_research_refresh_state') => {
      update: (patch: Partial<WatchlistResearchRefreshState>) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };
}

function tickerRepositoryOf(db: SupabaseClient<Database>) {
  return db as unknown as {
    rpc: (name: 'claim_watchlist_research_ticker_refresh', args: Record<string, unknown>) => Promise<{
      data: WatchlistResearchTickerRefreshState[] | null;
      error: { message: string } | null;
    }>;
    from(name: 'watchlist_items'): {
      select(columns: string): {
        eq(column: string, value: string): {
          in(column: string, values: string[]): Promise<{ data: Array<{ user_id: string }> | null; error: { message: string } | null }>;
        };
      };
    };
    from(name: 'watchlist_research_ticker_refresh_state'): {
      update(patch: Partial<WatchlistResearchTickerRefreshState>): {
        eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
      };
    };
  };
}

export async function claimWatchlistResearchTickerRefresh(
  db: SupabaseClient<Database>,
  limit: number,
): Promise<WatchlistResearchTickerRefreshState[]> {
  const { data, error } = await tickerRepositoryOf(db).rpc('claim_watchlist_research_ticker_refresh', {
    p_limit: limit,
    p_lease_minutes: 10,
  });
  if (error) throw new Error(`watchlist_research_ticker_claim_failed:${error.message}`);
  return data ?? [];
}

export async function loadWatchlistResearchAudience(
  db: SupabaseClient<Database>,
  ticker: string,
): Promise<string[]> {
  const { data, error } = await tickerRepositoryOf(db).from('watchlist_items').select('user_id')
    .eq('ticker', ticker)
    .in('status', [...WATCHLIST_MONITORED_STATUSES]);
  if (error) throw new Error(`watchlist_research_audience_failed:${error.message}`);
  return [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))];
}

export async function claimWatchlistResearchRefresh(
  db: SupabaseClient<Database>,
  limit: number,
): Promise<WatchlistResearchRefreshState[]> {
  const { data, error } = await repositoryOf(db).rpc('claim_watchlist_research_refresh', {
    p_limit: limit,
    p_lease_minutes: 10,
  });
  if (error) throw new Error(`watchlist_research_claim_failed:${error.message}`);
  return data ?? [];
}

export function nextWatchlistResearchRefresh(
  now: Date,
  outcome: 'complete' | 'partial' | 'failed',
  failureCount: number,
): string {
  if (outcome === 'complete') return new Date(now.getTime() + 12 * 60 * 60_000).toISOString();
  if (outcome === 'partial') return new Date(now.getTime() + 3 * 60 * 60_000).toISOString();
  const delayMinutes = Math.min(360, 15 * (2 ** Math.min(Math.max(failureCount, 0), 5)));
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

export async function finishWatchlistResearchRefresh(
  db: SupabaseClient<Database>,
  claimed: WatchlistResearchRefreshState,
  outcome: 'complete' | 'partial' | 'failed',
  errorMessage: string | null,
  now = new Date(),
): Promise<void> {
  const failed = outcome === 'failed';
  const failureCount = failed ? claimed.failure_count + 1 : 0;
  const { error } = await repositoryOf(db).from('watchlist_research_refresh_state').update({
    status: outcome === 'complete' ? 'succeeded' : outcome,
    failure_count: failureCount,
    last_success_at: failed ? claimed.last_success_at : now.toISOString(),
    next_refresh_at: nextWatchlistResearchRefresh(now, outcome, failureCount),
    lease_expires_at: null,
    last_error: errorMessage?.slice(0, 500) ?? null,
    updated_at: now.toISOString(),
  }).eq('user_id', claimed.user_id).eq('ticker', claimed.ticker);
  if (error) throw new Error(`watchlist_research_finish_failed:${error.message}`);
}

export async function finishWatchlistResearchTickerRefresh(
  db: SupabaseClient<Database>,
  claimed: WatchlistResearchTickerRefreshState,
  outcome: 'complete' | 'partial' | 'failed',
  errorMessage: string | null,
  now = new Date(),
): Promise<void> {
  const failed = outcome === 'failed';
  const failureCount = failed ? claimed.failure_count + 1 : 0;
  const { error } = await tickerRepositoryOf(db).from('watchlist_research_ticker_refresh_state').update({
    status: outcome === 'complete' ? 'succeeded' : outcome,
    failure_count: failureCount,
    last_success_at: failed ? claimed.last_success_at : now.toISOString(),
    next_refresh_at: nextWatchlistResearchRefresh(now, outcome, failureCount),
    lease_expires_at: null,
    last_error: errorMessage?.slice(0, 500) ?? null,
    updated_at: now.toISOString(),
  }).eq('ticker', claimed.ticker);
  if (error) throw new Error(`watchlist_research_ticker_finish_failed:${error.message}`);
}
