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
      { fiscalYear: 2026, quarter: 'Q2' as const, periodEnd: '20260630', revenue: 12 },
      { fiscalYear: 2025, quarter: 'Q4' as const, periodEnd: '20251231', revenue: 10 },
      { fiscalYear: 2026, quarter: 'Q1' as const, periodEnd: '20260331', revenue: 11 },
    ].map((row) => ({
      ...row,
      totalRevenue: row.revenue,
      netIncome: 1,
      epsBasic: 0.1,
      totalAssets: 20,
      totalLiabilities: 8,
      equity: 12,
      operatingCashflow: 2,
      freeCashflow: 1,
    }));

    expect(buildFinancialViewRows([], quarterly, 'quarterly', 2).map((row) => row.label))
      .toEqual(['2026 Q1', '2026 Q2']);
    expect(quarterly[0].quarter).toBe('Q2');
  });
});
