import type {
  TushareBalance,
  TushareCashflow,
  TushareIncome,
  TushareIndicator,
} from '@/lib/data/sources/tushare';
import { reportAvailability } from '@/lib/financials/report';
import type {
  FinancialQuarter,
  FinancialQuarterRow,
  FinancialReport,
  FinancialTtmRow,
  FinancialYearRow,
} from '@/lib/financials/types';

export const FINANCIAL_UNIT_SCALE = 1e8;
export const FINANCIAL_CURRENCY = 'CNY';
export const FINANCIAL_UNIT = 'CNY_100M';

function annualPeriod(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{8}$/.test(value) && value.endsWith('1231');
}

function quarterForPeriod(value: string | null | undefined): FinancialQuarter | null {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null;
  const suffix = value.slice(4);
  return suffix === '0331' ? 'Q1' : suffix === '0630' ? 'Q2' : suffix === '0930' ? 'Q3' : suffix === '1231' ? 'Q4' : null;
}

const QUARTER_INDEX: Record<FinancialQuarter, number> = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scaled(value: unknown): number | null {
  const number = finiteOrNull(value);
  return number == null ? null : number / FINANCIAL_UNIT_SCALE;
}

function discrete(current: unknown, previous: unknown, quarter: FinancialQuarter): number | null {
  const currentValue = finiteOrNull(current);
  if (currentValue == null) return null;
  if (quarter === 'Q1') return currentValue;
  const previousValue = finiteOrNull(previous);
  return previousValue == null ? null : currentValue - previousValue;
}

function sumFinite(values: Array<number | null>): number | null {
  return values.every((value) => value != null && Number.isFinite(value))
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
}

function byPeriod<T extends { end_date: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.filter((row) => quarterForPeriod(row.end_date)).map((row) => [row.end_date, row]));
}

export function buildFinancialReport(input: {
  ticker?: string;
  income: TushareIncome[];
  balance: TushareBalance[];
  cashflow: TushareCashflow[];
  indicator: TushareIndicator | null;
  warnings?: string[];
}): FinancialReport {
  const allIncome = input.income.filter((row) => quarterForPeriod(row.end_date));
  const allBalance = input.balance.filter((row) => quarterForPeriod(row.end_date));
  const allCashflow = input.cashflow.filter((row) => quarterForPeriod(row.end_date));
  const income = allIncome.filter((row) => annualPeriod(row.end_date));
  const balance = allBalance.filter((row) => annualPeriod(row.end_date));
  const cashflow = allCashflow.filter((row) => annualPeriod(row.end_date));
  const incomeByPeriod = byPeriod(allIncome);
  const balanceByPeriod = byPeriod(allBalance);
  const cashflowByPeriod = byPeriod(allCashflow);
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
      revenue: scaled(i?.revenue),
      totalRevenue: scaled(i?.total_revenue),
      netIncome: scaled(i?.n_income),
      epsBasic: finiteOrNull(i?.basic_eps),
      totalAssets: scaled(b?.total_assets),
      totalLiabilities: scaled(b?.total_liab),
      equity: scaled(b?.total_hldr_eqy_inc_min_int),
      operatingCashflow: scaled(c?.n_cashflow_act),
      freeCashflow: scaled(c?.free_cashflow),
    } satisfies FinancialYearRow;
  });

  const quarterPeriods = [...new Set([
    ...allIncome.map((row) => row.end_date),
    ...allBalance.map((row) => row.end_date),
    ...allCashflow.map((row) => row.end_date),
  ])].filter((period) => quarterForPeriod(period)).sort();
  const quarterly = quarterPeriods.map((periodEnd) => {
    const quarter = quarterForPeriod(periodEnd)!;
    const fiscalYear = Number(periodEnd.slice(0, 4));
    const previousQuarter = QUARTER_INDEX[quarter] === 0
      ? null
      : quarterPeriods.find((period) => Number(period.slice(0, 4)) === fiscalYear
        && QUARTER_INDEX[quarterForPeriod(period)!] === QUARTER_INDEX[quarter] - 1) ?? null;
    const currentIncome = incomeByPeriod.get(periodEnd);
    const previousIncome = previousQuarter ? incomeByPeriod.get(previousQuarter) : undefined;
    const currentBalance = balanceByPeriod.get(periodEnd);
    const currentCashflow = cashflowByPeriod.get(periodEnd);
    const previousCashflow = previousQuarter ? cashflowByPeriod.get(previousQuarter) : undefined;
    return {
      fiscalYear,
      quarter,
      periodEnd,
      revenue: scaled(discrete(currentIncome?.revenue, previousIncome?.revenue, quarter)),
      totalRevenue: scaled(discrete(currentIncome?.total_revenue, previousIncome?.total_revenue, quarter)),
      netIncome: scaled(discrete(currentIncome?.n_income, previousIncome?.n_income, quarter)),
      epsBasic: discrete(currentIncome?.basic_eps, previousIncome?.basic_eps, quarter),
      totalAssets: scaled(currentBalance?.total_assets),
      totalLiabilities: scaled(currentBalance?.total_liab),
      equity: scaled(currentBalance?.total_hldr_eqy_inc_min_int),
      operatingCashflow: scaled(discrete(currentCashflow?.n_cashflow_act, previousCashflow?.n_cashflow_act, quarter)),
      freeCashflow: scaled(discrete(currentCashflow?.free_cashflow, previousCashflow?.free_cashflow, quarter)),
    } satisfies FinancialQuarterRow;
  });

  const latestFour = quarterly.slice(-4);
  const consecutive = latestFour.length === 4 && latestFour.every((row, index) => index === 0
    || row.fiscalYear * 4 + QUARTER_INDEX[row.quarter]
      === latestFour[index - 1].fiscalYear * 4 + QUARTER_INDEX[latestFour[index - 1].quarter] + 1);
  const ttm: FinancialTtmRow | null = consecutive ? {
    periodEnd: latestFour.at(-1)!.periodEnd,
    revenue: sumFinite(latestFour.map((row) => row.revenue)),
    totalRevenue: sumFinite(latestFour.map((row) => row.totalRevenue)),
    netIncome: sumFinite(latestFour.map((row) => row.netIncome)),
    epsBasic: sumFinite(latestFour.map((row) => row.epsBasic)),
    operatingCashflow: sumFinite(latestFour.map((row) => row.operatingCashflow)),
    freeCashflow: sumFinite(latestFour.map((row) => row.freeCashflow)),
    quarterCount: 4 as const,
  } : null;
  const hasInterimPeriods = quarterly.some((row) => row.quarter !== 'Q4');
  const warnings = [...new Set([
    ...(input.warnings ?? []),
    ...(hasInterimPeriods && !consecutive ? ['quarterly_history_incomplete'] : []),
  ])];

  const latestIndicator = input.indicator ? {
    periodEnd: input.indicator.end_date,
    roe: finiteOrNull(input.indicator.roe),
    grossMargin: finiteOrNull(input.indicator.grossprofit_margin),
    netMargin: finiteOrNull(input.indicator.netprofit_margin),
    currentRatio: finiteOrNull(input.indicator.current_ratio),
  } : null;
  const report: FinancialReport = {
    source: 'tushare',
    ticker: input.ticker ?? input.income[0]?.ts_code ?? input.balance[0]?.ts_code ?? input.cashflow[0]?.ts_code ?? '',
    yearly,
    quarterly,
    ttm,
    latestIndicator,
    meta: {
      source: 'tushare',
      market: 'A',
      supported: true,
      availability: 'available',
      currency: FINANCIAL_CURRENCY,
      unit: FINANCIAL_UNIT,
      unitScale: FINANCIAL_UNIT_SCALE,
      reportingFrequency: 'quarterly',
      latestPeriodEnd: quarterPeriods.at(-1) ?? input.indicator?.end_date ?? null,
      availablePeriods: periods.length,
      availableQuarterlyPeriods: quarterly.length,
      ttmAvailable: ttm != null,
      coverage: {
        income: income.length,
        balance: balance.length,
        cashflow: cashflow.length,
        indicator: input.indicator != null,
      },
      warnings,
    },
  };
  report.meta.availability = reportAvailability(report);
  return report;
}
