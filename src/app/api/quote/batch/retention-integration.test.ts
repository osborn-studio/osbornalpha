import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/data/sources/datagateway-quote', () => ({ isDatagatewayConfigured: () => false, fetchDatagatewayRealtimeQuotes: vi.fn() }));
vi.mock('@/lib/data/sources/registry', () => ({ quoteSourcesFor: () => [] }));
vi.mock('@/lib/data/sources/tushare-cached', () => ({ isTushareConfigured: () => false, fetchTushareDaily: vi.fn(), fetchTushareDailyBasic: vi.fn() }));
// TWSE, its sharing/timeout helpers, and the batch route are real modules.
beforeEach(() => vi.resetModules());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const payload = (price: string) => ({ msgArray: [{ c: '9501', ex: 'tse', z: price, y: '11', d: '20261006', t: '12:00:00' }] });
describe('real route/TWSE retention composition with synthetic upstream only', () => {
  it('preserves original module-hit age through a forced route refresh', async () => {
    const { GET } = await import('./route');
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(payload('12'))).mockResolvedValueOnce(Response.json(payload('13')));
    vi.stubGlobal('fetch', fetcher);
    const request = (force = false) => new Request(`https://example.test/api/quote/batch?tickers=9501.TW${force ? '&_=1' : ''}`);
    await GET(request(true)); clock.mockReturnValue(60_000);
    const hit = await (await GET(request(true))).json(); expect(hit.quotes['9501.TW'].price).toBe(12); expect(fetcher).toHaveBeenCalledOnce();
    clock.mockReturnValue(62_000); const refreshed = await (await GET(request())).json();
    expect(refreshed.meta.selected_sources['9501.TW']).toBe('twse'); expect(refreshed.quotes['9501.TW'].price).toBe(13); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(refreshed.quotes)).not.toMatch(/retentionStart|generation/);
    for (const [, options] of fetcher.mock.calls) expect(options.cache).toBe('no-store');
  });
  it('chooses route start when the real provider starts a few ticks later', async () => {
    const { GET } = await import('./route'); let tick = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => tick++);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(payload('12')));
    vi.stubGlobal('fetch', fetcher);
    await GET(new Request('https://example.test/api/quote/batch?tickers=9501.TW&_=1'));
    expect(tick).toBeGreaterThan(1003);
    clock.mockReturnValue(61_000);
    const body = await (await GET(new Request('https://example.test/api/quote/batch?tickers=9501.TW'))).json();
    // Route TTL expired at61000, provider TTL starts later and still hits.
    expect(body.meta.selected_sources['9501.TW']).toBe('twse'); expect(fetcher).toHaveBeenCalledOnce();
  });
});
