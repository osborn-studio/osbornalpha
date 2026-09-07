import { describe, expect, it, vi } from 'vitest';
import { runWatchlistDeliveryCanary } from './delivery-canary';

const environment = {
  RESEND_API_KEY: 'resend-key',
  WATCHLIST_DELIVERY_CANARY_EMAIL: 'canary@example.test',
  WATCHLIST_DELIVERY_CANARY_FROM: 'osbornALPHA <alerts@example.test>',
  WATCHLIST_RELEASE_ID: 'release-123',
};

describe('Watchlist delivery canary', () => {
  it('uses an idempotent release message and waits for delivery', async () => {
    const send = vi.fn(async () => ({ ok: true, id: 'message-1', status: 200 }));
    const loadStatus = vi.fn().mockResolvedValueOnce('sent').mockResolvedValueOnce('delivered');
    const wait = vi.fn(async () => undefined);

    await expect(runWatchlistDeliveryCanary(environment, { send, loadStatus, wait })).resolves.toEqual({
      ok: true,
      status: 'delivered',
      attempts: 2,
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'canary@example.test',
      from: 'osbornALPHA <alerts@example.test>',
      idempotencyKey: 'watchlist-delivery-canary-release-123',
    }));
    expect(wait).toHaveBeenCalledWith(5_000);
  });

  it('fails closed on terminal provider events', async () => {
    await expect(runWatchlistDeliveryCanary(environment, {
      send: vi.fn(async () => ({ ok: true, id: 'message-1' })),
      loadStatus: vi.fn(async () => 'bounced'),
    })).rejects.toThrow('watchlist_delivery_canary_bounced');
  });

  it('requires an explicit sender and recipient', async () => {
    await expect(runWatchlistDeliveryCanary({ RESEND_API_KEY: 'key' })).rejects.toThrow(
      'watchlist_delivery_canary_recipient_missing',
    );
  });

  it('retries transient status failures without resending the message', async () => {
    const send = vi.fn(async () => ({ ok: true, id: 'message-1' }));
    const loadStatus = vi.fn()
      .mockRejectedValueOnce(new Error('watchlist_delivery_canary_status_429'))
      .mockRejectedValueOnce(new Error('watchlist_delivery_canary_status_503'))
      .mockResolvedValueOnce('delivered');
    const wait = vi.fn(async () => undefined);
    await expect(runWatchlistDeliveryCanary(environment, { send, loadStatus, wait })).resolves.toEqual({
      ok: true, status: 'delivered', attempts: 3,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('fails immediately for permanent status authorization errors', async () => {
    const wait = vi.fn(async () => undefined);
    await expect(runWatchlistDeliveryCanary(environment, {
      send: vi.fn(async () => ({ ok: true, id: 'message-1' })),
      loadStatus: vi.fn(async () => { throw new Error('watchlist_delivery_canary_status_401'); }),
      wait,
    })).rejects.toThrow('watchlist_delivery_canary_status_401');
    expect(wait).not.toHaveBeenCalled();
  });
});
