import type { UserPreferences } from '@/lib/supabase/database.types';
import type { WatchlistServerClient } from './server-repository';
import type { WatchlistAlertPreferencesCommand } from './alert-preferences';
import { watchlistAlertPreferencesUpdate } from './alert-preferences';

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

export function loadWatchlistAlertPreferences(client: WatchlistServerClient, userId: string) {
  return repository(client).from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
}

export function updateWatchlistAlertPreferences(
  client: WatchlistServerClient,
  userId: string,
  command: WatchlistAlertPreferencesCommand,
) {
  return repository(client).from('user_preferences').update(watchlistAlertPreferencesUpdate(command))
    .eq('user_id', userId).select('*').maybeSingle();
}
