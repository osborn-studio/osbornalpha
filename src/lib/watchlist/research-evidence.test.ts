import { describe, expect, it } from 'vitest';
import type { StockNewsItem, StockReportItem } from '@/lib/stocks/research-types';
import { buildWatchlistResearchEvidence } from './research-evidence';

describe('Watchlist research evidence projection', () => {
  it('builds separate facts and inspectable sources from existing artifacts', () => {
    const news: StockNewsItem = {
      id: 'news-1', title: 'Revenue beats estimates', source: 'reuters.com',
      url: 'https://reuters.com/item', snippet: 'Revenue increased.', sentiment: 0.4,
      sentimentConfidence: 0.8, publishedAt: '2026-09-04T00:00:00Z',
      fetchedAt: '2026-09-05T00:00:00Z', trustScore: 0.78, qualityScore: 0.8,
      qualityFlags: ['professional_source', 'dated_source', 'snippet_available'],
      corroborationCount: 2, sourceType: 'news',
    };
    const report: StockReportItem = {
      id: 'report-1', title: 'Target raised', broker: 'Broker', rating: 'buy', ratingNormalized: 'buy',
      targetPriceMin: 200, targetPriceMax: 220, targetChangePct: 12, url: 'https://broker.example/report',
      publishedAt: '2026-09-03T00:00:00Z', source: 'structured', trustScore: 0.8,
      qualityScore: 0.78, qualityFlags: ['professional_source', 'dated_source'],
    };

    const projection = buildWatchlistResearchEvidence([news], [report]);
    expect(projection.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'market_event', direction: 'positive', sourceIds: ['source:news:news-1'] }),
      expect.objectContaining({ kind: 'broker_view', direction: 'positive', metrics: { targetPriceMin: 200, targetPriceMax: 220, targetChangePct: 12 } }),
    ]));
    expect(projection.sources[0]).toMatchObject({ eligibleForAnalysis: true, corroborationCount: 2 });
    expect(projection.facts[0]).toMatchObject({ sourceCount: 1, conflicted: false });
    expect(projection.quality).toMatchObject({ totalSources: 2, eligibleSources: 2, datedSources: 2, conflictedFacts: 0 });
  });

  it('surfaces quality filtering without dropping displayable sources', () => {
    const news: StockNewsItem = {
      id: 'news-1', title: 'Undated rumor', source: 'blog.example', url: 'https://blog.example/item',
      snippet: '', sentiment: null, publishedAt: null, fetchedAt: '2026-09-05T00:00:00Z',
      trustScore: 0.55, qualityScore: 0.5, qualityFlags: ['unverified_source'], sourceType: 'news',
    };
    const projection = buildWatchlistResearchEvidence([news], []);
    expect(projection.sources[0]).toMatchObject({
      eligibleForAnalysis: false,
      qualityIssues: expect.arrayContaining(['missing_publication_date', 'low_trust_source']),
    });
    expect(projection.facts).toEqual([]);
    expect(projection.quality.warnings).toEqual(['research_sources_quality_filtered']);
  });

  it('folds sources from one event and surfaces directional conflicts', () => {
    const base: StockNewsItem = {
      id: 'news-1', title: 'Management updates guidance', source: 'wire-a.example',
      url: 'https://wire-a.example/item', snippet: 'Guidance changed.', sentiment: 0.6,
      sentimentConfidence: 0.8, publishedAt: '2026-09-04T00:00:00Z',
      fetchedAt: '2026-09-05T00:00:00Z', trustScore: 0.8, qualityScore: 0.8,
      qualityFlags: ['professional_source', 'dated_source', 'snippet_available'],
      eventClusterId: 'guidance-event', sourceType: 'news',
    };
    const projection = buildWatchlistResearchEvidence([
      base,
      { ...base, id: 'news-2', source: 'wire-b.example', sentiment: -0.5 },
    ], []);

    expect(projection.facts).toHaveLength(1);
    expect(projection.facts[0]).toMatchObject({
      direction: 'unknown',
      conflicted: true,
      sourceCount: 2,
      sourceIds: ['source:news:news-1', 'source:news:news-2'],
    });
    expect(projection.quality).toMatchObject({ conflictedFacts: 1 });
    expect(projection.quality.warnings).toContain('research_fact_conflicts');
  });
});
