import { describe, expect, it } from 'vitest';
import { buildFinancialReport } from './financials';

describe('buildFinancialReport', () => {
  it('keeps report periods aligned and publishes explicit units and coverage', () => {
    const report = buildFinancialReport({
      income: [{ ts_code: '600519.SH', end_date: '20251231', revenue: 2e9, total_revenue: 2.1e9, n_income: 8e8, basic_eps: 6.2, diluted_eps: 6.2 }],
      balance: [{ ts_code: '600519.SH', end_date: '20251231', total_assets: 5e9, total_liab: 1e9, total_hldr_eqy_inc_min_int: 4e9, total_share: 1, money_cap: 1 }],
      cashflow: [],
      indicator: null,
      warnings: ['cashflow_unavailable'],
    });

    expect(report.yearly).toEqual([expect.objectContaining({
      year: 2025,
      periodEnd: '20251231',
      revenue_yi: 20,
      net_income_yi: 8,
      total_assets_yi: 50,
      op_cashflow_yi: null,
    })]);
    expect(report.meta).toMatchObject({
      currency: 'CNY', unit: 'CNY_100M', unitScale: 1e8,
      latestPeriodEnd: '20251231', availablePeriods: 1,
      coverage: { income: 1, balance: 1, cashflow: 0, indicator: false },
      warnings: ['cashflow_unavailable'],
    });
  });

  it('ignores non-annual rows instead of labeling them as years', () => {
    const report = buildFinancialReport({
      income: [{ ts_code: '600519.SH', end_date: '20250930', revenue: 1, total_revenue: 1, n_income: 1, basic_eps: 1, diluted_eps: 1 }],
      balance: [], cashflow: [], indicator: null,
    });
    expect(report.yearly).toEqual([]);
  });
});
