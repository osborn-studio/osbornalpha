import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchDatagatewayRealtimeQuotes: vi.fn(),
  fallbackFetch: vi.fn(),
  fetchTwseQuotesBatch: vi.fn(),
  sourceNames: ['public-fallback'],
  paidConfigured: false,
  paidDaily: vi.fn(),
  paidBasic: vi.fn(),
}));

vi.mock('@/lib/data/sources/datagateway-quote', () => ({
  isDatagatewayConfigured: () => true,
  fetchDatagatewayRealtimeQuotes: mocks.fetchDatagatewayRealtimeQuotes,
}));

vi.mock('@/lib/data/sources/registry', () => ({
  quoteSourcesFor: () => mocks.sourceNames.map(name => ({ name, fetch: mocks.fallbackFetch })),
}));

vi.mock('@/lib/data/sources/twse', () => ({
  fetchTwseQuotesBatch: mocks.fetchTwseQuotesBatch,
}));

vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: () => mocks.paidConfigured,
  fetchTushareDaily: mocks.paidDaily,
  fetchTushareDailyBasic: mocks.paidBasic,
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
    mocks.sourceNames = ['public-fallback'];
    mocks.paidConfigured = false;
    mocks.fetchDatagatewayRealtimeQuotes.mockResolvedValue(new Map([
      ['AAPL', quote('AAPL', 'datagateway-wind')],
    ]));
    mocks.fallbackFetch.mockImplementation(async (ticker: string) => quote(ticker, 'public-fallback'));
    mocks.fetchTwseQuotesBatch.mockResolvedValue(new Map());
  });

  afterEach(() => vi.useRealTimers());
  it('pre-aborted request dispatches no providers', async () => {
    const c=new AbortController();c.abort(); const r=await GET(new Request('https://example.test/api/quote/batch?tickers=PREABORT', {signal:c.signal}));
    expect(r.status).toBe(503);expect(mocks.fetchDatagatewayRealtimeQuotes).not.toHaveBeenCalled();expect(mocks.fallbackFetch).not.toHaveBeenCalled();expect(mocks.fetchTwseQuotesBatch).not.toHaveBeenCalled();
  });
  it('disconnect discards late gateway results without writing cache or starting fallback', async () => {
    let deliver:(v:Map<string,ReturnType<typeof quote>>)=>void=()=>{};
    mocks.fetchDatagatewayRealtimeQuotes.mockImplementationOnce(()=>new Promise(resolve=>{deliver=resolve;}));
    const c=new AbortController();const pending=GET(new Request('https://example.test/api/quote/batch?tickers=DISCONNECT',{signal:c.signal}));c.abort();
    expect((await pending).status).toBe(503);deliver(new Map([['DISCONNECT',quote('DISCONNECT','datagateway-wind')]])); await Promise.resolve();
    expect(mocks.fallbackFetch).not.toHaveBeenCalled();mocks.fetchDatagatewayRealtimeQuotes.mockResolvedValue(new Map());
    const body=await (await GET(new Request('https://example.test/api/quote/batch?tickers=DISCONNECT'))).json();expect(mocks.fetchDatagatewayRealtimeQuotes).toHaveBeenCalledTimes(2);expect(body.meta.selected_sources.DISCONNECT).toBe('public-fallback');
  });
  it('soft ticker budget preserves gateway success and stale cache with no later dispatch', async () => {
    vi.useFakeTimers();
    await GET(new Request('https://example.test/api/quote/batch?tickers=SLOWSTALE&_=1'));
    mocks.sourceNames=['synthetic1','synthetic2','synthetic3','synthetic4'];mocks.fallbackFetch.mockImplementation(()=>new Promise(()=>{}));
    mocks.fetchDatagatewayRealtimeQuotes.mockResolvedValue(new Map([['FASTPARTIAL',quote('FASTPARTIAL','datagateway-wind')]]));
    const pending=GET(new Request('https://example.test/api/quote/batch?tickers=FASTPARTIAL,SLOWSTALE,EMPTYBUDGET&_=1'));
    await vi.advanceTimersByTimeAsync(14_000);const response=await pending;const body=await response.json();
    expect(response.status).toBe(200);expect(body.meta.selected_sources).toEqual({FASTPARTIAL:'datagateway-wind',SLOWSTALE:'stale-cache'});expect(body.quotes.SLOWSTALE.delayed).toBe(true);expect(body.quotes.EMPTYBUDGET).toBe(null);expect(body.meta.failed).toBe(1);expect(body.meta.stale).toBe(1);
    const count=mocks.fallbackFetch.mock.calls.length;await vi.advanceTimersByTimeAsync(10_000);expect(mocks.fallbackFetch).toHaveBeenCalledTimes(count);expect(vi.getTimerCount()).toBe(0);
  });
  it('does not retry uncancellable paid helpers after timeout', async () => {
    vi.useFakeTimers(); mocks.paidConfigured=true; mocks.fetchDatagatewayRealtimeQuotes.mockResolvedValue(new Map()); mocks.fallbackFetch.mockResolvedValue(null);
    mocks.paidDaily.mockImplementation(()=>new Promise(()=>{}));mocks.paidBasic.mockImplementation(()=>new Promise(()=>{}));
    const pending=GET(new Request('https://example.test/api/quote/batch?tickers=600777.SH&_=1'));
    await vi.advanceTimersByTimeAsync(2700);expect((await pending).status).toBe(200);expect(mocks.paidDaily).toHaveBeenCalledTimes(1);expect(mocks.paidBasic).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(20_000);expect(mocks.paidDaily).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('forwards route disconnect to TWSE and discards late provider results', async () => {
    let deliver:(v:Map<string,ReturnType<typeof quote>>)=>void=()=>{};let child:AbortSignal|undefined;
    mocks.fetchDatagatewayRealtimeQuotes.mockResolvedValue(new Map());mocks.fetchTwseQuotesBatch.mockImplementationOnce((_,signal)=>{child=signal;return new Promise(resolve=>{deliver=resolve;});});
    const c=new AbortController();const pending=GET(new Request('https://example.test/api/quote/batch?tickers=9115.TW',{signal:c.signal}));await new Promise(resolve=>setTimeout(resolve,0));expect(child).toBeInstanceOf(AbortSignal);c.abort();expect((await pending).status).toBe(503);expect(child!.aborted).toBe(true);
    deliver(new Map([['9115.TW',quote('9115.TW','twse')]]));await new Promise(resolve=>setTimeout(resolve,0));mocks.fetchTwseQuotesBatch.mockResolvedValue(new Map());
    const body=await (await GET(new Request('https://example.test/api/quote/batch?tickers=9115.TW'))).json();expect(body.quotes['9115.TW']).toBe(null);expect(body.meta.selected_sources['9115.TW']).toBeUndefined();
  });
  it('queries DataGateway once and falls back only for missing tickers', async () => {
    const response = await GET(new Request('https://example.test/api/quote/batch?tickers=AAPL,MSFT&_=1'));
    const body = await response.json();

    expect(mocks.fetchDatagatewayRealtimeQuotes).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDatagatewayRealtimeQuotes).toHaveBeenCalledWith(['AAPL', 'MSFT'], { signal: expect.any(AbortSignal) });
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
