import { describe, expect, it } from 'vitest';
import { stockNewsArtifactRows, stockPerspectiveRows, stockReportArtifactRows } from './research-artifacts';

describe('research artifact persistence mapping', () => {
  it('creates stable shared news artifacts without inventing publication dates', () => {
    const response = {
      ticker: 'AAPL',
      items: [{
        id: 'web_1', title: 'Apple update', source: 'reuters.com', url: 'https://reuters.com/apple',
        snippet: 'Update', sentiment: 0.4, sentimentConfidence: 0.75, sentimentLanguage: 'en' as const,
        sentimentAspects: { earnings: { score: 0.5, confidence: 0.75, matches: ['beat'] } },
        publishedAt: null, fetchedAt: '2026-09-04T00:00:00Z',
        trustScore: 0.9, sourceType: 'news',
      }],
      meta: { status: 'complete' as const, providers: ['test'], fetchedAt: '2026-09-04T00:00:00Z', warnings: [] },
    };
    const first = stockNewsArtifactRows(response)[0];
    const second = stockNewsArtifactRows(response)[0];
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      kind: 'news', source_key: 'web_1', published_at: null,
      payload: {
        snippet: 'Update', trust_score: 0.9, sentiment_confidence: 0.75, sentiment_language: 'en',
        sentiment_aspects: { earnings: { score: 0.5, confidence: 0.75, matches: ['beat'] } },
      },
    });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('preserves structured report ranges and source identity', () => {
    const rows = stockReportArtifactRows({
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
      kind: 'report', source_key: 'ts_1', title: 'Research update', source: 'tushare',
      payload: { target_price: '1500:1700' },
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
        claims: [{ kind: 'thesis', text: 'Durable moat', dataCites: ['ROE'], citations: [] }],
      }],
      provenance: {
        modelVersion: 'test-model', promptVersion: 'prompt-v1', requestedAnalysisMode: 'evidence_required',
        resolvedAnalysisMode: 'evidence_backed', evidenceStatus: 'complete',
        evidenceRequestId: '550e8400-e29b-41d4-a716-446655440001',
        evidenceFetchedAt: '2026-09-04T00:00:00Z', evidenceResultCount: 4, evidenceCoverageRatio: 1,
      },
    });
    expect(rows[0]).toMatchObject({
      brief_id: null,
      generation_id: '550e8400-e29b-41d4-a716-446655440000',
      persona: 'buffett',
      citations: [],
      claims: [{ kind: 'thesis', text: 'Durable moat', dataCites: ['ROE'], citations: [] }],
      model_version: 'test-model',
      prompt_version: 'prompt-v1',
      requested_analysis_mode: 'evidence_required',
      resolved_analysis_mode: 'evidence_backed',
      evidence_status: 'complete',
      evidence_result_count: 4,
      evidence_coverage_ratio: 1,
    });
  });
});
