import { describe, expect, it } from 'vitest';
import { buildPostAddInsight } from './insight';

describe('buildPostAddInsight', () => {
  it('describes positive movement without making a recommendation', () => {
    const insight = buildPostAddInsight({
      ticker: 'AAPL',
      assetType: 'stock',
      quote: { change_pct: 2.4, delayed: false },
    });

    expect(insight).toMatchObject({ tone: 'up', messageKey: 'positive', changePct: 2.4, stale: false });
  });

  it('describes negative and flat movement', () => {
    expect(buildPostAddInsight({
      ticker: '600519.SH',
      assetType: 'stock',
      quote: { change_pct: -1.1, delayed: false },
    }).messageKey).toBe('negative');
    expect(buildPostAddInsight({
      ticker: '510300.SH',
      assetType: 'etf',
      quote: { change_pct: 0.01, delayed: false },
    }).messageKey).toBe('flat');
  });

  it('exposes unavailable and stale states', () => {
    expect(buildPostAddInsight({ ticker: 'AAPL', assetType: 'stock', quote: null }))
      .toMatchObject({ messageKey: 'unavailable', tone: 'unknown', changePct: null, stale: false });
    expect(buildPostAddInsight({
      ticker: 'AAPL',
      assetType: 'stock',
      quote: { change_pct: 0, delayed: true },
    }).stale).toBe(true);
  });
});
