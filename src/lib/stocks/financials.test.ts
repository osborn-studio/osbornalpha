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

  it('derives discrete quarters from cumulative statements and calculates TTM', () => {
    const periods = ['20250331', '20250630', '20250930', '20251231'];
    const cumulativeRevenue = [100, 220, 360, 500].map((value) => value * 1e8);
    const cumulativeIncome = [10, 25, 42, 60].map((value) => value * 1e8);
    const report = buildFinancialReport({
      income: periods.map((end_date, index) => ({
        ts_code: '600519.SH', end_date,
        revenue: cumulativeRevenue[index], total_revenue: cumulativeRevenue[index],
        n_income: cumulativeIncome[index], basic_eps: [1, 2.5, 4.2, 6][index], diluted_eps: 0,
      })),
      balance: periods.map((end_date, index) => ({
        ts_code: '600519.SH', end_date, total_assets: (500 + index * 10) * 1e8,
        total_liab: 100 * 1e8, total_hldr_eqy_inc_min_int: 400 * 1e8,
        total_share: 1, money_cap: 1,
      })),
      cashflow: periods.map((end_date, index) => ({
        ts_code: '600519.SH', end_date, n_cashflow_act: [8, 20, 33, 48][index] * 1e8,
        n_cashflow_inv_act: 0, n_cash_flows_fnc_act: 0, free_cashflow: [6, 15, 25, 36][index] * 1e8,
      })),
      indicator: null,
    });

    expect(report.quarterly.map((row) => row.revenue_yi)).toEqual([100, 120, 140, 140]);
    expect(report.quarterly.map((row) => row.net_income_yi)).toEqual([10, 15, 17, 18]);
    expect(report.ttm).toMatchObject({
      periodEnd: '20251231', revenue_yi: 500, net_income_yi: 60,
      op_cashflow_yi: 48, free_cashflow_yi: 36, quarterCount: 4,
    });
    expect(report.meta).toMatchObject({
      reportingFrequency: 'quarterly', availablePeriods: 1,
      availableQuarterlyPeriods: 4, ttmAvailable: true, warnings: [],
    });
  });

  it('does not fabricate discrete flow values when an adjacent quarter is missing', () => {
    const report = buildFinancialReport({
      income: [
        { ts_code: '600519.SH', end_date: '20250331', revenue: 100, total_revenue: 100, n_income: 10, basic_eps: 1, diluted_eps: 1 },
        { ts_code: '600519.SH', end_date: '20250930', revenue: 300, total_revenue: 300, n_income: 30, basic_eps: 3, diluted_eps: 3 },
      ],
      balance: [], cashflow: [], indicator: null,
    });
    expect(report.quarterly[1]).toMatchObject({ quarter: 'Q3', revenue_yi: null, net_income_yi: null });
    expect(report.ttm).toBeNull();
    expect(report.meta.warnings).toContain('quarterly_history_incomplete');
  });
});
