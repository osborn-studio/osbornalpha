import type {
  FinancialAmounts,
  FinancialIndicator,
  FinancialMeta,
  FinancialQuarterRow,
  FinancialReport,
  FinancialTtmRow,
  FinancialYearRow,
} from './types';

const AMOUNT_KEYS = [
  'revenue', 'totalRevenue', 'netIncome', 'epsBasic', 'totalAssets',
  'totalLiabilities', 'equity', 'operatingCashflow', 'freeCashflow',
] as const satisfies readonly (keyof FinancialAmounts)[];

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isFinancialIndicator(value: unknown): value is FinancialIndicator {
  if (!object(value)) return false;
  return typeof value.periodEnd === 'string'
    && ['roe', 'grossMargin', 'netMargin', 'currentRatio'].every((key) => nullableFinite(value[key]));
}

function nullableFinite(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function amounts(value: Record<string, unknown>, keys: readonly string[] = AMOUNT_KEYS): boolean {
  return keys.every((key) => nullableFinite(value[key]));
}

export function isFinancialYearRow(value: unknown): value is FinancialYearRow {
  if (!object(value)) return false;
  return Number.isInteger(value.year) && typeof value.periodEnd === 'string' && amounts(value);
}

export function isFinancialQuarterRow(value: unknown): value is FinancialQuarterRow {
  if (!object(value)) return false;
  return Number.isInteger(value.fiscalYear)
    && ['Q1', 'Q2', 'Q3', 'Q4'].includes(String(value.quarter))
    && typeof value.periodEnd === 'string'
    && amounts(value);
}

export function isFinancialTtmRow(value: unknown): value is FinancialTtmRow {
  if (!object(value)) return false;
  return typeof value.periodEnd === 'string'
    && value.quarterCount === 4
    && amounts(value, ['revenue', 'totalRevenue', 'netIncome', 'epsBasic', 'operatingCashflow', 'freeCashflow']);
}

export function isFinancialMeta(value: unknown): value is FinancialMeta {
  if (!object(value) || !object(value.coverage)) return false;
  const coverage = value.coverage;
  return typeof value.source === 'string'
    && ['A', 'HK', 'US', 'JP', 'KR', 'TW'].includes(String(value.market))
    && typeof value.supported === 'boolean'
    && ['available', 'partial', 'unavailable', 'unsupported'].includes(String(value.availability))
    && typeof value.currency === 'string'
    && typeof value.unit === 'string'
    && typeof value.unitScale === 'number' && Number.isFinite(value.unitScale) && value.unitScale > 0
    && ['annual', 'quarterly', 'unsupported'].includes(String(value.reportingFrequency))
    && (value.latestPeriodEnd === null || typeof value.latestPeriodEnd === 'string')
    && Number.isSafeInteger(value.availablePeriods) && Number(value.availablePeriods) >= 0
    && Number.isSafeInteger(value.availableQuarterlyPeriods) && Number(value.availableQuarterlyPeriods) >= 0
    && typeof value.ttmAvailable === 'boolean'
    && ['income', 'balance', 'cashflow'].every((key) => Number.isSafeInteger(coverage[key]) && Number(coverage[key]) >= 0)
    && typeof coverage.indicator === 'boolean'
    && Array.isArray(value.warnings) && value.warnings.every((warning) => typeof warning === 'string');
}

export function isFinancialReport(value: unknown): value is FinancialReport {
  if (!object(value)) return false;
  return typeof value.source === 'string'
    && typeof value.ticker === 'string'
    && Array.isArray(value.yearly) && value.yearly.every(isFinancialYearRow)
    && Array.isArray(value.quarterly) && value.quarterly.every(isFinancialQuarterRow)
    && (value.ttm === null || isFinancialTtmRow(value.ttm))
    && (value.latestIndicator === null || isFinancialIndicator(value.latestIndicator))
    && isFinancialMeta(value.meta);
}
