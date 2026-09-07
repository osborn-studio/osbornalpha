import { describe, expect, it } from 'vitest';
import { watchlistDataNotices, watchlistWarningMessageKey } from './data-notice';
import type { WatchlistDataCapability } from './data-capability';

const capability = (overrides: Partial<WatchlistDataCapability>): WatchlistDataCapability => ({
  market: 'US', feature: 'news', status: 'degraded', providers: ['tavily'], reasonCode: 'provider_runtime_degraded',
  runtime: { status: 'degraded', lastCheckedAt: '2026-09-05T12:00:00Z', lastSuccessAt: '2026-09-05T10:00:00Z', latencyMs: 500, circuitState: 'closed' },
  ...overrides,
});

describe('Watchlist data notices', () => {
  it('maps internal warning codes to stable presentation keys without exposing them', () => {
    expect(watchlistWarningMessageKey('watchlist_peer_metrics_unavailable')).toBe('peerMetrics');
    expect(watchlistWarningMessageKey('unexpected_database_detail')).toBe('generic');
  });

  it('groups runtime capability problems by severity and preserves affected scope', () => {
    const notices = watchlistDataNotices([], [
      capability({ market: 'US', feature: 'news' }),
      capability({ market: 'HK', feature: 'reports' }),
      capability({ market: 'A', feature: 'quote', runtime: { status: 'healthy', lastCheckedAt: null, lastSuccessAt: null, latencyMs: null, circuitState: 'closed' } }),
    ]);
    expect(notices).toEqual([expect.objectContaining({
      id: 'capability:degraded', markets: ['US', 'HK'], features: ['news', 'reports'], lastSuccessAt: '2026-09-05T10:00:00Z',
    })]);
  });
});
