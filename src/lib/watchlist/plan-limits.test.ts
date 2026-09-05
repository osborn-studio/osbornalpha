import { describe, expect, it, vi } from 'vitest';
import { consumeWatchlistResearchQuota, isWatchlistPlanLimitError } from './plan-limits';

describe('Watchlist plan limits', () => {
  it('validates the atomic research quota response', async () => {
    const rpc = vi.fn(async () => ({ data: { allowed: true, used: 2, limit: 10, plan: 'free' }, error: null }));
    await expect(consumeWatchlistResearchQuota({ rpc })).resolves.toEqual({ allowed: true, used: 2, limit: 10, plan: 'free' });
    expect(rpc).toHaveBeenCalledWith('consume_watchlist_research_quota');
  });

  it('recognizes database capacity errors without treating other failures as limits', () => {
    expect(isWatchlistPlanLimitError({ message: 'watchlist_item_plan_limit' }, 'item')).toBe(true);
    expect(isWatchlistPlanLimitError({ message: 'database offline' }, 'alert')).toBe(false);
  });
});
