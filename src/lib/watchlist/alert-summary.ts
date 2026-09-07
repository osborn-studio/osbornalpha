import type { DataEnvelope } from './overview-contract';
import { freshDataEnvelope, unavailableDataEnvelope } from './data-envelope';

export interface WatchlistAlertSummary {
  enabledCount: number;
  unreadCount: number;
  failedDeliveryCount: number;
  latestTriggeredAt: string | null;
}

export const EMPTY_WATCHLIST_ALERT_SUMMARY: WatchlistAlertSummary = {
  enabledCount: 0,
  unreadCount: 0,
  failedDeliveryCount: 0,
  latestTriggeredAt: null,
};

export function watchlistAlertSummaryEnvelope(
  value: WatchlistAlertSummary,
  asOf = new Date().toISOString(),
): DataEnvelope<WatchlistAlertSummary> {
  return freshDataEnvelope(value, 'watchlist-alert-events', asOf);
}

export function unavailableWatchlistAlertSummaryEnvelope(): DataEnvelope<WatchlistAlertSummary> {
  return unavailableDataEnvelope('watchlist-alert-events', 'watchlist_alert_summaries_unavailable');
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseWatchlistAlertSummary(value: unknown): WatchlistAlertSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.item_id !== 'string') return null;
  const latest = row.latest_triggered_at;
  if (latest !== null && typeof latest !== 'string') return null;
  return {
    enabledCount: count(row.enabled_count),
    unreadCount: count(row.unread_count),
    failedDeliveryCount: count(row.failed_delivery_count),
    latestTriggeredAt: latest,
  };
}
