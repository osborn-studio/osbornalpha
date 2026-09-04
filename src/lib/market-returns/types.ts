import type { KlineRange } from '@/lib/chart/kline';
import type { Market } from '@/lib/supabase/database.types';

export type WatchlistHistoryRange = Extract<KlineRange, '1m' | '6m' | 'ytd' | '1y' | '5y' | 'all'>;

export interface MarketReturnSnapshot {
  ticker: string;
  market: Market;
  range: WatchlistHistoryRange;
  source: string;
  currency: string;
  priceReturnPct: number;
  totalReturnPct: number | null;
  distributionContributionPct: number | null;
  dividendCount: number;
  splitCount: number;
  coverageStart: string;
  coverageEnd: string;
  asOf: string;
  methodology: {
    priceBasis: 'unadjusted_close';
    totalReturnBasis: 'adjusted_close_reinvestment' | 'unavailable';
  };
  warnings: string[];
}

export interface MarketReturnProvider {
  readonly id: string;
  supports(market: Market): boolean;
  load(ticker: string, range: WatchlistHistoryRange): Promise<MarketReturnSnapshot>;
}
