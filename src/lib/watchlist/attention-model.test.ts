import { describe, expect, it } from 'vitest';
import { buildWatchlistAttentionItems } from './attention-model';

describe('Watchlist attention model', () => {
  it('orders actionable failures before alerts, reviews and data notices', () => {
    const items = buildWatchlistAttentionItems({
      reviews: { overdue: 1, dueToday: 2, upcoming: 0, unscheduled: 0 },
      notices: [{ severity: 'critical' } as never],
      rows: {
        AAPL: { alerts: { value: { failedDeliveryCount: 1, unreadCount: 2 } } } as never,
        NVDA: { alerts: { value: { failedDeliveryCount: 0, unreadCount: 1 } } } as never,
      },
    });
    expect(items.map((item) => item.kind)).toEqual(['delivery', 'alert', 'review', 'data']);
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'alert', count: 3, ticker: 'AAPL' }),
      expect.objectContaining({ kind: 'review', count: 3, severity: 'critical' }),
    ]));
  });
});
