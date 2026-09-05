import { marketPhase } from '@/lib/today/clock';
import { classifyMarket } from '@/lib/utils';

export interface QuoteRefreshContext {
  now: Date;
  consecutiveFailures: number;
}

const OPEN_MS = 30_000;
const TRANSITION_MS = 60_000;
const CLOSED_MS = 5 * 60_000;
const IDLE_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export function watchlistQuoteRefreshInterval(
  tickers: string[],
  { now, consecutiveFailures }: QuoteRefreshContext,
): number {
  const markets = [...new Set(tickers.map(classifyMarket))];
  if (markets.length === 0) return IDLE_MS;
  const phases = markets.map((market) => marketPhase(market, now));
  const base = phases.some((phase) => phase.phase === 'open')
    ? OPEN_MS
    : phases.some((phase) => phase.phase === 'pre' || phase.phase === 'lunch')
      ? TRANSITION_MS
      : phases.some((phase) => phase.phase === 'closed')
        ? CLOSED_MS
        : IDLE_MS;
  const failures = Math.min(Math.max(Math.floor(consecutiveFailures), 0), 5);
  return Math.min(base * (2 ** failures), MAX_BACKOFF_MS);
}
