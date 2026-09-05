import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrokerReport,
  Database,
  Perspective,
  WatchlistAlert,
  WatchlistAlertEvent,
  WatchlistAlertRun,
} from '@/lib/supabase/database.types';
import { WATCHLIST_MONITORED_STATUSES } from './item-status';
import { watchlistAlertTypesForScope, type WatchlistAlertScope } from './alert-schedule';

export const WATCHLIST_ALERT_BATCH_SIZE = 100;

export interface AlertWithItem extends WatchlistAlert {
  watchlist_items: { id: string; ticker: string; status?: string } | Array<{ id: string; ticker: string; status?: string }>;
}

export interface AlertResearchCandidates {
  ownerId: string;
  ticker: string;
  reports: BrokerReport[];
  perspectives: Perspective[];
}

interface RepositoryError {
  code?: string;
  message: string;
}

interface AlertRunDatabase {
  loadAlerts(alertTypes: WatchlistAlert['alert_type'][] | null): Promise<{ data: AlertWithItem[] | null; error: RepositoryError | null }>;
  loadResearch(args: {
    p_pairs: Array<{ user_id: string; ticker: string }>;
    p_limit_per_kind: number;
  }): Promise<{
    data: Array<{ owner_id: string; ticker: string; reports: BrokerReport[]; perspectives: Perspective[] }> | null;
    error: RepositoryError | null;
  }>;
  insertEvent(event: Partial<WatchlistAlertEvent>): Promise<{ error: RepositoryError | null }>;
  updateAlert(id: string, update: Partial<WatchlistAlert>): Promise<{ error: RepositoryError | null }>;
  finishRun(id: string, update: Partial<WatchlistAlertRun>): Promise<{ error: RepositoryError | null }>;
}

function alertRunDatabase(db: SupabaseClient<Database>): AlertRunDatabase {
  const repository = db as unknown as {
    from(table: string): unknown;
    rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: RepositoryError | null }>;
  };
  return {
    async loadAlerts(alertTypes) {
      const table = repository.from('watchlist_alerts') as {
        select(columns: string): AlertLoadBuilder;
      };
      let query = table
        .select('*, watchlist_items!inner(id,ticker,status)')
        .eq('enabled', true)
        .in('watchlist_items.status', [...WATCHLIST_MONITORED_STATUSES]);
      if (alertTypes) query = query.in('alert_type', alertTypes);
      return query
        .order('last_evaluated_at', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })
        .limit(WATCHLIST_ALERT_BATCH_SIZE + 1);
    },
    async loadResearch(args) {
      return repository.rpc('watchlist_alert_research_candidates', args) as Promise<{
        data: Array<{ owner_id: string; ticker: string; reports: BrokerReport[]; perspectives: Perspective[] }> | null;
        error: RepositoryError | null;
      }>;
    },
    async insertEvent(event) {
      const table = repository.from('watchlist_alert_events') as {
        insert(value: Partial<WatchlistAlertEvent>): Promise<{ error: RepositoryError | null }>;
      };
      return table.insert(event);
    },
    async updateAlert(id, update) {
      const table = repository.from('watchlist_alerts') as {
        update(value: Partial<WatchlistAlert>): {
          eq(column: 'id', value: string): Promise<{ error: RepositoryError | null }>;
        };
      };
      return table.update(update).eq('id', id);
    },
    async finishRun(id, update) {
      const table = repository.from('watchlist_alert_runs') as {
        update(value: Partial<WatchlistAlertRun>): {
          eq(column: 'id', value: string): Promise<{ error: RepositoryError | null }>;
        };
      };
      return table.update(update).eq('id', id);
    },
  };
}

interface AlertLoadBuilder {
  eq(column: string, value: unknown): AlertLoadBuilder;
  in(column: string, values: readonly string[]): AlertLoadBuilder;
  order(column: string, options: Record<string, unknown>): AlertLoadBuilder;
  limit(value: number): Promise<{ data: AlertWithItem[] | null; error: RepositoryError | null }>;
}

export async function loadAlertRunBatch(db: SupabaseClient<Database>, scope: WatchlistAlertScope = 'all') {
  const { data, error } = await alertRunDatabase(db).loadAlerts(watchlistAlertTypesForScope(scope));
  if (error) throw new Error(`watchlist_alert_load_failed:${error.message}`);
  const rows = data ?? [];
  return { alerts: rows.slice(0, WATCHLIST_ALERT_BATCH_SIZE), saturated: rows.length > WATCHLIST_ALERT_BATCH_SIZE };
}

export async function loadAlertResearchCandidates(
  db: SupabaseClient<Database>,
  pairs: Array<{ userId: string; ticker: string }>,
): Promise<AlertResearchCandidates[]> {
  if (pairs.length === 0) return [];
  const { data, error } = await alertRunDatabase(db).loadResearch({
    p_pairs: pairs.map((pair) => ({ user_id: pair.userId, ticker: pair.ticker })),
    p_limit_per_kind: 50,
  });
  if (error) throw new Error(`watchlist_alert_research_load_failed:${error.message}`);
  return (data ?? []).map((row: {
    owner_id: string;
    ticker: string;
    reports?: BrokerReport[];
    perspectives?: Perspective[];
  }) => ({
    ownerId: row.owner_id,
    ticker: row.ticker,
    reports: Array.isArray(row.reports) ? row.reports : [],
    perspectives: Array.isArray(row.perspectives) ? row.perspectives : [],
  }));
}

export async function insertAlertEvent(
  db: SupabaseClient<Database>,
  event: Partial<WatchlistAlertEvent>,
): Promise<'inserted' | 'duplicate'> {
  const { error } = await alertRunDatabase(db).insertEvent(event);
  if (!error) return 'inserted';
  if (error.code === '23505') return 'duplicate';
  throw new Error(`watchlist_alert_event_failed:${error.message}`);
}

export async function updateAlertObservation(
  db: SupabaseClient<Database>,
  alertId: string,
  update: Partial<WatchlistAlert>,
) {
  const { error } = await alertRunDatabase(db).updateAlert(alertId, update);
  if (error) throw new Error(`watchlist_alert_update_failed:${error.message}`);
}

export async function createAlertRun(
  db: SupabaseClient<Database>,
  startedAt: string,
  scope: WatchlistAlertScope = 'all',
): Promise<string | null> {
  const repository = db as unknown as {
    rpc(name: 'start_watchlist_alert_run', args: { p_started_at: string; p_scope: WatchlistAlertScope }): Promise<{
      data: string | null; error: RepositoryError | null;
    }>;
  };
  const { data, error } = await repository.rpc('start_watchlist_alert_run', { p_started_at: startedAt, p_scope: scope });
  if (error) throw new Error(`watchlist_alert_run_create_failed:${error.message}`);
  return typeof data === 'string' && data ? data : null;
}

export async function finishAlertRun(
  db: SupabaseClient<Database>,
  runId: string,
  update: Partial<WatchlistAlertRun>,
) {
  const { error } = await alertRunDatabase(db).finishRun(runId, update);
  if (error) throw new Error(`watchlist_alert_run_finish_failed:${error.message}`);
}
