import type { UserPreferences } from '@/lib/supabase/database.types';
import type { WatchlistServerClient } from './server-repository';
import type { WatchlistUiPreferencesCommand } from './ui-preferences';

interface Result {
  data: UserPreferences | null;
  error: { message: string } | null;
}

interface Query {
  eq(column: string, value: unknown): Query;
  select(columns?: string): Query;
  maybeSingle(): Promise<Result>;
}

interface Repository {
  from(table: 'user_preferences'): {
    select(columns?: string): Query;
    update(value: Partial<UserPreferences>): Query;
  };
}

function repository(client: WatchlistServerClient) {
  return client as unknown as Repository;
}

const COLUMNS = 'watchlist_ui_preferences,watchlist_ui_preferences_version,watchlist_ui_preferences_updated_at';

export function loadWatchlistUiPreferences(client: WatchlistServerClient, userId: string) {
  return repository(client).from('user_preferences').select(COLUMNS).eq('user_id', userId).maybeSingle();
}

export function updateWatchlistUiPreferences(
  client: WatchlistServerClient,
  userId: string,
  command: WatchlistUiPreferencesCommand,
  now = new Date(),
) {
  return repository(client).from('user_preferences').update({
    watchlist_ui_preferences: command.preferences as unknown as Record<string, unknown>,
    watchlist_ui_preferences_version: command.expectedVersion + 1,
    watchlist_ui_preferences_updated_at: now.toISOString(),
  }).eq('user_id', userId)
    .eq('watchlist_ui_preferences_version', command.expectedVersion)
    .select(COLUMNS)
    .maybeSingle();
}
