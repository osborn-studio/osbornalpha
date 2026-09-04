import type { WatchlistAlertRunInput, WatchlistOperationCommand, WatchlistOperationsInput } from './watchlist-operations';

interface RepositoryError { message: string }
interface CountResult { count: number | null; error: RepositoryError | null }

function tableFrom(client: unknown, table: string): unknown {
  return (client as { from(name: string): unknown }).from(table);
}

async function countByStatus(client: unknown, tableName: string, status: string): Promise<CountResult> {
  const table = tableFrom(client, tableName) as {
    select(columns: string, options: { count: 'exact'; head: true }): {
      eq(column: 'delivery_status' | 'status', value: string): Promise<CountResult>;
    };
  };
  return table.select('id', { count: 'exact', head: true }).eq(
    tableName === 'watchlist_alert_events' ? 'delivery_status' : 'status',
    status,
  );
}

async function countResearchDue(client: unknown, now: string): Promise<CountResult> {
  const table = tableFrom(client, 'watchlist_research_ticker_refresh_state') as {
    select(columns: string, options: { count: 'exact'; head: true }): {
      lte(column: 'next_refresh_at', value: string): Promise<CountResult>;
    };
  };
  return table.select('ticker', { count: 'exact', head: true }).lte('next_refresh_at', now);
}

async function loadRuns(client: unknown) {
  const table = tableFrom(client, 'watchlist_alert_runs') as {
    select(columns: '*'): {
      order(column: 'started_at', options: { ascending: false }): {
        limit(value: 20): Promise<{ data: WatchlistAlertRunInput[] | null; error: RepositoryError | null }>;
      };
    };
  };
  return table.select('*').order('started_at', { ascending: false }).limit(20);
}

export async function loadWatchlistOperationsInput(
  client: unknown,
  now = new Date(),
): Promise<WatchlistOperationsInput> {
  const timestamp = now.toISOString();
  const [runs, pending, processing, failed, deadLetter, researchDue, researchFailed] = await Promise.all([
    loadRuns(client),
    countByStatus(client, 'watchlist_alert_events', 'pending'),
    countByStatus(client, 'watchlist_alert_events', 'processing'),
    countByStatus(client, 'watchlist_alert_events', 'failed'),
    countByStatus(client, 'watchlist_alert_events', 'dead_letter'),
    countResearchDue(client, timestamp),
    countByStatus(client, 'watchlist_research_ticker_refresh_state', 'failed'),
  ]);
  const results = [runs, pending, processing, failed, deadLetter, researchDue, researchFailed];
  if (results.some((result) => result.error)) throw new Error('watchlist_operations_source_unavailable');
  return {
    now: timestamp,
    alertRuns: runs.data ?? [],
    eventCounts: {
      pending: pending.count ?? 0,
      processing: processing.count ?? 0,
      failed: failed.count ?? 0,
      dead_letter: deadLetter.count ?? 0,
    },
    researchDue: researchDue.count ?? 0,
    researchFailed: researchFailed.count ?? 0,
  };
}

export async function executeWatchlistOperation(
  client: unknown,
  actorId: string,
  command: WatchlistOperationCommand,
) {
  const repository = client as {
    rpc(name: 'run_watchlist_admin_operation', args: Record<string, unknown>): Promise<{
      data: { action: string; affected: number } | null;
      error: RepositoryError | null;
    }>;
  };
  const { data, error } = await repository.rpc('run_watchlist_admin_operation', {
    p_actor_id: actorId,
    p_action: command.action,
    p_limit: command.limit,
    p_older_than_minutes: command.olderThanMinutes,
    p_tickers: command.tickers.length > 0 ? command.tickers : null,
  });
  if (error) throw new Error('watchlist_operation_failed');
  if (!data || data.action !== command.action || !Number.isInteger(data.affected)) {
    throw new Error('invalid_watchlist_operation_result');
  }
  return data;
}
