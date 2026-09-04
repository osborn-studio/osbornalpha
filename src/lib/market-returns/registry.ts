import type { Market } from '@/lib/supabase/database.types';
import { yahooChartReturnProvider } from './providers/yahoo-chart';
import type { MarketReturnProvider } from './types';

const PROVIDERS: readonly MarketReturnProvider[] = [yahooChartReturnProvider];

export function marketReturnProviderFor(
  market: Market,
  providers: readonly MarketReturnProvider[] = PROVIDERS,
): MarketReturnProvider | null {
  return providers.find((provider) => provider.supports(market)) ?? null;
}
