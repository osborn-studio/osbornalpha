import { MARKET_SESSION_SPECS } from '@/lib/market/calendar';
import type { Market } from '@/lib/supabase/database.types';
import { classifyMarket, currencyCodeOfMarket } from '@/lib/utils';

export type WatchlistBenchmarkIssue = 'same_security' | 'incompatible_market';

export interface WatchlistBenchmarkValidation {
  valid: boolean;
  issue: WatchlistBenchmarkIssue | null;
  assetMarket: Market;
  benchmarkMarket: Market;
  assetCurrency: string;
  benchmarkCurrency: string;
  currencyCompatible: boolean;
  calendarCompatible: boolean;
}

export function validateWatchlistBenchmark(
  assetTicker: string,
  benchmarkTicker: string,
): WatchlistBenchmarkValidation {
  const asset = assetTicker.trim().toUpperCase();
  const benchmark = benchmarkTicker.trim().toUpperCase();
  const assetMarket = classifyMarket(asset);
  const benchmarkMarket = classifyMarket(benchmark);
  const assetCurrency = currencyCodeOfMarket(assetMarket);
  const benchmarkCurrency = currencyCodeOfMarket(benchmarkMarket);
  const currencyCompatible = assetCurrency === benchmarkCurrency;
  const assetSession = MARKET_SESSION_SPECS[assetMarket];
  const benchmarkSession = MARKET_SESSION_SPECS[benchmarkMarket];
  const calendarCompatible = assetMarket === benchmarkMarket
    && assetSession.timezone === benchmarkSession.timezone;
  const issue: WatchlistBenchmarkIssue | null = asset === benchmark
    ? 'same_security'
    : currencyCompatible && calendarCompatible ? null : 'incompatible_market';

  return {
    valid: issue === null,
    issue,
    assetMarket,
    benchmarkMarket,
    assetCurrency,
    benchmarkCurrency,
    currencyCompatible,
    calendarCompatible,
  };
}
