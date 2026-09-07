import type { WatchlistServerClient } from './server-repository';
import { parseWatchlistAlertSummary, type WatchlistAlertSummary } from './alert-summary';

interface AlertSummaryRow {
  item_id: string;
  enabled_count: unknown;
  unread_count: unknown;
  failed_delivery_count: unknown;
  latest_triggered_at: string | null;
}

export async function loadWatchlistAlertSummaries(
  client: WatchlistServerClient,
  itemIds: string[],
): Promise<Record<string, WatchlistAlertSummary>> {
  if (itemIds.length === 0) return {};
  const repository = client as unknown as {
    rpc(name: 'get_watchlist_alert_summaries', args: { p_item_ids: string[] }): Promise<{
      data: AlertSummaryRow[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('get_watchlist_alert_summaries', { p_item_ids: itemIds });
  if (error) throw new Error(`watchlist_alert_summaries_load_failed:${error.message}`);
  return Object.fromEntries((data ?? []).flatMap((row) => {
    const summary = parseWatchlistAlertSummary(row);
    return summary ? [[row.item_id, summary] as const] : [];
  }));
}
