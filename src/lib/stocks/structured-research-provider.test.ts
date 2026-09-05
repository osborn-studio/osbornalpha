import { describe, expect, it, vi } from 'vitest';
import { loadConfiguredStructuredResearch } from './structured-research-provider';

const item = {
  title: 'Tencent target raised', broker: 'Broker A', rating: 'Buy',
  targetPriceMin: 500, targetPriceMax: 550, targetChangePct: 0.1,
  url: 'https://broker.example.com/report?utm_source=test', publishedAt: '2026-09-01T00:00:00Z',
  source: 'licensed-feed', trustScore: 0.9,
};

describe('configured structured research provider', () => {
  it('is explicit when no HK/US provider is configured', async () => {
    await expect(loadConfiguredStructuredResearch('0700.HK', 'HK', { endpoint: null })).resolves.toEqual({
      provider: 'structured-research-http', configured: false, items: [],
      warnings: ['structured_research_provider_unconfigured'],
    });
  });

  it('normalizes a validated provider response', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ ticker: '0700.HK', items: [item] }), { status: 200 }));
    const result = await loadConfiguredStructuredResearch('0700.hk', 'HK', {
      endpoint: 'https://research.example.test/v1/reports', token: 'secret', fetch: request,
    });
    expect(result.items[0]).toMatchObject({
      broker: 'Broker A', ratingNormalized: 'buy', targetPriceMin: 500,
      url: 'https://broker.example.com/report',
    });
    expect(request).toHaveBeenCalledWith(
      new URL('https://research.example.test/v1/reports?ticker=0700.HK&market=HK'),
      expect.objectContaining({ headers: { accept: 'application/json', authorization: 'Bearer secret' } }),
    );
  });

  it('rejects the whole response when any structured record is malformed', async () => {
    await expect(loadConfiguredStructuredResearch('AAPL', 'US', {
      endpoint: 'https://research.example.test/v1/reports',
      fetch: async () => new Response(JSON.stringify({ ticker: 'AAPL', items: [{ ...item, trustScore: 2 }] })),
    })).rejects.toThrow('structured-research-http_invalid_response');
  });
});
