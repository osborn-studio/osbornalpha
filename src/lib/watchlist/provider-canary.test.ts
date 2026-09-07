import { describe, expect, it, vi } from 'vitest';
import {
  providerCanariesPassed,
  runWatchlistProviderCanaries,
  watchlistSearchCanaryQueries,
} from './provider-canary';

describe('Watchlist provider live canaries', () => {
  it('probes configured providers and skips optional fallbacks', async () => {
    const search = vi.fn(async () => undefined);
    const results = await runWatchlistProviderCanaries({
      environment: { TAVILY_API_KEY: 'secret' },
      now: new Date('2026-09-04T00:00:00Z'),
    }, { search, 'sec-companyfacts': async () => undefined, 'yahoo-chart': async () => undefined });
    expect(search).toHaveBeenCalledOnce();
    expect(results.find((item) => item.id === 'search')).toMatchObject({ status: 'passed' });
    expect(results.find((item) => item.id === 'structured-research')).toMatchObject({ status: 'skipped', mode: 'fallback' });
    expect(results.find((item) => item.id === 'sec-companyfacts')).toMatchObject({ status: 'passed' });
    expect(results.find((item) => item.id === 'yahoo-chart')).toMatchObject({ status: 'passed' });
    expect(providerCanariesPassed(results)).toBe(true);
  });

  it('fails a required provider that is not configured', async () => {
    const results = await runWatchlistProviderCanaries({
      environment: { WATCHLIST_REQUIRED_PROVIDERS: 'search' },
    }, {});
    expect(results.find((item) => item.id === 'search')).toMatchObject({
      status: 'failed', errorCode: 'required_provider_not_configured',
    });
    expect(providerCanariesPassed(results)).toBe(false);
  });

  it('returns a stable failure code without throwing or exposing response content', async () => {
    const results = await runWatchlistProviderCanaries({
      environment: { STRUCTURED_RESEARCH_API_URL: 'https://research.example/v1' },
    }, { 'structured-research': async () => { throw new Error('structured provider HTTP 503'); } });
    expect(results.find((item) => item.id === 'structured-research')).toMatchObject({
      status: 'failed', errorCode: 'structured_provider_HTTP_503',
    });
  });

  it('propagates cancellation instead of recording it as a provider failure', async () => {
    const controller = new AbortController();
    const probe = vi.fn((signal?: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const pending = runWatchlistProviderCanaries({ signal: controller.signal }, {
      'sec-companyfacts': probe,
      'yahoo-chart': probe,
    });

    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(probe.mock.calls.every(([signal]) => signal === controller.signal)).toBe(true);
  });

  it('uses a three-market search probe set and supports bounded overrides', () => {
    expect(watchlistSearchCanaryQueries({})).toEqual([
      'AAPL Apple investor relations',
      '0700.HK Tencent investor relations',
      '600519.SH Kweichow Moutai investor relations',
    ]);
    expect(watchlistSearchCanaryQueries({
      WATCHLIST_SEARCH_CANARY_QUERIES: 'query one | query two | ',
    })).toEqual(['query one', 'query two']);
  });
});
