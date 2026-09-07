import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistProviderHealth, recordWatchlistProviderHealth } from './provider-health-repository';

describe('Watchlist provider health repository', () => {
  it('loads and validates the sanitized runtime map', async () => {
    const rpc = vi.fn(async () => ({ data: [{
      providerId: 'search', status: 'passed', consecutiveFailures: 0, latencyMs: 42,
      errorCode: null, circuitState: 'closed', lastCheckedAt: '2026-09-05T12:00:00Z',
      lastSuccessAt: '2026-09-05T12:00:00Z', lastFailureAt: null, nextProbeAt: null,
    }], error: null }));
    await expect(loadWatchlistProviderHealth({ rpc })).resolves.toMatchObject({ search: { latencyMs: 42 } });
    expect(rpc).toHaveBeenCalledWith('get_watchlist_provider_health');
  });

  it('records the existing canary result contract unchanged', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const results = [{ id: 'search', status: 'failed', latencyMs: 100, errorCode: 'timeout' }];
    await recordWatchlistProviderHealth({ rpc }, results);
    expect(rpc).toHaveBeenCalledWith('record_watchlist_provider_health', { p_results: results });
  });

  it('surfaces database failures with stable prefixes', async () => {
    await expect(loadWatchlistProviderHealth({ rpc: async () => ({ data: null, error: { message: 'down' } }) }))
      .rejects.toThrow('watchlist_provider_health_load_failed:down');
  });
});
