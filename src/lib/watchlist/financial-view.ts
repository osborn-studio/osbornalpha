import type { QuarterlyFinancial, YearlyFinancial } from '@/lib/hooks/useQuote';

export type FinancialViewMode = 'quarterly' | 'annual';

export interface FinancialViewRow {
  key: string;
  label: string;
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  operatingCashflow: number | null;
  freeCashflow: number | null;
  totalAssets: number | null;
}

export function financialGrowthPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current / Math.abs(previous)) - Math.sign(previous)) * 100;
}

function mapFinancialRow(
  row: YearlyFinancial | QuarterlyFinancial,
  label: string,
): FinancialViewRow {
  return {
    key: row.periodEnd ?? label,
    label,
    periodEnd: row.periodEnd ?? '',
    revenue: row.revenue_yi,
    netIncome: row.net_income_yi,
    eps: row.eps_basic,
    operatingCashflow: row.op_cashflow_yi,
    freeCashflow: row.free_cashflow_yi,
    totalAssets: row.total_assets_yi,
  };
}

export function buildFinancialViewRows(
  yearly: YearlyFinancial[],
  quarterly: QuarterlyFinancial[],
  mode: FinancialViewMode,
  limit = 8,
): FinancialViewRow[] {
  const rows = mode === 'quarterly'
    ? quarterly.map((row) => mapFinancialRow(row, `${row.fiscalYear} ${row.quarter}`))
    : yearly.map((row) => mapFinancialRow(row, String(row.year)));
  return rows
    .filter((row) => row.periodEnd.length > 0)
    .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd))
    .slice(-Math.max(1, limit));
}
