import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistComposition } from './composition-repository';

describe('loadWatchlistComposition', () => {
  it('loads one complete-list snapshot for the selected range', async () => {
    const rpc = vi.fn(async () => ({
      data: { totalSecurities: 2, markets: [], industries: [], currencies: [], correlations: [], asOf: new Date().toISOString() },
      error: null,
    }));
    const result = await loadWatchlistComposition({ rpc }, '6m');
    expect(rpc).toHaveBeenCalledWith('get_watchlist_composition_metrics', { p_history_range: '6m' });
    expect(result.value?.totalSecurities).toBe(2);
  });

  it('surfaces database failures through the repository boundary', async () => {
    await expect(loadWatchlistComposition({ rpc: vi.fn(async () => ({ data: null, error: { message: 'offline' } })) }))
      .rejects.toThrow('watchlist_composition_load_failed:offline');
  });
});
