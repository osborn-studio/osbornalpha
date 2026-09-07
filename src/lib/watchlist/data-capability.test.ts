import { describe, expect, it } from 'vitest';
import { watchlistCapabilityFor, watchlistDataCapabilities } from './data-capability';

describe('watchlist data capabilities', () => {
  it('reports built-in and credential-gated market coverage honestly', () => {
    const capabilities = watchlistDataCapabilities(['US', 'JP', 'TW'], {});
    expect(watchlistCapabilityFor(capabilities, 'US', 'quote')).toMatchObject({ status: 'ready' });
    expect(watchlistCapabilityFor(capabilities, 'US', 'financials')).toMatchObject({ status: 'ready', providers: ['sec-company-facts'] });
    expect(watchlistCapabilityFor(capabilities, 'JP', 'quote')).toMatchObject({ status: 'unavailable', reasonCode: 'quote_provider_unconfigured' });
    expect(watchlistCapabilityFor(capabilities, 'JP', 'historyChart')).toMatchObject({ status: 'unavailable' });
    expect(watchlistCapabilityFor(capabilities, 'TW', 'intradayChart')).toMatchObject({ status: 'unavailable' });
  });

  it('shows configured fallback and research providers without exposing credentials', () => {
    const capabilities = watchlistDataCapabilities(['JP', 'HK'], {
      DATAGATEWAY_BASE_URL: 'https://gateway.example.test',
      DATAGATEWAY_API_KEY: 'secret',
      TAVILY_API_KEY: 'search-secret',
      HK_FINANCIALS_API_URL: 'https://financials.example.test',
      STRUCTURED_RESEARCH_API_URL: 'https://research.example.test',
    });
    expect(watchlistCapabilityFor(capabilities, 'JP', 'quote')).toMatchObject({ status: 'degraded', providers: ['datagateway-wind'] });
    expect(watchlistCapabilityFor(capabilities, 'JP', 'historyChart')).toMatchObject({ status: 'ready', providers: ['datagateway'] });
    expect(watchlistCapabilityFor(capabilities, 'HK', 'financials')).toMatchObject({ status: 'ready' });
    expect(watchlistCapabilityFor(capabilities, 'HK', 'reports')).toMatchObject({ status: 'ready', providers: ['structured-research-http', 'tavily'] });
    expect(JSON.stringify(capabilities)).not.toContain('secret');
  });

  it('merges current canary health without inventing a second provider registry', () => {
    const capabilities = watchlistDataCapabilities(['US'], { TAVILY_API_KEY: 'secret' }, {
      search: {
        providerId: 'search', status: 'failed', consecutiveFailures: 3, latencyMs: 900,
        errorCode: 'timeout', circuitState: 'open', lastCheckedAt: '2026-09-05T12:00:00Z',
        lastSuccessAt: '2026-09-05T10:00:00Z', lastFailureAt: '2026-09-05T12:00:00Z',
        nextProbeAt: '2026-09-05T12:15:00Z',
      },
    }, new Date('2026-09-05T12:05:00Z'));
    expect(watchlistCapabilityFor(capabilities, 'US', 'news')).toMatchObject({
      status: 'unavailable', reasonCode: 'provider_circuit_open',
      runtime: { status: 'unavailable', circuitState: 'open', lastSuccessAt: '2026-09-05T10:00:00Z' },
    });
  });

  it('marks US financials and total return degraded when their public probes are unhealthy', () => {
    const health = {
      'sec-companyfacts': {
        providerId: 'sec-companyfacts' as const, status: 'failed' as const, consecutiveFailures: 1, latencyMs: 900,
        errorCode: 'sec_http_503', circuitState: 'closed' as const, lastCheckedAt: '2026-09-05T12:00:00Z',
        lastSuccessAt: '2026-09-05T10:00:00Z', lastFailureAt: '2026-09-05T12:00:00Z', nextProbeAt: null,
      },
      'yahoo-chart': {
        providerId: 'yahoo-chart' as const, status: 'failed' as const, consecutiveFailures: 3, latencyMs: 900,
        errorCode: 'yahoo_chart_http_503', circuitState: 'open' as const, lastCheckedAt: '2026-09-05T12:00:00Z',
        lastSuccessAt: '2026-09-05T10:00:00Z', lastFailureAt: '2026-09-05T12:00:00Z', nextProbeAt: null,
      },
    };
    const capabilities = watchlistDataCapabilities(['US'], {}, health, new Date('2026-09-05T12:05:00Z'));
    expect(watchlistCapabilityFor(capabilities, 'US', 'financials')).toMatchObject({
      status: 'degraded', reasonCode: 'provider_runtime_degraded', runtime: { status: 'degraded' },
    });
    expect(watchlistCapabilityFor(capabilities, 'US', 'totalReturn')).toMatchObject({
      status: 'unavailable', reasonCode: 'provider_circuit_open', runtime: { status: 'unavailable' },
    });
  });
});
