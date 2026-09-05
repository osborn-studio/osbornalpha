import type { Market } from '@/lib/supabase/database.types';
import type { FinancialProvider } from './types';
import { secCompanyFactsProvider } from './providers/sec-company-facts';
import { tushareFinancialProvider } from './providers/tushare';
import { configuredHkFinancialProvider } from './providers/hk-configured';

const PROVIDERS: readonly FinancialProvider[] = [
  tushareFinancialProvider,
  secCompanyFactsProvider,
  configuredHkFinancialProvider,
];

export function financialProviderForMarket(
  market: Market,
  providers: readonly FinancialProvider[] = PROVIDERS,
): FinancialProvider | null {
  return providers.find((provider) => provider.supports(market)) ?? null;
}

export function financialProviders(): readonly FinancialProvider[] {
  return PROVIDERS;
}
