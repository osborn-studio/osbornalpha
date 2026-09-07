import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  page: vi.fn(),
  queryPage: vi.fn(),
  version: vi.fn(),
  computed: vi.fn(),
  metricSnapshots: vi.fn(),
  research: vi.fn(),
  peer: vi.fn(),
  composition: vi.fn(),
  alertSummaries: vi.fn(),
  providerHealth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth }, from: mocks.from })),
}));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: vi.fn(async () => 'en') }));
vi.mock('@/lib/watchlist/server-repository', () => ({
  loadWatchlistOverviewPage: mocks.page,
  loadWatchlistOverviewQuery: mocks.queryPage,
  loadWatchlistVersion: mocks.version,
}));
vi.mock('@/lib/watchlist/overview', () => ({ buildComputedWatchlistOverview: mocks.computed }));
vi.mock('@/lib/watchlist/metric-snapshot-repository', () => ({
  loadWatchlistMetricSnapshots: mocks.metricSnapshots,
}));
vi.mock('@/lib/watchlist/research-repository', () => ({ loadWatchlistResearchSummaries: mocks.research }));
vi.mock('@/lib/watchlist/peer-metrics-repository', () => ({ loadWatchlistPeerMetrics: mocks.peer }));
vi.mock('@/lib/watchlist/composition-repository', () => ({ loadWatchlistComposition: mocks.composition }));
vi.mock('@/lib/watchlist/alert-summary-repository', () => ({ loadWatchlistAlertSummaries: mocks.alertSummaries }));
vi.mock('@/lib/watchlist/provider-health-repository', () => ({ loadWatchlistProviderHealth: mocks.providerHealth }));

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
    mocks.queryPage.mockResolvedValue({ total: 0, hasMore: false, nextCursor: null, rows: [] });
    mocks.computed.mockResolvedValue({ AAPL: { market: { status: 'fresh' }, history: { status: 'fresh' } } });
    mocks.metricSnapshots.mockResolvedValue({
      AAPL: {
        ticker: 'AAPL', market: 'US', history_range: '1y', benchmark_ticker: 'SPY',
        metrics: { observations: 252, coverageRatio: 1, methodology: { historyRange: '1y' } },
        source: 'snapshot-source', source_bundle: {}, warnings: [], calculator_version: 'watchlist-analytics-v2',
        observed_at: new Date().toISOString(),
        generated_at: new Date().toISOString(), valid_until: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    mocks.research.mockResolvedValue({
      AAPL: {
        recentNewsCount: 1, latestNewsAt: new Date().toISOString(), latestReportAt: null,
        averageSentiment: 0.5, perspectiveCounts: { bullish: 0, neutral: 0, bearish: 0 },
        perspectiveDivergence: false, latestPerspectiveAt: null,
      },
    });
    mocks.peer.mockResolvedValue({
      AAPL: {
        value: {
          market: 'US', currency: 'USD', industry: 'Technology',
          marketRelativeStrengthPercentile: 80, marketRelativeStrengthSampleSize: 50,
          industryPePercentile: 60, industryPeSampleSize: 20,
          industryPbPercentile: 70, industryPbSampleSize: 20,
          marketLiquidityPercentile: 90, marketLiquiditySampleSize: 50,
          averageTradedAmount20: 1_000_000, watchlistMarketCapSharePct: 100,
          watchlistMarketCapSampleSize: 1,
        },
        asOf: new Date().toISOString(), source: 'shared-peer-snapshots', status: 'fresh', warnings: [],
      },
    });
    mocks.composition.mockResolvedValue({
      value: { totalSecurities: 1, markets: [{ key: 'US', count: 1, sharePct: 100 }], industries: [], currencies: [], correlations: [], highCorrelationCount: 0 },
      asOf: new Date().toISOString(), source: 'watchlist-composition-snapshots', status: 'fresh', warnings: ['watchlist_correlation_unavailable'],
    });
    mocks.alertSummaries.mockResolvedValue({
      'item-1': { enabledCount: 2, unreadCount: 1, failedDeliveryCount: 0, latestTriggeredAt: '2026-09-04T12:00:00Z' },
    });
    mocks.providerHealth.mockResolvedValue({});
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
      dataStatus: 'complete', warnings: [],
      composition: { value: { totalSecurities: 1 } },
      page: { offset: null, limit: 50, cursor: null, nextCursor: null, hasMore: false },
    });
    expect(body.rows[0]).toMatchObject({
      item: { ticker: 'AAPL', thesis: 'Services growth', target_price: 250 },
      identity: { name: 'Apple' },
      market: null,
      history: { status: 'fresh' },
      peer: { status: 'fresh', value: { marketRelativeStrengthPercentile: 80 } },
      research: { source: 'stored-research', status: 'fresh', value: { recentNewsCount: 1 } },
      alerts: { status: 'fresh', value: { enabledCount: 2, unreadCount: 1, failedDeliveryCount: 0 } },
    });
    expect(mocks.computed).not.toHaveBeenCalled();
    expect(mocks.metricSnapshots).toHaveBeenCalledWith(expect.anything(), ['AAPL'], '1y');
    expect(mocks.peer).toHaveBeenCalledWith(expect.anything(), ['AAPL'], '1y');
    expect(mocks.alertSummaries).toHaveBeenCalledWith(expect.anything(), ['item-1']);
    expect(body.rows[0].history).toMatchObject({ status: 'fresh', source: 'snapshot-source' });
  });

  it('keeps the overview usable when optional sources fail', async () => {
    mocks.research.mockRejectedValueOnce(new Error('research down'));
    mocks.peer.mockRejectedValueOnce(new Error('peer down'));
    mocks.alertSummaries.mockRejectedValueOnce(new Error('alerts down'));

    const response = await GET(new Request('https://example.test/api/watchlist/overview'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      dataStatus: 'partial',
      warnings: expect.arrayContaining([
        'watchlist_research_summaries_unavailable',
        'watchlist_peer_metrics_unavailable',
        'watchlist_alert_summaries_unavailable',
      ]),
    });
    expect(body.rows[0]).toMatchObject({
      item: { ticker: 'AAPL' },
      research: { status: 'unavailable', value: null },
      peer: { status: 'unavailable', value: null },
      alerts: { status: 'unavailable', value: null },
    });
  });

  it('supports a targeted ticker read for an unloaded quick view', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', {
      includeMarket: true, benchmarkTicker: null, historyRange: '1y', includeTotalReturn: true,
    });
    expect(mocks.page).toHaveBeenCalledWith(expect.anything(), {
      offset: null, cursor: null, limit: 50, ticker: 'AAPL',
    });
  });

  it('passes a normalized custom benchmark only for targeted reads', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl&benchmark=qqq'));
    expect(response.status).toBe(200);
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', {
      includeMarket: true, benchmarkTicker: 'QQQ', historyRange: '1y', includeTotalReturn: true,
    });
  });

  it('passes a custom history range only for targeted reads', async () => {
    const response = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl&range=6m'));
    expect(response.status).toBe(200);
    expect(mocks.computed).toHaveBeenCalledWith(['AAPL'], 'en', {
      includeMarket: true, benchmarkTicker: null, historyRange: '6m', includeTotalReturn: true,
    });
  });

  it('rejects invalid or bulk custom history ranges before loading data', async () => {
    const invalid = await GET(new Request('https://example.test/api/watchlist/overview?ticker=aapl&range=5d'));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: 'invalid_history_range' });

    const bulk = await GET(new Request('https://example.test/api/watchlist/overview?range=6m'));
    expect(bulk.status).toBe(400);
    expect(await bulk.json()).toMatchObject({ error: 'history_range_requires_ticker' });
    expect(mocks.page).not.toHaveBeenCalled();
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

  it('routes typed metric sorting through the complete-dataset query RPC', async () => {
    mocks.queryPage.mockResolvedValueOnce({
      total: 1, hasMore: false, nextCursor: null,
      rows: [{
        group: { id: 'wl-1', name: 'Core', description: null, sort_order: 0 },
        item: {
          id: 'item-1', ticker: 'AAPL', conviction: 8, notes: null, sort_order: 0,
          added_at: '2026-09-01T00:00:00Z', thesis: null, target_price: null,
          invalidation_conditions: null, confidence: null, review_at: null,
          tags: [], status: 'watching', updated_at: '2026-09-01T00:00:00Z', decision_version: 2,
        },
      }],
    });
    const response = await GET(new Request(
      'https://example.test/api/watchlist/overview?sort=change&direction=desc&quoteStatus=live&metric=rsi14&metricMin=30',
    ));
    expect(response.status).toBe(200);
    expect(mocks.queryPage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      sort: 'change', direction: 'desc', quoteStatus: 'live', metric: 'rsi14', metricMin: 30, cursor: null,
    }));
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.computed).not.toHaveBeenCalled();
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
