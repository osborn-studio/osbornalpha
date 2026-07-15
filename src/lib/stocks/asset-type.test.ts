import { describe, expect, it } from 'vitest';
import { classifyAssetType } from './asset-type';

describe('classifyAssetType', () => {
  it.each([
    [{ ticker: '600519.SH', name: '贵州茅台' }, 'stock'],
    [{ ticker: '510300.SH', name: '沪深300ETF', securityTypeName: 'ETF' }, 'etf'],
    [{ ticker: '159326.SZ', name: '电网设备ETF' }, 'etf'],
    [{ ticker: '113001.SH', name: '银行转债', securityTypeName: '可转债' }, 'convertible_bond'],
    [{ ticker: '123120.SZ', name: '隆华转债' }, 'convertible_bond'],
    [{ ticker: '161725.SZ', name: '招商白酒', securityTypeName: '基金' }, 'fund'],
    [{ ticker: '000001.SH', name: '上证指数', securityTypeName: '指数' }, 'index'],
    [{ ticker: '00700.HK', name: '腾讯控股' }, 'stock'],
    [{ ticker: 'AAPL', name: 'Apple' }, 'stock'],
    [{ ticker: '2330.TW', name: '台积电' }, 'stock'],
    [{ ticker: '???', name: 'Unknown' }, 'unknown'],
  ] as const)('classifies $0 as $1', (input, expected) => {
    expect(classifyAssetType(input)).toBe(expected);
  });

  it('prefers provider type information over a stock-like ticker', () => {
    expect(classifyAssetType({
      ticker: '600000.SH',
      name: '测试标的',
      securityTypeName: '交易型开放式指数基金',
      classify: '基金',
    })).toBe('etf');
  });

  it('accepts an explicit normalized provider asset type without extending the union', () => {
    expect(classifyAssetType({
      ticker: '510300.SH',
      name: 'provider classified fund',
      assetType: 'fund',
    })).toBe('fund');
  });
});
