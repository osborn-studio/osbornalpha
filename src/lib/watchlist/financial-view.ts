import type { FinancialQuarterRow, FinancialYearRow } from '@/lib/financials/types';

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
  row: FinancialYearRow | FinancialQuarterRow,
  label: string,
): FinancialViewRow {
  return {
    key: row.periodEnd ?? label,
    label,
    periodEnd: row.periodEnd ?? '',
    revenue: row.revenue,
    netIncome: row.netIncome,
    eps: row.epsBasic,
    operatingCashflow: row.operatingCashflow,
    freeCashflow: row.freeCashflow,
    totalAssets: row.totalAssets,
  };
}

export function buildFinancialViewRows(
  yearly: FinancialYearRow[],
  quarterly: FinancialQuarterRow[],
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
