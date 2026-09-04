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
      page: { offset: 0, limit: 50, hasMore: false },
    });
    expect(body.rows[0]).toMatchObject({
      item: { ticker: 'AAPL', thesis: 'Services growth', target_price: 250 },
      identity: { name: 'Apple' },
      market: { status: 'fresh' },
      history: { status: 'fresh' },
      research: { source: 'stored-research', status: 'fresh', value: { recentNewsCount: 1 } },
    });
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', { includeMarket: false });
  });

  it('supports a targeted ticker read for an unloaded quick view', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', { includeMarket: true });
    expect(mocks.page).toHaveBeenCalledWith(expect.anything(), { offset: 0, limit: 50, ticker: 'AAPL' });
  });
});
