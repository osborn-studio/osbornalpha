import { describe, expect, it } from 'vitest';
import { buildFinancialViewRows, financialGrowthPct } from './financial-view';

describe('watchlist financial view', () => {
  it('calculates growth while preserving negative-base semantics', () => {
    expect(financialGrowthPct(120, 100)).toBeCloseTo(20);
    expect(financialGrowthPct(-5, -10)).toBeCloseTo(50);
    expect(financialGrowthPct(5, -10)).toBeCloseTo(150);
    expect(financialGrowthPct(5, 0)).toBeNull();
    expect(financialGrowthPct(null, 10)).toBeNull();
  });

  it('orders and limits quarterly rows without changing the input', () => {
    const quarterly = [
      { fiscalYear: 2026, quarter: 'Q2' as const, periodEnd: '20260630', revenue_yi: 12 },
      { fiscalYear: 2025, quarter: 'Q4' as const, periodEnd: '20251231', revenue_yi: 10 },
      { fiscalYear: 2026, quarter: 'Q1' as const, periodEnd: '20260331', revenue_yi: 11 },
    ].map((row) => ({
      ...row,
      total_revenue_yi: row.revenue_yi,
      net_income_yi: 1,
      eps_basic: 0.1,
      total_assets_yi: 20,
      total_liab_yi: 8,
      equity_yi: 12,
      op_cashflow_yi: 2,
      free_cashflow_yi: 1,
    }));

    expect(buildFinancialViewRows([], quarterly, 'quarterly', 2).map((row) => row.label))
      .toEqual(['2026 Q1', '2026 Q2']);
    expect(quarterly[0].quarter).toBe('Q2');
  });
});
