import { describe, expect, it } from 'vitest';
import {
  buildAliases,
  inferCoreMarket,
  isCompleteCodeQuery,
  normalizeSecurityTicker,
} from './normalize';

describe('normalizeSecurityTicker', () => {
  it.each([
    ['002463', 'A', '002463.SZ'],
    ['sz002463', 'A', '002463.SZ'],
    ['600519', 'A', '600519.SH'],
    ['430047', 'A', '430047.BJ'],
    ['700', 'HK', '00700.HK'],
    ['00700.HK', 'HK', '00700.HK'],
    ['brk-b', 'US', 'BRK.B'],
    ['BRK/B', 'US', 'BRK.B'],
    ['AAPL.O', 'US', 'AAPL'],
  ] as const)('%s in %s becomes %s', (input, market, expected) => {
    expect(normalizeSecurityTicker(input, market)).toBe(expected);
  });

  it('rejects malformed codes for the selected market', () => {
    expect(normalizeSecurityTicker('not a ticker', 'US')).toBeNull();
    expect(normalizeSecurityTicker('700', 'A')).toBeNull();
  });
});

describe('buildAliases', () => {
  it('builds canonical, vendor, name, full-pinyin and initials aliases', () => {
    const aliases = buildAliases({
      ticker: '002463.SZ',
      symbol: '002463',
      name: '沪电股份',
      market: 'A',
      source: 'tushare',
    });

    expect(aliases.map((row) => row.alias)).toEqual(expect.arrayContaining([
      '002463',
      '002463.sz',
      'sz002463',
      '沪电股份',
      'hudiangufen',
      'hdgf',
    ]));
  });

  it('deduplicates aliases with the same type', () => {
    const aliases = buildAliases({
      ticker: 'AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      market: 'US',
      source: 'nasdaq',
    });
    expect(new Set(aliases.map((row) => `${row.alias_type}:${row.alias}`)).size).toBe(aliases.length);
  });
});

describe('complete query detection', () => {
  it.each([
    ['002463', 'A'],
    ['00700.HK', 'HK'],
    ['700', 'HK'],
    ['AAPL', 'US'],
    ['BRK/B', 'US'],
  ] as const)('recognizes %s as %s', (query, market) => {
    expect(inferCoreMarket(query)).toBe(market);
    expect(isCompleteCodeQuery(query)).toBe(true);
  });

  it('does not treat a company name as a complete code', () => {
    expect(inferCoreMarket('沪电股份')).toBeNull();
    expect(isCompleteCodeQuery('沪电股份')).toBe(false);
  });
});
