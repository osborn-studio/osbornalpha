import { describe, expect, it, vi } from 'vitest';
import { loadMarketReturnSnapshot } from './service';
import type { MarketReturnProvider } from './types';

describe('market return service', () => {
  it('normalizes ticker input before routing to the provider', async () => {
    const load = vi.fn().mockResolvedValue({ ticker: 'AAPL' });
    const provider = { id: 'test', supports: () => true, load } as unknown as MarketReturnProvider;
    await loadMarketReturnSnapshot(' aapl ', '1y', { provider });
    expect(load).toHaveBeenCalledWith('AAPL', '1y');
  });

  it('returns null when a provider is unavailable', async () => {
    const provider: MarketReturnProvider = { id: 'test', supports: () => true, load: async () => { throw new Error('offline'); } };
    await expect(loadMarketReturnSnapshot('AAPL', '1y', { provider })).resolves.toBeNull();
  });
});
