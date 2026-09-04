import type {
  TushareBalance,
  TushareCashflow,
  TushareIncome,
  TushareIndicator,
} from '@/lib/data/sources/tushare';

export const FINANCIAL_UNIT_SCALE = 1e8;
export const FINANCIAL_CURRENCY = 'CNY';
export const FINANCIAL_UNIT = 'CNY_100M';

export interface FinancialYearRow {
  year: number;
  periodEnd: string;
  revenue_yi: number | null;
  total_revenue_yi: number | null;
  net_income_yi: number | null;
  eps_basic: number | null;
  total_assets_yi: number | null;
  total_liab_yi: number | null;
  equity_yi: number | null;
  op_cashflow_yi: number | null;
  free_cashflow_yi: number | null;
}

export interface FinancialReport {
  yearly: FinancialYearRow[];
  latestIndicator: TushareIndicator | null;
  meta: {
    source: 'tushare';
    market: 'A';
    supported: true;
    currency: typeof FINANCIAL_CURRENCY;
    unit: typeof FINANCIAL_UNIT;
    unitScale: number;
    reportingFrequency: 'annual';
    latestPeriodEnd: string | null;
    availablePeriods: number;
    coverage: {
      income: number;
      balance: number;
      cashflow: number;
      indicator: boolean;
    };
    warnings: string[];
  };
}

function annualPeriod(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{8}$/.test(value) && value.endsWith('1231');
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scaled(value: unknown): number | null {
  const number = finiteOrNull(value);
  return number == null ? null : number / FINANCIAL_UNIT_SCALE;
}

function byPeriod<T extends { end_date: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.filter((row) => annualPeriod(row.end_date)).map((row) => [row.end_date, row]));
}

export function buildFinancialReport(input: {
  income: TushareIncome[];
  balance: TushareBalance[];
  cashflow: TushareCashflow[];
  indicator: TushareIndicator | null;
  warnings?: string[];
}): FinancialReport {
  const income = input.income.filter((row) => annualPeriod(row.end_date));
  const balance = input.balance.filter((row) => annualPeriod(row.end_date));
  const cashflow = input.cashflow.filter((row) => annualPeriod(row.end_date));
  const incomeByPeriod = byPeriod(income);
  const balanceByPeriod = byPeriod(balance);
  const cashflowByPeriod = byPeriod(cashflow);
  const periods = [...new Set([
    ...income.map((row) => row.end_date),
    ...balance.map((row) => row.end_date),
    ...cashflow.map((row) => row.end_date),
  ])].sort();

  const yearly = periods.map((periodEnd) => {
    const i = incomeByPeriod.get(periodEnd);
    const b = balanceByPeriod.get(periodEnd);
    const c = cashflowByPeriod.get(periodEnd);
    return {
      year: Number(periodEnd.slice(0, 4)),
      periodEnd,
      revenue_yi: scaled(i?.revenue),
      total_revenue_yi: scaled(i?.total_revenue),
      net_income_yi: scaled(i?.n_income),
      eps_basic: finiteOrNull(i?.basic_eps),
      total_assets_yi: scaled(b?.total_assets),
      total_liab_yi: scaled(b?.total_liab),
      equity_yi: scaled(b?.total_hldr_eqy_inc_min_int),
      op_cashflow_yi: scaled(c?.n_cashflow_act),
      free_cashflow_yi: scaled(c?.free_cashflow),
    } satisfies FinancialYearRow;
  });

  return {
    yearly,
    latestIndicator: input.indicator,
    meta: {
      source: 'tushare',
      market: 'A',
      supported: true,
      currency: FINANCIAL_CURRENCY,
      unit: FINANCIAL_UNIT,
      unitScale: FINANCIAL_UNIT_SCALE,
      reportingFrequency: 'annual',
      latestPeriodEnd: periods.at(-1) ?? input.indicator?.end_date ?? null,
      availablePeriods: periods.length,
      coverage: {
        income: income.length,
        balance: balance.length,
        cashflow: cashflow.length,
        indicator: input.indicator != null,
      },
      warnings: [...new Set(input.warnings ?? [])],
    },
  };
}
