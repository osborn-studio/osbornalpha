import { currencyCodeOfMarket } from '@/lib/utils';
import type { Market } from '@/lib/supabase/database.types';
import { EMPTY_FINANCIAL_COVERAGE, type FinancialReport } from './types';

export function unavailableFinancialReport(input: {
  ticker: string;
  market: Market;
  source?: string;
  supported: boolean;
  warning: string;
}): FinancialReport {
  const source = input.source ?? 'unsupported';
  return {
    source,
    ticker: input.ticker,
    yearly: [],
    quarterly: [],
    ttm: null,
    latestIndicator: null,
    meta: {
      source,
      market: input.market,
      supported: input.supported,
      availability: input.supported ? 'unavailable' : 'unsupported',
      currency: currencyCodeOfMarket(input.market),
      unit: 'native',
      unitScale: 1,
      reportingFrequency: input.supported ? 'quarterly' : 'unsupported',
      latestPeriodEnd: null,
      availablePeriods: 0,
      availableQuarterlyPeriods: 0,
      ttmAvailable: false,
      coverage: { ...EMPTY_FINANCIAL_COVERAGE },
      warnings: [input.warning],
    },
  };
}

export function reportAvailability(report: Pick<FinancialReport, 'yearly' | 'quarterly' | 'meta'>) {
  const hasRows = report.yearly.length > 0 || report.quarterly.length > 0;
  if (!hasRows) return 'unavailable' as const;
  return report.meta.warnings.length > 0 ? 'partial' as const : 'available' as const;
}
