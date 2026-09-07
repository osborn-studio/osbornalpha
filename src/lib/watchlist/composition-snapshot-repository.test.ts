import { describe, expect, it, vi } from 'vitest';
import { refreshWatchlistCompositionSnapshots } from './composition-snapshot-repository';

describe('refreshWatchlistCompositionSnapshots', () => {
  it('delegates bounded background rebuilds to the database', async () => {
    const rpc = vi.fn(async () => ({ data: 4, error: null }));
    await expect(refreshWatchlistCompositionSnapshots({ rpc }, 5)).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledWith('refresh_watchlist_composition_snapshots', { p_limit: 5 });
  });

  it('surfaces refresh failures at the repository boundary', async () => {
    await expect(refreshWatchlistCompositionSnapshots({ rpc: async () => ({ data: null, error: { message: 'busy' } }) }, 5))
      .rejects.toThrow('watchlist_composition_refresh_failed:busy');
  });
});
