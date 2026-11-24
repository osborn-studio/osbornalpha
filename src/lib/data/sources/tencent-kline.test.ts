import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTencentUsKline, parseTencentKlineResponse, tencentKlineTarget } from './tencent';

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
    expect(bars).toEqual([{ time: '2026-08-11', open: 1348, close: 1346.5, high: 1352.65, low: 1338, volume: 2707300 }]);
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

describe('Tencent US unadjusted history', () => {
  afterEach(() => vi.unstubAllGlobals());

  const splitBars = [
    ['2024-06-06', '1240', '1209.98', '1250', '1180', '5000'],
    ['2024-06-07', '1200', '1208.88', '1216', '1180', '6000'],
    ['2024-06-10', '120', '121.79', '124', '118', '7000'],
  ];

  function history(listing: string, bars = splitBars, echoedListing = listing) {
    const symbol = `us${listing}`;
    return Response.json({ code: 0, data: { [symbol]: { day: bars, qt: { [symbol]: ['200', '', echoedListing] } } } });
  }

  it.each([
    ['nvda', 'NVDA', 'NVDA.OQ'],
    ['BRK-B', 'BRK.B', 'BRK.B.N'],
    ['SPY', 'SPY', 'SPY.AM'],
  ])('resolves %s to its actual exchange and preserves unadjusted daily closes', async (input, ticker, listing) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(`v_us${ticker}="200~Example~${listing}~1";\n`))
      .mockResolvedValueOnce(history(listing));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTencentUsKline(input, 300);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://qt.gtimg.cn/q=us${ticker}`);
    expect(fetchMock.mock.calls[1][0]).toContain(`param=us${listing},day,,,300,bfq`);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(fetchMock.mock.calls[0][1]?.signal);
    expect(result?.adjustment).toBe('none');
    expect(result?.bars.map((b) => b.close)).toEqual([1209.98, 1208.88, 121.79]);
    expect(result?.bars[2].volume).toBe(7000);
  });

  it.each([
    'v_usBRK.B="200~Berkshire~BRK.A.N~1";',
    'v_usBRK.A="200~Berkshire~BRK.B.N~1";',
    'v_usBRK.B="200~Berkshire~BRK.B.UNVERIFIED~1";',
    'v_pv_none_match="1";',
  ])('rejects mismatched identities and unsupported listings before loading history', async (quote) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(quote));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchTencentUsKline('BRK.B', 300)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched identity in the history response and the known sentinel rows', async () => {
    const quote = 'v_usNVDA="200~NVIDIA~NVDA.OQ~1";';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(quote)).mockResolvedValueOnce(history('NVDA.OQ', splitBars, 'NVDA.N'))
      .mockResolvedValueOnce(new Response(quote)).mockResolvedValueOnce(history('NVDA.OQ', splitBars.slice(0, 2))));
    await expect(fetchTencentUsKline('NVDA', 300)).rejects.toThrow(/does not match/);
    expect(await fetchTencentUsKline('NVDA', 300)).toBeNull();
  });
});
