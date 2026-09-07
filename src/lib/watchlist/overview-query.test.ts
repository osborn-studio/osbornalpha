import { describe, expect, it } from 'vitest';
import {
  encodeWatchlistOverviewQueryCursor,
  parseWatchlistOverviewQuery,
  watchlistOverviewServerSort,
} from './overview-query';

describe('Watchlist overview query contract', () => {
  it('parses bounded, typed server query arguments', () => {
    const parsed = parseWatchlistOverviewQuery(new URL(
      'https://example.test?sort=change&direction=desc&q=apple&market=US&quoteStatus=live&decisionStatus=watching&tag=core&metric=rsi14&metricMin=30&metricMax=70&limit=500',
    ));
    expect(parsed).toMatchObject({
      active: true, invalid: false, sort: 'change', direction: 'desc', query: 'apple',
      market: 'US', quoteStatus: 'live', decisionStatus: 'watching', tag: 'core',
      metric: 'rsi14', metricMin: 30, metricMax: 70, limit: 50,
    });
    expect(parsed.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('rejects unknown fields and inverted numeric ranges', () => {
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?sort=quality')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?sort=rsi14&metric=rsi14&metricMin=80&metricMax=20')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?sort=change&metricMin=20')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?metric=quality')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?market=XX')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?quoteStatus=loading')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?sort=averageTradedAmount20')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?metric=averageTradedAmount20&metricMin=1')).invalid).toBe(true);
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?sort=averageTradedAmount20&market=US')).invalid).toBe(false);
  });

  it('binds cursors to the complete query fingerprint', () => {
    const first = parseWatchlistOverviewQuery(new URL('https://example.test?sort=rsi14&direction=asc'));
    const cursor = encodeWatchlistOverviewQueryCursor({
      mode: 'query', fingerprint: first.fingerprint, nullRank: 0,
      sortNumber: 55, sortText: null, itemId: '11111111-1111-5111-8111-111111111111',
    });
    const continuation = parseWatchlistOverviewQuery(new URL(
      `https://example.test?sort=rsi14&direction=asc&cursor=${cursor}`,
    ));
    expect(continuation.invalid).toBe(false);
    expect(continuation.cursor).toMatchObject({ sortNumber: 55 });

    const changed = parseWatchlistOverviewQuery(new URL(
      `https://example.test?sort=rsi14&direction=desc&cursor=${cursor}`,
    ));
    expect(changed.invalid).toBe(true);

    const changedMetric = parseWatchlistOverviewQuery(new URL(
      `https://example.test?sort=rsi14&direction=asc&metric=price&cursor=${cursor}`,
    ));
    expect(changedMetric.invalid).toBe(true);
  });

  it('keeps the legacy overview inactive when no server query fields are present', () => {
    expect(parseWatchlistOverviewQuery(new URL('https://example.test?limit=50'))).toMatchObject({
      active: false, invalid: false,
    });
  });

  it('only advertises columns backed by persisted server data', () => {
    expect(watchlistOverviewServerSort('rsi14')).toBe('rsi14');
    expect(watchlistOverviewServerSort('decision')).toBe('decision');
    expect(watchlistOverviewServerSort('price')).toBe('price');
    expect(watchlistOverviewServerSort('change')).toBe('change');
    expect(watchlistOverviewServerSort('dayPosition')).toBe('dayPosition');
    expect(watchlistOverviewServerSort('periodReturn')).toBe('periodReturn');
    expect(watchlistOverviewServerSort('updated')).toBe('freshness');
    expect(watchlistOverviewServerSort('relativeStrengthRank')).toBe('relativeStrengthRank');
    expect(watchlistOverviewServerSort('pePercentile')).toBe('pePercentile');
    expect(watchlistOverviewServerSort('averageTradedAmount20')).toBe('averageTradedAmount20');
    expect(watchlistOverviewServerSort('quality')).toBeNull();
  });

  it('accepts peer-backed complete-dataset metric filters', () => {
    expect(parseWatchlistOverviewQuery(new URL(
      'https://example.test?sort=relativeStrengthRank&direction=desc&metric=liquidityPercentile&metricMin=70',
    ))).toMatchObject({
      invalid: false,
      sort: 'relativeStrengthRank',
      metric: 'liquidityPercentile',
      metricMin: 70,
    });
  });
});
