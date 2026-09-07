import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistAlertSummaries } from './alert-summary-repository';

describe('loadWatchlistAlertSummaries', () => {
  it('loads one aggregate row per requested item', async () => {
    const rpc = vi.fn(async () => ({ data: [{
      item_id: 'item-1', enabled_count: 2, unread_count: 1,
      failed_delivery_count: 0, latest_triggered_at: null,
    }], error: null }));
    await expect(loadWatchlistAlertSummaries({ rpc } as never, ['item-1'])).resolves.toEqual({
      'item-1': { enabledCount: 2, unreadCount: 1, failedDeliveryCount: 0, latestTriggeredAt: null },
    });
    expect(rpc).toHaveBeenCalledWith('get_watchlist_alert_summaries', { p_item_ids: ['item-1'] });
  });

  it('does not call the database for an empty page', async () => {
    const rpc = vi.fn();
    await expect(loadWatchlistAlertSummaries({ rpc } as never, [])).resolves.toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });
});
