import { describe, expect, it, vi } from 'vitest';
import {
  listWatchlistAlerts,
  retryWatchlistAlertEvent,
  updateWatchlistAlertEventReadState,
} from './alert-repository';

function alertQuery(data: unknown[]) {
  const query = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data, error: null });
  return query;
}

describe('watchlist alert repository reads', () => {
  it.each([
    [{ alert_id: 'alert-1', claim_id: 'claim-1' }],
    { alert_id: 'alert-1', claim_id: 'claim-1' },
  ])('normalizes PostgREST one-to-one origin shape %#', async (nested) => {
    const query = alertQuery([{ id: 'alert-1', user_id: 'user-1', watchlist_alert_origins: nested }]);
    const result = await listWatchlistAlerts({ from: vi.fn(() => query) } as never, 'user-1', 'item-1');
    expect(result.data).toEqual([
      expect.objectContaining({ id: 'alert-1', origin: expect.objectContaining({ claim_id: 'claim-1' }) }),
    ]);
    expect(query.select).toHaveBeenCalledWith('*, watchlist_alert_origins(*)');
    expect(query.eq).toHaveBeenCalledWith('watchlist_item_id', 'item-1');
  });

  it('treats a missing origin relation as a manual alert', async () => {
    const query = alertQuery([{ id: 'alert-1', user_id: 'user-1' }]);
    const result = await listWatchlistAlerts({ from: vi.fn(() => query) } as never, 'user-1');
    expect(result.data[0].origin).toBeNull();
  });
});

describe('watchlist alert event repository commands', () => {
  it('changes read state through the owner-scoped RPC', async () => {
    const event = { id: 'event-1', read_at: '2026-09-04T12:00:00Z' };
    const rpc = vi.fn(async () => ({ data: [event], error: null }));

    await expect(updateWatchlistAlertEventReadState({ rpc } as never, 'event-1', true))
      .resolves.toEqual({ data: event, error: null });
    expect(rpc).toHaveBeenCalledWith('set_watchlist_alert_event_read', {
      p_event_id: 'event-1',
      p_read: true,
    });
  });

  it('requeues delivery through the owner-scoped RPC', async () => {
    const event = { id: 'event-1', delivery_status: 'pending' };
    const rpc = vi.fn(async () => ({ data: [event], error: null }));

    await expect(retryWatchlistAlertEvent({ rpc } as never, 'event-1'))
      .resolves.toEqual({ data: event, error: null });
    expect(rpc).toHaveBeenCalledWith('retry_watchlist_alert_event_delivery', {
      p_event_id: 'event-1',
    });
  });
});
