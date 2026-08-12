import { describe, expect, it } from 'vitest';
import { parseTencentKlineResponse, tencentKlineTarget } from './tencent';

describe('Tencent historical K-line adapter', () => {
  it('only declares verified market and adjustment combinations', () => {
    expect(tencentKlineTarget('600519.SH', 'qfq')).toMatchObject({ symbol: 'sh600519', dataKey: 'qfqday' });
    expect(tencentKlineTarget('00700.HK', 'none')).toMatchObject({ symbol: 'hk00700', dataKey: 'day' });
    expect(tencentKlineTarget('600519.SH', 'none')).toBeNull();
    expect(tencentKlineTarget('830799.BJ', 'qfq')).toBeNull();
    expect(tencentKlineTarget('NVDA', 'none')).toBeNull();
  });

  it('parses the documented six leading row fields and ignores corporate-action metadata', () => {
    const target = tencentKlineTarget('600519.SH', 'qfq')!;
    const bars = parseTencentKlineResponse({
      code: 0,
      data: {
        sh600519: {
          qfqday: [['2026-08-11', '1348.000', '1346.500', '1352.650', '1338.000', '27073.000', { event: true }]],
        },
      },
    }, target);
    expect(bars).toEqual([{ time: '2026-08-11', open: 1348, close: 1346.5, high: 1352.65, low: 1338, volume: 27073 }]);
  });

  it('fails closed when Tencent changes the expected response key', () => {
    const target = tencentKlineTarget('00700.HK', 'none')!;
    expect(() => parseTencentKlineResponse({ code: 0, data: { hk00700: { unexpected: [] } } }, target)).toThrow(/missing day/);
  });

  it('fails closed instead of silently dropping malformed rows', () => {
    const target = tencentKlineTarget('600519.SH', 'qfq')!;
    expect(() => parseTencentKlineResponse({
      code: 0,
      data: { sh600519: { qfqday: [['2026-08-11', '1']] } },
    }, target)).toThrow(/row schema changed/);
  });
});
