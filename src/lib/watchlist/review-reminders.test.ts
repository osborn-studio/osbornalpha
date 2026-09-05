import { describe, expect, it, vi } from 'vitest';
import { enqueueWatchlistReviewReminders } from './review-reminders';

describe('enqueueWatchlistReviewReminders', () => {
  it('uses the shared database queue with a bounded batch', async () => {
    const rpc = vi.fn(async () => ({ data: 4, error: null }));
    await expect(enqueueWatchlistReviewReminders({ rpc } as never, 50)).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledWith('enqueue_watchlist_review_reminders', { p_limit: 50 });
  });

  it('rejects repository failures and invalid result contracts', async () => {
    await expect(enqueueWatchlistReviewReminders({
      rpc: async () => ({ data: null, error: { message: 'database detail' } }),
    } as never)).rejects.toThrow('watchlist_review_reminder_enqueue_failed');
    await expect(enqueueWatchlistReviewReminders({
      rpc: async () => ({ data: -1, error: null }),
    } as never)).rejects.toThrow('watchlist_review_reminder_response_invalid');
  });
});
