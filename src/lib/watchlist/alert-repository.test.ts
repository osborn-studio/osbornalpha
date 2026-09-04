import { describe, expect, it, vi } from 'vitest';
import {
  retryWatchlistAlertEvent,
  updateWatchlistAlertEventReadState,
} from './alert-repository';

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
