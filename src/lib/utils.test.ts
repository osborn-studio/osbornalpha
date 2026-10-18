import { describe, it, expect } from 'vitest';
import { classifyMarket, currencyCodeOfMarket, formatPriceFor, formatSignedPrice } from './utils';

describe('classifyMarket — six markets', () => {
  it.each([
    ['600519.SH', 'A'], ['300750.SZ', 'A'], ['830799.BJ', 'A'],
    ['0700.HK', 'HK'], ['AAPL', 'US'], ['BRK.B', 'US'],
    ['7203.T', 'JP'], ['005930.KS', 'KR'], ['035720.KQ', 'KR'],
    ['2330.TW', 'TW'], ['5483.TWO', 'TW'], ['2330.tw', 'TW'], // 大小写
  ])('%s → %s', (t, m) => expect(classifyMarket(t)).toBe(m));
  // 关键陷阱：.TW 不能被 .T 规则吃掉（$ 锚定保证，测试锁死）
  it('.TW is not JP', () => expect(classifyMarket('2330.TW')).not.toBe('JP'));
});

describe('currencyCodeOfMarket', () => {
  it.each([
    ['A', 'CNY'],
    ['US', 'USD'],
    ['HK', 'HKD'],
  ] as const)('%s market uses %s', (market, currency) => {
    expect(currencyCodeOfMarket(market)).toBe(currency);
  });
});

describe('formatSignedPrice', () => {
  it('places the sign before the currency symbol', () => {
    expect(formatSignedPrice(10000, '¥')).toBe('+¥10,000.00');
    expect(formatSignedPrice(-250.5, '$')).toBe('-$250.50');
    expect(formatSignedPrice(0, 'HK$')).toBe('HK$0.00');
  });
});

describe('formatPriceFor', () => {
  it('uses three decimals for HK and keeps thousands separators', () => {
    expect(formatPriceFor('HK', 12.345)).toBe('12.345');
    expect(formatPriceFor('HK', 1234.5, 'HK$')).toBe('HK$1,234.500');
  });
  it.each(['A', 'US', 'JP', 'KR', 'TW'] as const)('%s keeps two decimals', (market) => {
    expect(formatPriceFor(market, 12.345)).toBe('12.35');
    expect(formatPriceFor(market, 1234.5, '$')).toBe('$1,234.50');
  });
});
