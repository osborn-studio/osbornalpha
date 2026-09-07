import type { LiveQuote } from '@/lib/hooks/useQuote';

/**
 * Watchlist prices always come from the validated Batch Quote contract.
 * Overview market data may enrich radar/events but must never replace a
 * missing batch quote with a differently-timed price snapshot.
 */
export function selectWatchlistDisplayQuote(quote: LiveQuote | null | undefined): LiveQuote | null {
  return quote && Number.isFinite(quote.price) && quote.price > 0 ? quote : null;
}
