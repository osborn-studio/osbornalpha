import { describe, expect, it, vi } from 'vitest';
import { loadFinancialReport } from './service';
import type { FinancialProvider } from './types';

describe('financial service', () => {
  it('normalizes tickers before invoking a provider', async () => {
    const load = vi.fn().mockResolvedValue({ ticker: 'AAPL' });
    const provider = { id: 'test', supports: () => true, load } as unknown as FinancialProvider;
    await loadFinancialReport(' aapl ', { provider });
    expect(load).toHaveBeenCalledWith('AAPL');
  });

  it('turns provider failures into an explicit unavailable contract', async () => {
    const provider: FinancialProvider = { id: 'test', supports: () => true, load: async () => { throw new Error('boom'); } };
    const report = await loadFinancialReport('AAPL', { provider });
    expect(report).toMatchObject({
      source: 'test', ticker: 'AAPL', yearly: [],
      meta: { market: 'US', supported: true, availability: 'unavailable', warnings: ['test_unavailable'] },
    });
  });
});
