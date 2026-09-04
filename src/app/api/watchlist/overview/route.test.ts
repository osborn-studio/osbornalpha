import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  page: vi.fn(),
  version: vi.fn(),
  computed: vi.fn(),
  research: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth }, from: mocks.from })),
}));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: vi.fn(async () => 'en') }));
vi.mock('@/lib/watchlist/server-repository', () => ({
  loadWatchlistOverviewPage: mocks.page,
  loadWatchlistVersion: mocks.version,
}));
vi.mock('@/lib/watchlist/overview', () => ({ buildComputedWatchlistOverview: mocks.computed }));
vi.mock('@/lib/watchlist/research-repository', () => ({ loadWatchlistResearchSummaries: mocks.research }));

import { GET } from './route';

describe('GET /api/watchlist/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.version.mockResolvedValue(7);
    mocks.page.mockResolvedValue({
      total: 1,
      hasMore: false,
      nextCursor: null,
      rows: [{
        group: { id: 'wl-1', name: 'Core', description: null, sort_order: 0 },
        item: {
        id: 'item-1', ticker: 'AAPL', conviction: 8, notes: null, sort_order: 0,
        added_at: '2026-09-01T00:00:00Z', thesis: 'Services growth', target_price: 250,
        invalidation_conditions: 'Margin compression', confidence: 70, review_at: null,
        tags: ['core'], status: 'watching', updated_at: '2026-09-01T00:00:00Z',
        decision_version: 2,
        },
      }],
    });
    mocks.computed.mockResolvedValue({ AAPL: { market: { status: 'fresh' }, history: { status: 'fresh' } } });
    mocks.research.mockResolvedValue({
      AAPL: {
        recentNewsCount: 1, latestNewsAt: new Date().toISOString(), latestReportAt: null,
        averageSentiment: 0.5, perspectiveCounts: { bullish: 0, neutral: 0, bearish: 0 },
        perspectiveDivergence: false, latestPerspectiveAt: null,
      },
    });
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({
        in: () => table === 'stocks_universe'
          ? Promise.resolve({ data: [{ ticker: 'AAPL', name: 'Apple' }], error: null })
          : Promise.resolve({ data: [], error: null }),
      }),
    }));
  });

  it('returns one versioned row with market, history, research, and decision state', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ownerId: 'user-1', version: 7, total: 1, partial: false,
      page: { offset: null, limit: 50, cursor: null, nextCursor: null, hasMore: false },
    });
    expect(body.rows[0]).toMatchObject({
      item: { ticker: 'AAPL', thesis: 'Services growth', target_price: 250 },
      identity: { name: 'Apple' },
      market: { status: 'fresh' },
      history: { status: 'fresh' },
      research: { source: 'stored-research', status: 'fresh', value: { recentNewsCount: 1 } },
    });
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', { includeMarket: false, benchmarkTicker: null });
  });

  it('supports a targeted ticker read for an unloaded quick view', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', { includeMarket: true, benchmarkTicker: null });
    expect(mocks.page).toHaveBeenCalledWith(expect.anything(), {
      offset: null, cursor: null, limit: 50, ticker: 'AAPL',
    });
  });

  it('passes a normalized custom benchmark only for targeted reads', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl&benchmark=qqq'));
    expect(response.status).toBe(200);
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', { includeMarket: true, benchmarkTicker: 'QQQ' });
  });

  it('rejects the target security itself as a benchmark', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl&benchmark=AAPL'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'benchmark_same_security' });
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('rejects a benchmark from an incompatible currency and market calendar', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl&benchmark=510300.SH'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'benchmark_incompatible_market' });
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('rejects custom benchmarks on a bulk overview request', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?benchmark=qqq'));
    expect(response.status).toBe(400);
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('rejects malformed keyset cursors before loading data', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?cursor=%7Bbad'));
    expect(response.status).toBe(400);
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('returns an opaque next cursor without exposing database ordering fields', async () => {
    mocks.page.mockResolvedValueOnce({
      total: 2,
      hasMore: true,
      nextCursor: { groupSort: 1, itemSort: 2, itemId: '11111111-1111-5111-8111-111111111111' },
      rows: [],
    });
    const response = await GET(new Request('https://example.test/api/watchlist/overview'));
    const body = await response.json();
    expect(body.page).toMatchObject({ offset: null, hasMore: true });
    expect(body.page.nextCursor).toContain('groupSort');
    expect(body.page.nextCursor).not.toContain('group_sort');
  });
});
