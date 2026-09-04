import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  income: vi.fn(),
  balance: vi.fn(),
  cashflow: vi.fn(),
  indicator: vi.fn(),
}));

vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: mocks.configured,
  fetchTushareIncomePeriods: mocks.income,
  fetchTushareBalancePeriods: mocks.balance,
  fetchTushareCashflowPeriods: mocks.cashflow,
  fetchTushareFinaIndicator: mocks.indicator,
}));

import { GET } from './route';

describe('GET /api/financials/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.income.mockResolvedValue([
      { ts_code: '600519.SH', end_date: '20250331', revenue: 10e8, total_revenue: 10e8, n_income: 2e8, basic_eps: 1, diluted_eps: 1 },
      { ts_code: '600519.SH', end_date: '20250630', revenue: 25e8, total_revenue: 25e8, n_income: 5e8, basic_eps: 2.5, diluted_eps: 2.5 },
    ]);
    mocks.balance.mockResolvedValue([]);
    mocks.cashflow.mockResolvedValue([]);
    mocks.indicator.mockResolvedValue(null);
  });

  it('returns period-derived quarterly rows while preserving the annual response field', async () => {
    const response = await GET(new Request('https://example.test/api/financials/600519.SH'), {
      params: Promise.resolve({ ticker: '600519.SH' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.income).toHaveBeenCalledWith('600519.SH', 20);
    expect(body.yearly).toEqual([]);
    expect(body.quarterly).toEqual([
      expect.objectContaining({ quarter: 'Q1', revenue_yi: 10, net_income_yi: 2 }),
      expect.objectContaining({ quarter: 'Q2', revenue_yi: 15, net_income_yi: 3 }),
    ]);
    expect(body.ttm).toBeNull();
    expect(body.meta).toMatchObject({ reportingFrequency: 'quarterly', availableQuarterlyPeriods: 2, ttmAvailable: false });
  });

  it('returns an explicit unsupported contract for non-A-share tickers', async () => {
    const response = await GET(new Request('https://example.test/api/financials/AAPL'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: 'unsupported', ticker: 'AAPL', yearly: [], quarterly: [], ttm: null,
      meta: { supported: false, reportingFrequency: 'unsupported', availableQuarterlyPeriods: 0, ttmAvailable: false },
    });
    expect(mocks.income).not.toHaveBeenCalled();
  });
});
