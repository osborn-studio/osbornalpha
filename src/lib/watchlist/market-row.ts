import type { Market } from '@/lib/supabase/database.types';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { classifyMarket, currencyOfMarket } from '@/lib/utils';
import { selectWatchlistDisplayQuote } from './quote-authority';

export interface WatchlistMarketGroup {
  id: string;
  name: string;
  tickers: string[];
}

export interface WatchlistSecurityIdentity {
  t: string;
  n: string;
  m: Market;
}

export type QuoteDisplayStatus = 'loading' | 'unavailable' | 'stale' | 'delayed' | 'live';

export interface WatchlistMarketRow {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  groupId: string;
  group: string;
  quote: LiveQuote | null;
  status: QuoteDisplayStatus;
}

export function quoteDisplayStatus(quote: LiveQuote | null, loadedAt: number | null): QuoteDisplayStatus {
  if (!quote || quote.price <= 0) return loadedAt === null ? 'loading' : 'unavailable';
  if (quote.stale) return 'stale';
  return quote.delayed ? 'delayed' : 'live';
}

/**
 * Builds only from the security master identity and the quote payload. Watchlist
 * presentation must never substitute sample prices, signals, or broker data.
 */
export function buildWatchlistMarketRows(
  groups: WatchlistMarketGroup[],
  quotes: Record<string, LiveQuote | null>,
  identities: Record<string, WatchlistSecurityIdentity> = {},
  loadedAt: number | null = null,
): WatchlistMarketRow[] {
  const rows: WatchlistMarketRow[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const ticker of group.tickers) {
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      const quote = selectWatchlistDisplayQuote(quotes[ticker]);
      const identity = identities[ticker];
      const market = quote?.market ?? identity?.m ?? classifyMarket(ticker);
      rows.push({
        ticker,
        name: identity?.n || quote?.name || ticker,
        market,
        currency: quote?.currency || currencyOfMarket(market),
        groupId: group.id,
        group: group.name,
        quote,
        status: quoteDisplayStatus(quote, loadedAt),
      });
    }
  }

  return rows;
}
