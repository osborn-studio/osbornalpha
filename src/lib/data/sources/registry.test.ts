import { describe, it, expect } from 'vitest';
import { quoteSourcesFor } from './registry';

describe('quoteSourcesFor', () => {
  it('routes markets to sources', () => {
    expect(quoteSourcesFor('A').map((s) => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('HK').map((s) => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('US').map((s) => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('TW').map((s) => s.name)).toEqual(['twse']);
    expect(quoteSourcesFor('JP').map((s) => s.name)).toEqual([]); // EODHD 未配置
    expect(quoteSourcesFor('KR').map((s) => s.name)).toEqual([]); // EODHD 未配置
  });
});
