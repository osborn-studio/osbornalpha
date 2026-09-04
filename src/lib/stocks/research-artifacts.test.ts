import { describe, expect, it } from 'vitest';
import { stockNewsRows, stockPerspectiveRows, stockReportRows } from './research-artifacts';

describe('research artifact persistence mapping', () => {
  it('creates stable user-scoped news rows without inventing publication dates', () => {
    const response = {
      ticker: 'AAPL',
      items: [{
        id: 'web_1', title: 'Apple update', source: 'reuters.com', url: 'https://reuters.com/apple',
        snippet: 'Update', sentiment: 0.4, publishedAt: null, fetchedAt: '2026-09-04T00:00:00Z',
        trustScore: 0.9, sourceType: 'news',
      }],
      meta: { status: 'complete' as const, providers: ['test'], fetchedAt: '2026-09-04T00:00:00Z', warnings: [] },
    };
    const first = stockNewsRows('user-1', response)[0];
    const second = stockNewsRows('user-1', response)[0];
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({ source_key: 'web_1', published_at: null, snippet: 'Update', trust_score: 0.9 });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves structured report ranges and source identity', () => {
    const rows = stockReportRows('user-1', {
      ticker: '600519.SH',
      items: [{
        id: 'ts_1', title: 'Research update', broker: 'Broker', rating: 'buy',
        targetPriceMin: 1500, targetPriceMax: 1700, targetChangePct: 12, url: null,
        publishedAt: '2026-09-03T00:00:00Z', source: 'tushare', trustScore: 0.78,
      }],
      consensus: null,
      meta: { status: 'complete', providers: ['tushare'], fetchedAt: '2026-09-04T00:00:00Z', warnings: [] },
    });
    expect(rows[0]).toMatchObject({
      source_key: 'ts_1', title: 'Research update', target_price: '1500:1700', source: 'tushare',
    });
  });

  it('groups generated perspectives under one durable generation id', () => {
    const rows = stockPerspectiveRows('user-1', {
      ticker: 'AAPL',
      generationId: '550e8400-e29b-41d4-a716-446655440000',
      source: 'deepseek:model',
      createdAt: '2026-09-04T00:00:00Z',
      perspectives: [{
        persona: 'buffett', name: 'Buffett', stance: 'bullish', confidence: 8,
        summary: 'Durable moat', cites: ['ROE'], citations: [],
      }],
    });
    expect(rows[0]).toMatchObject({
      brief_id: null,
      generation_id: '550e8400-e29b-41d4-a716-446655440000',
      persona: 'buffett',
      citations: [],
    });
  });
});
