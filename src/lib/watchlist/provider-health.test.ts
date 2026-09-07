import { describe, expect, it } from 'vitest';
import { parseWatchlistProviderHealth, watchlistProviderRuntimeStatus } from './provider-health';
import type { WatchlistProviderRuntimeHealth } from './provider-health';

const healthy: WatchlistProviderRuntimeHealth = {
  providerId: 'search', status: 'passed', consecutiveFailures: 0, latencyMs: 120,
  errorCode: null, circuitState: 'closed', lastCheckedAt: '2026-09-05T12:00:00Z',
  lastSuccessAt: '2026-09-05T12:00:00Z', lastFailureAt: null, nextProbeAt: null,
};

describe('Watchlist provider runtime health', () => {
  it('parses sanitized rows and classifies recent probes', () => {
    const parsed = parseWatchlistProviderHealth([healthy]);
    expect(parsed.search).toMatchObject({ status: 'passed', latencyMs: 120 });
    expect(watchlistProviderRuntimeStatus(parsed.search, new Date('2026-09-05T12:05:00Z'))).toBe('healthy');
  });

  it('treats open circuits as unavailable and expired probes as unknown', () => {
    expect(watchlistProviderRuntimeStatus({ ...healthy, status: 'failed', circuitState: 'open', consecutiveFailures: 3 }, new Date('2026-09-05T12:05:00Z'))).toBe('unavailable');
    expect(watchlistProviderRuntimeStatus(healthy, new Date('2026-09-07T12:00:00Z'))).toBe('unknown');
  });

  it('drops malformed and unknown provider rows', () => {
    expect(parseWatchlistProviderHealth([{ ...healthy, providerId: 'secret-provider' }, { status: 'passed' }])).toEqual({});
  });
});
