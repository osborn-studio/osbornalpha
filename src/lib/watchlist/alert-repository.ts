import type { WatchlistAlert, WatchlistAlertEvent } from '@/lib/supabase/database.types';
import type { CreateWatchlistAlert } from './alerts';
import type { WatchlistAlertEventQuery } from './alert-events';
import type { WatchlistServerClient } from './server-repository';

interface RepositoryError {
  code?: string;
  message: string;
}

interface RepositoryResult<T> {
  data: T;
  error: RepositoryError | null;
}

interface RepositoryQuery<T> extends PromiseLike<RepositoryResult<T[] | null>> {
  select(columns?: string): RepositoryQuery<T>;
  eq(column: string, value: unknown): RepositoryQuery<T>;
  is(column: string, value: null): RepositoryQuery<T>;
  order(column: string, options?: { ascending?: boolean }): RepositoryQuery<T>;
  limit(value: number): RepositoryQuery<T>;
  maybeSingle(): Promise<RepositoryResult<T | null>>;
}

interface RepositoryTable<T> {
  select(columns?: string): RepositoryQuery<T>;
  insert(value: Partial<T>): RepositoryQuery<T>;
  update(value: Partial<T>): RepositoryQuery<T>;
  delete(): RepositoryQuery<T>;
}

interface AlertRepositoryClient {
  from(table: 'watchlist_alerts'): RepositoryTable<WatchlistAlert>;
  from(table: 'watchlist_alert_events'): RepositoryTable<WatchlistAlertEvent>;
}

function alertRepositoryClient(client: WatchlistServerClient): AlertRepositoryClient {
  return client as unknown as AlertRepositoryClient;
}

interface AlertEventCommandClient {
  rpc(
    name: 'set_watchlist_alert_event_read',
    args: { p_event_id: string; p_read: boolean },
  ): Promise<{ data: WatchlistAlertEvent[] | null; error: RepositoryError | null }>;
  rpc(
    name: 'retry_watchlist_alert_event_delivery',
    args: { p_event_id: string },
  ): Promise<{ data: WatchlistAlertEvent[] | null; error: RepositoryError | null }>;
}

function alertEventCommandClient(client: WatchlistServerClient): AlertEventCommandClient {
  return client as unknown as AlertEventCommandClient;
}

export async function listWatchlistAlerts(client: WatchlistServerClient, userId: string, itemId?: string | null) {
  let query = alertRepositoryClient(client).from('watchlist_alerts').select('*').eq('user_id', userId);
  if (itemId) query = query.eq('watchlist_item_id', itemId);
  return query.order('created_at', { ascending: false });
}

export async function createWatchlistAlert(client: WatchlistServerClient, userId: string, input: CreateWatchlistAlert) {
  const result = await alertRepositoryClient(client).from('watchlist_alerts').insert({ ...input, user_id: userId }).select('*').maybeSingle();
  return result as { data: WatchlistAlert | null; error: { code?: string; message: string } | null };
}

export async function getWatchlistAlert(client: WatchlistServerClient, userId: string, alertId: string) {
  const result = await alertRepositoryClient(client).from('watchlist_alerts').select('*')
    .eq('id', alertId).eq('user_id', userId).maybeSingle();
  return result as { data: WatchlistAlert | null; error: { code?: string; message: string } | null };
}

export async function updateWatchlistAlert(
  client: WatchlistServerClient,
  userId: string,
  alertId: string,
  patch: Partial<WatchlistAlert>,
) {
  const result = await alertRepositoryClient(client).from('watchlist_alerts').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', alertId).eq('user_id', userId).select('*').maybeSingle();
  return result as { data: WatchlistAlert | null; error: { code?: string; message: string } | null };
}

export async function deleteWatchlistAlert(client: WatchlistServerClient, userId: string, alertId: string) {
  const result = await alertRepositoryClient(client).from('watchlist_alerts').delete().eq('id', alertId).eq('user_id', userId);
  return result as { data: WatchlistAlert[] | null; error: { message: string } | null };
}

export async function listWatchlistAlertEvents(
  client: WatchlistServerClient,
  userId: string,
  options: WatchlistAlertEventQuery,
) {
  let query = alertRepositoryClient(client).from('watchlist_alert_events').select('*').eq('user_id', userId);
  if (options.unreadOnly) query = query.is('read_at', null);
  if (options.itemId) query = query.eq('watchlist_item_id', options.itemId);
  const result = await query.order('triggered_at', { ascending: false }).limit(options.limit);
  return result as { data: WatchlistAlertEvent[] | null; error: { message: string } | null };
}

export async function updateWatchlistAlertEventReadState(
  client: WatchlistServerClient,
  eventId: string,
  read: boolean,
) {
  const { data, error } = await alertEventCommandClient(client).rpc('set_watchlist_alert_event_read', {
    p_event_id: eventId,
    p_read: read,
  });
  return { data: data?.[0] ?? null, error };
}

export async function retryWatchlistAlertEvent(
  client: WatchlistServerClient,
  eventId: string,
) {
  const { data, error } = await alertEventCommandClient(client).rpc('retry_watchlist_alert_event_delivery', {
    p_event_id: eventId,
  });
  return { data: data?.[0] ?? null, error };
}
