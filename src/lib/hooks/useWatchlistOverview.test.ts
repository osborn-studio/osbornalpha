import { describe, expect, it } from 'vitest';
import { watchlistOverviewQueryString } from './useWatchlistOverview';

describe('watchlistOverviewQueryString', () => {
  it('serializes the complete typed server-query contract', () => {
    const query = new URLSearchParams(watchlistOverviewQueryString({
      sort: 'rsi14',
      direction: 'desc',
      query: '  apple  ',
      groupId: '11111111-1111-5111-8111-111111111111',
      market: 'US',
      quoteStatus: 'live',
      decisionStatus: 'watching',
      tag: '  core  ',
      historyRange: '1y',
      metric: 'rsi14',
      metricMin: 30,
      metricMax: 70,
    }));
    expect(Object.fromEntries(query)).toEqual({
      sort: 'rsi14',
      direction: 'desc',
      q: 'apple',
      groupId: '11111111-1111-5111-8111-111111111111',
      market: 'US',
      quoteStatus: 'live',
      decisionStatus: 'watching',
      tag: 'core',
      historyRange: '1y',
      metric: 'rsi14',
      metricMin: '30',
      metricMax: '70',
    });
  });

  it('omits empty and non-finite optional values', () => {
    const query = new URLSearchParams(watchlistOverviewQueryString({
      sort: 'position',
      direction: 'asc',
      query: ' ',
      tag: ' ',
      metricMin: Number.NaN,
      metricMax: Number.POSITIVE_INFINITY,
    }));
    expect(Object.fromEntries(query)).toEqual({ sort: 'position', direction: 'asc' });
  });
});
