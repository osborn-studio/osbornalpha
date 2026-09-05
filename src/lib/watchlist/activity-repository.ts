import type { WatchlistActivityState } from '@/lib/supabase/database.types';

export type WatchlistActivityClient = object;

export async function loadWatchlistActivityState(
  client: WatchlistActivityClient,
  userId: string,
  ticker: string,
): Promise<WatchlistActivityState | null> {
  type Query = {
    eq(column: 'user_id' | 'ticker', value: string): Query;
    maybeSingle(): Promise<{ data: WatchlistActivityState | null; error: { message: string } | null }>;
  };
  const db = client as {
    from(table: 'watchlist_activity_state'): { select(columns: '*'): Query };
  };
  const { data, error } = await db.from('watchlist_activity_state').select('*')
    .eq('user_id', userId).eq('ticker', ticker).maybeSingle();
  if (error) throw new Error(`watchlist_activity_state_load_failed:${error.message}`);
  return data;
}

export async function markWatchlistActivitySeen(
  client: WatchlistActivityClient,
  userId: string,
  ticker: string,
  seenAt = new Date(),
): Promise<WatchlistActivityState> {
  const value = {
    user_id: userId,
    ticker,
    last_seen_at: seenAt.toISOString(),
    updated_at: seenAt.toISOString(),
  };
  const db = client as {
    from(table: 'watchlist_activity_state'): {
      upsert(row: typeof value, options: { onConflict: 'user_id,ticker' }): {
        select(columns: '*'): { single(): Promise<{ data: WatchlistActivityState | null; error: { message: string } | null }> };
      };
    };
  };
  const { data, error } = await db.from('watchlist_activity_state')
    .upsert(value, { onConflict: 'user_id,ticker' }).select('*').single();
  if (error || !data) throw new Error(`watchlist_activity_state_save_failed:${error?.message ?? 'empty'}`);
  return data;
}
