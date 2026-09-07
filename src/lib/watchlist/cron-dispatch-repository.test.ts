import { describe, expect, it, vi } from 'vitest';
import {
  claimWatchlistCronDispatchSlots,
  cleanupWatchlistCronDispatchSlots,
  finishWatchlistCronDispatchSlot,
} from './cron-dispatch-repository';

const slot = {
  scheduled_for: '2026-09-05T12:15:00.000Z',
  lease_token: '10000000-0000-4000-8000-000000000001',
  attempt_count: 2,
};

describe('Watchlist cron dispatch repository', () => {
  it('bounds claim inputs and validates durable slot rows', async () => {
    const rpc = vi.fn(async () => ({ data: [slot], error: null }));
    await expect(claimWatchlistCronDispatchSlots({ rpc }, new Date('2026-09-05T12:17:00Z'), {
      lookbackMinutes: 99_999, limit: 999, leaseMinutes: 999,
    })).resolves.toEqual([{
      scheduledFor: slot.scheduled_for,
      leaseToken: slot.lease_token,
      attemptCount: 2,
    }]);
    expect(rpc).toHaveBeenCalledWith('claim_watchlist_cron_dispatch_slots', expect.objectContaining({
      p_lookback_minutes: 1440, p_limit: 96, p_lease_minutes: 15,
    }));
  });

  it('rejects malformed claim results instead of silently dropping them', async () => {
    const rpc = vi.fn(async () => ({ data: [{ ...slot, lease_token: 'bad' }], error: null }));
    await expect(claimWatchlistCronDispatchSlots({ rpc }, new Date(), {
      lookbackMinutes: 120, limit: 8, leaseMinutes: 5,
    })).rejects.toThrow('watchlist_cron_dispatch_claim_invalid');
  });

  it('finishes only the claimed lease and validates cleanup counts', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: 4, error: null });
    const claimed = {
      scheduledFor: slot.scheduled_for,
      leaseToken: slot.lease_token,
      attemptCount: 2,
    };
    await finishWatchlistCronDispatchSlot({ rpc }, claimed, 'failed', 'provider:error details');
    await expect(cleanupWatchlistCronDispatchSlots({ rpc }, 30, 1000)).resolves.toBe(4);
    expect(rpc).toHaveBeenNthCalledWith(1, 'finish_watchlist_cron_dispatch_slot', expect.objectContaining({
      p_succeeded: false, p_error_code: 'provider:error details',
    }));
  });
});
