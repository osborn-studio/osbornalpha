import { describe, it, expect } from 'vitest';
import { classifyMarket } from './utils';

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
