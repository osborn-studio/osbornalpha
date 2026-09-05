import { describe, expect, it, vi } from 'vitest';
import type { BrokerReport, NewsItem, Perspective } from '@/lib/supabase/database.types';
import { mapStoredWatchlistResearch, refreshWatchlistResearch } from './research-service';

const now = new Date('2026-09-04T12:00:00.000Z');

describe('watchlist research service', () => {
  it('maps stored artifacts into one read model and flags stale sections', () => {
    const bundle = mapStoredWatchlistResearch('AAPL', {
      news: [{
        id: 'news-1', user_id: 'user-1', ticker: 'AAPL', source_key: 'citation-1', title: 'Apple update',
        source: 'reuters.com', url: 'https://reuters.com/apple', snippet: 'Update', sentiment: 0.4,
        published_at: '2026-09-03T00:00:00Z', fetched_at: '2026-09-04T11:00:00Z', trust_score: 0.9,
        source_type: 'news',
      } as NewsItem, {
        id: 'news-2', user_id: 'user-1', ticker: 'AAPL', source_key: 'metadata-1', title: 'Exchange bulletin',
        source: 'exchange', url: null, snippet: null, sentiment: null, published_at: null,
        fetched_at: '2026-09-04T10:00:00Z', trust_score: 0.7, source_type: 'filing',
      } as NewsItem],
      reports: [{
        id: 'report-1', user_id: 'user-1', ticker: 'AAPL', source_key: 'report-key', title: 'Apple target raised',
        broker: 'Broker', rating: 'buy', target_price: '200:240', target_change_pct: 12, pdf_url: null,
        ai_summary: null, published_at: '2026-08-01T00:00:00Z', fetched_at: '2026-09-03T00:00:00Z',
        source: 'tushare', trust_score: 0.78,
      } as BrokerReport],
      perspectives: [],
    }, now);

    expect(bundle.news.meta.status).toBe('complete');
    expect(bundle.news.items[0]).toMatchObject({ id: 'citation-1', trustScore: 0.9 });
    expect(bundle.news.items[1]).toMatchObject({ id: 'metadata-1', url: null });
    expect(bundle.reports.meta.status).toBe('partial');
    expect(bundle.reports.consensus).toMatchObject({ targetMedian: 220, count: 1 });
  });

  it('persists both live sections and reports a complete refresh', async () => {
    const dependencies = {
      getNews: vi.fn(async () => ({ ticker: 'AAPL', items: [], meta: { status: 'complete' as const, providers: [], fetchedAt: now.toISOString(), warnings: [] } })),
      getReports: vi.fn(async () => ({ ticker: 'AAPL', items: [], consensus: null, meta: { status: 'complete' as const, providers: [], fetchedAt: now.toISOString(), warnings: [] } })),
      persistNews: vi.fn(async () => undefined),
      persistReports: vi.fn(async () => undefined),
      now: () => now,
    };
    await expect(refreshWatchlistResearch({}, 'user-1', 'AAPL', dependencies)).resolves.toMatchObject({
      status: 'complete', newsUpdated: true, reportsUpdated: true, refreshedAt: now.toISOString(),
    });
  });

  it('keeps claim-level evidence in the public research read model', () => {
    const claims = [{
      kind: 'risk' as const,
      text: 'Margins may compress.',
      dataCites: ['gross_margin'],
      citations: [{
        id: 'web_1#p2', title: 'Filing', url: 'https://example.com/filing', domain: 'example.com',
        publishedAt: '2026-09-01T00:00:00Z', trustScore: 0.9, excerpt: 'Input costs increased.',
      }],
    }];
    const bundle = mapStoredWatchlistResearch('AAPL', {
      news: [],
      reports: [],
      perspectives: [{
        id: 'perspective-1', persona: 'marks', stance: 'bearish', confidence: 7,
        summary: 'Margin risk', cites: ['gross_margin'], citations: [], claims,
        model_version: 'model', prompt_version: 'prompt', requested_analysis_mode: 'auto',
        resolved_analysis_mode: 'evidence_backed', evidence_status: 'complete',
        evidence_request_id: null, evidence_fetched_at: null, evidence_result_count: 1,
        evidence_coverage_ratio: 1, created_at: now.toISOString(),
      } as unknown as Perspective],
    }, now);

    expect(bundle.perspectives[0]).toMatchObject({ claims });
  });

  it('keeps a successful section when the other provider fails', async () => {
    const dependencies = {
      getNews: vi.fn(async () => ({ ticker: 'AAPL', items: [], meta: { status: 'complete' as const, providers: [], fetchedAt: now.toISOString(), warnings: [] } })),
      getReports: vi.fn(async () => { throw new Error('provider down'); }),
      persistNews: vi.fn(async () => undefined),
      persistReports: vi.fn(async () => undefined),
      now: () => now,
    };
    await expect(refreshWatchlistResearch({}, 'user-1', 'AAPL', dependencies)).resolves.toMatchObject({
      status: 'partial', newsUpdated: true, reportsUpdated: false, warnings: ['reports_refresh_failed'],
    });
    expect(dependencies.persistReports).not.toHaveBeenCalled();
  });
});
