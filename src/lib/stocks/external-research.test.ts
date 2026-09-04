import { describe, expect, it } from 'vitest';
import { mergeDuplicateReports } from './external-research';

describe('external research report merging', () => {
  it('merges duplicate broker records without dropping richer fields', () => {
    const merged = mergeDuplicateReports([
      {
        id: 'structured', title: 'Apple target', broker: 'Broker A', rating: 'buy',
        targetPriceMin: 180, targetPriceMax: 220, targetChangePct: null, url: null,
        publishedAt: '2026-09-01', source: 'tushare', trustScore: 0.78,
        qualityScore: 0.78, qualityFlags: ['dated_source'],
      },
      {
        id: 'web', title: 'Apple target', broker: 'Broker A', rating: null,
        targetPriceMin: null, targetPriceMax: null, targetChangePct: 0.1, url: null,
        publishedAt: '2026-09-01', source: 'tavily', trustScore: 0.68,
        qualityScore: 0.5, qualityFlags: ['unverified_source'],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ targetPriceMin: 180, targetPriceMax: 220, targetChangePct: 0.1, rating: 'buy' });
    expect(merged[0].qualityFlags).toEqual(expect.arrayContaining(['dated_source', 'unverified_source', 'provider_ranked']));
  });
});
