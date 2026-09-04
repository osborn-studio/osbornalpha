import type { Market } from '@/lib/supabase/database.types';

export type FinancialQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type FinancialReportingFrequency = 'annual' | 'quarterly' | 'unsupported';
export type FinancialAvailability = 'available' | 'partial' | 'unavailable' | 'unsupported';

export interface FinancialAmounts {
  revenue: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  epsBasic: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  operatingCashflow: number | null;
  freeCashflow: number | null;
}

export interface FinancialYearRow extends FinancialAmounts {
  year: number;
  periodEnd: string;
}

export interface FinancialQuarterRow extends FinancialAmounts {
  fiscalYear: number;
  quarter: FinancialQuarter;
  periodEnd: string;
}

export interface FinancialTtmRow extends Omit<FinancialAmounts, 'totalAssets' | 'totalLiabilities' | 'equity'> {
  periodEnd: string;
  quarterCount: 4;
}

export interface FinancialIndicator {
  periodEnd: string;
  roe: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  currentRatio: number | null;
}

export interface FinancialCoverage {
  income: number;
  balance: number;
  cashflow: number;
  indicator: boolean;
}

export interface FinancialMeta {
  source: string;
  market: Market;
  supported: boolean;
  availability: FinancialAvailability;
  currency: string;
  unit: string;
  unitScale: number;
  reportingFrequency: FinancialReportingFrequency;
  latestPeriodEnd: string | null;
  availablePeriods: number;
  availableQuarterlyPeriods: number;
  ttmAvailable: boolean;
  coverage: FinancialCoverage;
  warnings: string[];
}

export interface FinancialReport {
  source: string;
  ticker: string;
  yearly: FinancialYearRow[];
  quarterly: FinancialQuarterRow[];
  ttm: FinancialTtmRow | null;
  latestIndicator: FinancialIndicator | null;
  meta: FinancialMeta;
}

export interface FinancialProvider {
  readonly id: string;
  supports(market: Market): boolean;
  load(ticker: string): Promise<FinancialReport>;
}

export const EMPTY_FINANCIAL_COVERAGE: FinancialCoverage = {
  income: 0,
  balance: 0,
  cashflow: 0,
  indicator: false,
};
