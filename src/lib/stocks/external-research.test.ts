import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchExternalEvidence: vi.fn(),
  fetchEastmoneyQuote: vi.fn(),
  isTushareConfigured: vi.fn(),
  fetchTushareReportRc: vi.fn(),
}));

vi.mock('@/lib/external-evidence', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/external-evidence')>(),
  searchExternalEvidence: mocks.searchExternalEvidence,
}));
vi.mock('@/lib/data/sources/eastmoney', () => ({ fetchEastmoneyQuote: mocks.fetchEastmoneyQuote }));
vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: mocks.isTushareConfigured,
  fetchTushareReportRc: mocks.fetchTushareReportRc,
}));

import { getStockNews, getStockReports } from './external-research';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'request-1', status: 'complete', provider: 'test-search', queryCount: 1,
    results: [], fetchedAt: '2026-09-04T00:00:00.000Z', durationMs: 5, warnings: [], ...overrides,
  };
}

describe('stock external research', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchEastmoneyQuote.mockResolvedValue({ name: 'Apple', market: 'US' });
    mocks.isTushareConfigured.mockReturnValue(false);
    mocks.searchExternalEvidence.mockResolvedValue(snapshot());
  });

  it('maps verified search results into linked news and explicit sentiment', async () => {
    mocks.searchExternalEvidence.mockResolvedValue(snapshot({
      results: [{
        citationId: 'web_123', title: 'Apple raises guidance after record growth',
        url: 'https://reuters.com/apple', domain: 'reuters.com', snippet: 'Demand beat expectations.',
        sourceType: 'news', publishedAt: '2026-09-03T00:00:00.000Z', fetchedAt: '2026-09-04T00:00:00.000Z',
        trustScore: 0.78, relevanceScore: 0.9,
      }],
    }));
    const result = await getStockNews('AAPL');
    expect(result.items[0]).toMatchObject({ id: 'web_123', source: 'reuters.com', sentiment: 0.5 });
    expect(result.meta).toMatchObject({ status: 'complete', providers: ['test-search'] });
  });

  it('returns no invented news when search is not configured', async () => {
    mocks.searchExternalEvidence.mockResolvedValue(snapshot({ status: 'unavailable', provider: null, warnings: ['search_provider_not_configured'] }));
    const result = await getStockNews('AAPL');
    expect(result.items).toEqual([]);
    expect(result.meta.status).toBe('unavailable');
  });

  it('prefers structured Tushare report metadata and consensus for A-shares', async () => {
    mocks.fetchEastmoneyQuote.mockResolvedValue({ name: 'Kweichow Moutai', market: 'A' });
    mocks.isTushareConfigured.mockReturnValue(true);
    mocks.fetchTushareReportRc.mockResolvedValue([{
      ts_code: '600519.SH', report_date: '20260901', report_title: 'Earnings review',
      org_name: 'Broker A', rating: 'Buy', min_price: 1800, max_price: 2000, rd: 12,
    }]);
    mocks.searchExternalEvidence.mockResolvedValue(snapshot({ status: 'unavailable', provider: null, warnings: ['search_provider_not_configured'] }));
    const result = await getStockReports('600519.SH');
    expect(result.items[0]).toMatchObject({ title: 'Earnings review', source: 'tushare', targetPriceMin: 1800, targetPriceMax: 2000 });
    expect(result.consensus).toMatchObject({ targetMedian: 1900, count: 1 });
    expect(result.meta.providers).toContain('tushare');
  });
});
