import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  income: vi.fn(),
  balance: vi.fn(),
  cashflow: vi.fn(),
  indicator: vi.fn(),
  secLoad: vi.fn(),
}));

vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: mocks.configured,
  fetchTushareIncomePeriods: mocks.income,
  fetchTushareBalancePeriods: mocks.balance,
  fetchTushareCashflowPeriods: mocks.cashflow,
  fetchTushareFinaIndicator: mocks.indicator,
}));

vi.mock('@/lib/financials/providers/sec-company-facts', () => ({
  secCompanyFactsProvider: {
    id: 'sec-companyfacts',
    supports: (market: string) => market === 'US',
    load: mocks.secLoad,
  },
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
    mocks.secLoad.mockResolvedValue({
      source: 'sec-companyfacts', ticker: 'AAPL', yearly: [], quarterly: [], ttm: null, latestIndicator: null,
      meta: {
        source: 'sec-companyfacts', market: 'US', supported: true, availability: 'unavailable',
        currency: 'USD', unit: 'USD_MILLION', unitScale: 1e6, reportingFrequency: 'quarterly',
        latestPeriodEnd: null, availablePeriods: 0, availableQuarterlyPeriods: 0, ttmAvailable: false,
        coverage: { income: 0, balance: 0, cashflow: 0, indicator: false }, warnings: ['no_facts'],
      },
    });
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
      expect.objectContaining({ quarter: 'Q1', revenue: 10, netIncome: 2 }),
      expect.objectContaining({ quarter: 'Q2', revenue: 15, netIncome: 3 }),
    ]);
    expect(body.ttm).toBeNull();
    expect(body.meta).toMatchObject({ reportingFrequency: 'quarterly', availableQuarterlyPeriods: 2, ttmAvailable: false });
  });

  it('routes US tickers to SEC Company Facts', async () => {
    const response = await GET(new Request('https://example.test/api/financials/AAPL'), {
      params: Promise.resolve({ ticker: 'AAPL' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: 'sec-companyfacts', ticker: 'AAPL', yearly: [], quarterly: [], ttm: null,
      meta: { supported: true, market: 'US', reportingFrequency: 'quarterly' },
    });
    expect(mocks.secLoad).toHaveBeenCalledWith('AAPL');
    expect(mocks.income).not.toHaveBeenCalled();
  });

  it('returns an explicit unsupported contract when no provider owns the market', async () => {
    const response = await GET(new Request('https://example.test/api/financials/0700.HK'), {
      params: Promise.resolve({ ticker: '0700.HK' }),
    });
    const body = await response.json();
    expect(body).toMatchObject({ source: 'unsupported', ticker: '0700.HK', meta: { supported: false, market: 'HK' } });
  });
});
