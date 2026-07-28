import { describe, it, expect, vi } from 'vitest';
import { parseMisQuote, parseStockDayBars, twseExCh, aggregateBars } from './twse';

describe('twseExCh', () => {
  it('maps .TW to tse and .TWO to otc', () => {
    expect(twseExCh('2330.TW')).toBe('tse_2330.tw');
    expect(twseExCh('5483.TWO')).toBe('otc_5483.tw');
  });
});

describe('parseMisQuote', () => {
  const msg = { c: '2330', n: '台積電', z: '1,085.00', y: '1,080.00', o: '1,082.00',
    h: '1,090.00', l: '1,078.00', v: '25,331', d: '20260706', t: '13:30:00' };
  it('coerces comma-separated strings to numbers', () => {
    const q = parseMisQuote(msg, '2330.TW')!;
    expect(q.price).toBe(1085);            // 千分位剥离（TWSE 全是带逗号字符串！）
    expect(q.prev_close).toBe(1080);
    expect(q.change_pct).toBeCloseTo(0.463, 2);
    expect(q.currency).toBe('NT$');
    expect(q.market).toBe('TW');
  });
  it('returns null when z is "-" (no trade yet)', () => {
    expect(parseMisQuote({ ...msg, z: '-' }, '2330.TW')).toBeNull();
  });
});

describe('parseStockDayBars', () => {
  it('parses TWSE STOCK_DAY rows (comma numbers, ROC dates)', () => {
    const rows = [['115/07/06', '25,331,405', '27,462,105,140', '1,082.00', '1,090.00', '1,078.00', '1,085.00', '+5.00', '18,204']];
    const bars = parseStockDayBars(rows);
    expect(bars[0]).toMatchObject({ date: '2026-07-06', open: 1082, high: 1090, low: 1078, close: 1085 });
    expect(bars[0].volume).toBe(25331405);
  });
});

describe('aggregateBars', () => {
  // 2026-07-06 (Mon) .. 2026-07-10 (Fri) are ISO week 28; 2026-07-13 (Mon) is week 29.
  const daily = [
    { date: '2026-07-06', open: 100, high: 110, low: 95, close: 105, volume: 10 },
    { date: '2026-07-07', open: 105, high: 120, low: 104, close: 118, volume: 20 },
    { date: '2026-07-13', open: 118, high: 125, low: 117, close: 121, volume: 5 },
  ];
  it('aggregates daily bars into ISO weeks', () => {
    const w = aggregateBars(daily, 'W');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ date: '2026-07-07', open: 100, high: 120, low: 95, close: 118, volume: 30 });
    expect(w[1]).toMatchObject({ date: '2026-07-13', open: 118, high: 125, low: 117, close: 121, volume: 5 });
  });
  it('aggregates daily bars into calendar months', () => {
    const withAug = [...daily, { date: '2026-08-03', open: 121, high: 130, low: 120, close: 128, volume: 7 }];
    const m = aggregateBars(withAug, 'M');
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ date: '2026-07-13', open: 100, high: 125, low: 95, close: 121, volume: 35 });
    expect(m[1]).toMatchObject({ date: '2026-08-03', open: 121, high: 130, low: 120, close: 128, volume: 7 });
  });
});

describe('fetchTwseQuotesBatch — board demux (tse vs otc code collision)', () => {
  it('does not clobber quotes when a TSE and TPEx listing share a numeric code', async () => {
    const { fetchTwseQuotesBatch } = await import('./twse');
    const msg = (ex: string, c: string, z: string) => ({
      ex, c, n: ex === 'tse' ? '上市同碼' : '上櫃同碼',
      z, y: '100.00', o: '100.00', h: '110.00', l: '95.00', v: '1,000',
      d: '20260706', t: '13:30:00',
    });
    const stub = vi.fn(async () => new Response(JSON.stringify({
      msgArray: [msg('tse', '9999', '105.00'), msg('otc', '9999', '55.00')],
    }), { status: 200 }));
    vi.stubGlobal('fetch', stub);
    try {
      const m = await fetchTwseQuotesBatch(['9999.TW', '9999.TWO']);
      expect(m.get('9999.TW')?.price).toBe(105);
      expect(m.get('9999.TWO')?.price).toBe(55);
      expect(stub).toHaveBeenCalledTimes(1); // one mis request for both
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
