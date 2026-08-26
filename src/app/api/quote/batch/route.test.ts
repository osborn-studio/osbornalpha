import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchDatagatewayRealtimeQuotes: vi.fn(),
  fallbackFetch: vi.fn(),
  fetchTwseQuotesBatch: vi.fn(),
}));

vi.mock('@/lib/data/sources/datagateway-quote', () => ({
  isDatagatewayConfigured: () => true,
  fetchDatagatewayRealtimeQuotes: mocks.fetchDatagatewayRealtimeQuotes,
}));

vi.mock('@/lib/data/sources/registry', () => ({
  quoteSourcesFor: () => [{ name: 'public-fallback', fetch: mocks.fallbackFetch }],
}));

vi.mock('@/lib/data/sources/twse', () => ({
  fetchTwseQuotesBatch: mocks.fetchTwseQuotesBatch,
}));

vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: () => false,
  fetchTushareDaily: vi.fn(),
  fetchTushareDailyBasic: vi.fn(),
}));

import { GET } from './route';

function quote(ticker: string, source: string) {
  return {
    source,
    ticker,
    name: ticker,
    market: 'US' as const,
    currency: '$',
    price: 100,
    change: 1,
    change_pct: 1,
    open: 99,
    high: 101,
    low: 98,
    prev_close: 99,
    volume: 1000,
    amount: 100_000,
    amplitude: 3,
    market_cap: null,
    market_cap_label: '—',
    pe_ttm: null,
    pb: null,
    turnover: null,
    volume_ratio: null,
    updated_at: '2026-08-27T00:00:00.000Z',
    delayed: false,
  };
}

describe('GET /api/quote/batch DataGateway routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDatagatewayRealtimeQuotes.mockResolvedValue(new Map([
      ['AAPL', quote('AAPL', 'datagateway-wind')],
    ]));
    mocks.fallbackFetch.mockImplementation(async (ticker: string) => quote(ticker, 'public-fallback'));
    mocks.fetchTwseQuotesBatch.mockResolvedValue(new Map());
  });

  it('queries DataGateway once and falls back only for missing tickers', async () => {
    const response = await GET(new Request('https://example.test/api/quote/batch?tickers=AAPL,MSFT&_=1'));
    const body = await response.json();

    expect(mocks.fetchDatagatewayRealtimeQuotes).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDatagatewayRealtimeQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    expect(mocks.fallbackFetch).toHaveBeenCalledTimes(1);
    expect(mocks.fallbackFetch).toHaveBeenCalledWith('MSFT', expect.any(AbortSignal));
    expect(body.quotes.AAPL).toMatchObject({ source: 'datagateway-wind', ticker: 'AAPL' });
    expect(body.quotes.MSFT).toMatchObject({ source: 'public-fallback', ticker: 'MSFT' });
    expect(body.meta.selected_sources).toEqual({
      AAPL: 'datagateway-wind',
      MSFT: 'public-fallback',
    });
  });

  it('falls back after one bounded DataGateway attempt', async () => {
    mocks.fetchDatagatewayRealtimeQuotes.mockRejectedValue(
      Object.assign(new Error('timed out'), { kind: 'transient', retryable: true }),
    );

    const response = await GET(new Request('https://example.test/api/quote/batch?tickers=AAPL&_=1'));
    const body = await response.json();

    expect(mocks.fetchDatagatewayRealtimeQuotes).toHaveBeenCalledTimes(1);
    expect(mocks.fallbackFetch).toHaveBeenCalledTimes(1);
    expect(body.quotes.AAPL).toMatchObject({ source: 'public-fallback', ticker: 'AAPL' });
    expect(body.meta.sources['datagateway-wind']).toMatchObject({ attempted: 1, failed: 1, retries: 0 });
  });
});
