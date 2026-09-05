import { describe, expect, it, vi } from 'vitest';
import {
  loadStoredStockResearch,
  persistStockNews,
  persistStockReports,
} from './research-artifact-repository';

function perspectiveQuery() {
  const query = {
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(async () => ({ data: [], error: null })),
  };
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

describe('shared research artifact repository', () => {
  it('persists news and reports through the shared service-role RPC', async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    const client = { rpc };
    await persistStockNews(client, 'user-1', {
      ticker: 'AAPL',
      items: [{
        id: 'news-1', title: 'Apple update', source: 'reuters.com', url: null, snippet: '',
        sentiment: 0.2, publishedAt: null, fetchedAt: '2026-09-04T00:00:00Z', trustScore: 0.9,
        sourceType: 'news',
      }],
      meta: { status: 'complete', providers: ['test'], fetchedAt: '2026-09-04T00:00:00Z', warnings: [] },
    });
    await persistStockReports(client, 'user-1', {
      ticker: 'AAPL',
      items: [{
        id: 'report-1', title: 'Target raised', broker: 'Broker', rating: 'buy',
        targetPriceMin: 200, targetPriceMax: 220, targetChangePct: 10, url: null,
        publishedAt: '2026-09-03T00:00:00Z', source: 'feed', trustScore: 0.8,
      }],
      consensus: null,
      meta: { status: 'complete', providers: ['test'], fetchedAt: '2026-09-04T00:00:00Z', warnings: [] },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, 'persist_shared_research_artifacts', expect.objectContaining({
      p_user_id: 'user-1', p_ticker: 'AAPL', p_kind: 'news',
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'persist_shared_research_artifacts', expect.objectContaining({
      p_user_id: 'user-1', p_ticker: 'AAPL', p_kind: 'report',
    }));
  });

  it('maps shared payloads back to the established research read model', async () => {
    const query = perspectiveQuery();
    const rpc = vi.fn(async () => ({
      data: [{
        id: 'artifact-1', kind: 'news', ticker: 'AAPL', source_key: 'news-1', title: 'Apple update',
        source: 'reuters.com', url: null, published_at: null, fetched_at: '2026-09-04T00:00:00Z',
        event_cluster_id: 'cluster-1', quality_score: 0.9, content_hash: 'hash', updated_at: '2026-09-04T00:00:00Z',
        payload: { snippet: 'Update', sentiment: 0.2, trust_score: 0.9, source_type: 'news' },
      }, {
        id: 'artifact-2', kind: 'report', ticker: 'AAPL', source_key: 'report-1', title: 'Target raised',
        source: 'feed', url: null, published_at: '2026-09-03T00:00:00Z', fetched_at: '2026-09-04T00:00:00Z',
        event_cluster_id: 'cluster-2', quality_score: 0.8, content_hash: 'hash', updated_at: '2026-09-04T00:00:00Z',
        payload: { broker: 'Broker', rating: 'buy', target_price: '200:220', trust_score: 0.8 },
      }],
      error: null,
    }));
    const stored = await loadStoredStockResearch({ rpc, from: () => ({ select: () => query }) }, 'user-1', 'AAPL');
    expect(stored.news[0]).toMatchObject({ user_id: 'user-1', source_key: 'news-1', sentiment: 0.2 });
    expect(stored.reports[0]).toMatchObject({ user_id: 'user-1', source_key: 'report-1', target_price: '200:220' });
    expect(rpc).toHaveBeenCalledWith('load_watchlist_research_artifacts', {
      p_user_id: 'user-1', p_ticker: 'AAPL', p_limit: 50,
    });
  });
});
