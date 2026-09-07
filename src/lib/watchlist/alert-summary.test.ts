import { describe, expect, it } from 'vitest';
import {
  parseWatchlistAlertSummary,
  unavailableWatchlistAlertSummaryEnvelope,
  watchlistAlertSummaryEnvelope,
} from './alert-summary';

describe('parseWatchlistAlertSummary', () => {
  it('normalizes database counts', () => {
    expect(parseWatchlistAlertSummary({
      item_id: 'item-1', enabled_count: '2', unread_count: 3,
      failed_delivery_count: '1', latest_triggered_at: '2026-09-04T12:00:00Z',
    })).toEqual({ enabledCount: 2, unreadCount: 3, failedDeliveryCount: 1, latestTriggeredAt: '2026-09-04T12:00:00Z' });
  });

  it('rejects rows without an item id', () => {
    expect(parseWatchlistAlertSummary({ enabled_count: 1 })).toBeNull();
  });

  it('distinguishes a successful empty summary from an unavailable source', () => {
    expect(watchlistAlertSummaryEnvelope({
      enabledCount: 0, unreadCount: 0, failedDeliveryCount: 0, latestTriggeredAt: null,
    }, '2026-09-04T12:00:00Z')).toMatchObject({ status: 'fresh', value: { enabledCount: 0 } });
    expect(unavailableWatchlistAlertSummaryEnvelope()).toMatchObject({
      status: 'unavailable', value: null, reasonCode: 'watchlist_alert_summaries_unavailable', retryable: true,
    });
  });
});
