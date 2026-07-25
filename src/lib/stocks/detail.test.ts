import { describe, expect, it } from 'vitest';
import type { MockStock } from '@/lib/data/mock';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { mergeStockDetail } from './detail';

const liveQuote: LiveQuote = {
  source: 'eastmoney',
  ticker: '688472.SH',
  name: '阿特斯',
  market: 'A',
  currency: '¥',
  price: 12.34,
  change: 0.56,
  change_pct: 4.75,
  open: 11.9,
  high: 12.5,
  low: 11.8,
  prev_close: 11.78,
  volume: 10_000,
  amount: 123_000_000,
  amplitude: 5.94,
  market_cap: 50_000_000_000,
  market_cap_label: '¥500亿',
  pe_ttm: 18.2,
  pb: 1.8,
  roe: 9.1,
  dividend_yield: 0.8,
  turnover: 2.1,
  volume_ratio: 1.2,
  updated_at: '2026-07-25T08:00:00.000Z',
  delayed: true,
};

const mockStock: MockStock = {
  ticker: '688472.SH',
  name: '旧名称',
  market: 'A',
  currency: '¥',
  price: 10,
  change: 0,
  change_pct: 0,
  open: 10,
  high: 10,
  low: 10,
  prev_close: 10,
  volume_value: 1,
  amplitude: 0,
  market_cap: '—',
  pe_ttm: 0,
  pb: 0,
  roe: 0,
  dividend_yield: 0,
  high_52w: 15,
  low_52w: 8,
  next_earnings: '—',
  sentinel_score: 0,
  triggers: [],
  perspectives: [],
  news: [],
  broker_reports: [],
  financials: { years: [], revenue: [], net_income: [], roe: [] },
};

describe('mergeStockDetail', () => {
  it('builds a usable detail model for a valid live security absent from mock data', () => {
    const result = mergeStockDetail('688472.SH', null, liveQuote);

    expect(result).toMatchObject({
      ticker: '688472.SH',
      name: '阿特斯',
      price: 12.34,
      volume_value: 123_000_000,
      market_cap: '¥500亿',
      pe_ttm: 18.2,
    });
    expect(result?.broker_reports).toEqual([]);
    expect(result?.financials.years).toEqual([]);
  });

  it('overlays live quote fields without discarding richer mock-only detail', () => {
    const result = mergeStockDetail('688472.SH', mockStock, liveQuote);

    expect(result?.name).toBe('阿特斯');
    expect(result?.price).toBe(12.34);
    expect(result?.high_52w).toBe(15);
    expect(result?.low_52w).toBe(8);
  });

  it('returns null only when neither live nor fallback data exists', () => {
    expect(mergeStockDetail('MISSING', null, null)).toBeNull();
  });
});
