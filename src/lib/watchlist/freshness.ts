import type { Market } from '@/lib/supabase/database.types';
import { marketLocalTime } from '@/lib/market/calendar';
import { marketPhase } from '@/lib/today/clock';

export const WATCHLIST_RESEARCH_FRESH_MS = 12 * 60 * 60_000;
export const WATCHLIST_RESEARCH_EXPIRED_MS = 14 * 24 * 60 * 60_000;
// A Friday close should remain clearly attributable through a normal weekend,
// while a quote older than two weeks is no longer useful for a live surface.
export const WATCHLIST_MARKET_FRESH_MS = 36 * 60 * 60_000;
export const WATCHLIST_MARKET_EXPIRED_MS = 14 * 24 * 60 * 60_000;

export type WatchlistFreshness = 'fresh' | 'stale' | 'unavailable';

export function watchlistMarketFreshness(
  asOf: string | null | undefined,
  now = new Date(),
  market?: Market,
): WatchlistFreshness {
  const base = watchlistTimestampFreshness(asOf, now, {
    freshMs: WATCHLIST_MARKET_FRESH_MS,
    expiredMs: WATCHLIST_MARKET_EXPIRED_MS,
  });
  if (base !== 'stale' || !market || !asOf) return base;
  const asOfDate = new Date(asOf);
  const ageDays = Math.floor((now.getTime() - asOfDate.getTime()) / 86_400_000);
  if (ageDays <= 5) {
    const phase = marketPhase(market, now);
    if (phase.phaseKey === 'pre' || phase.phaseKey === 'weekend' || phase.phaseKey === 'holiday') {
      const local = marketLocalTime(market, now);
      const observed = marketLocalTime(market, asOfDate);
      if (local.dateKey !== observed.dateKey || phase.phaseKey !== 'pre') return 'fresh';
    }
  }
  return base;
}

export function watchlistTimestampFreshness(
  asOf: string | null | undefined,
  now = new Date(),
  policy: { freshMs: number; expiredMs: number } = {
    freshMs: WATCHLIST_RESEARCH_FRESH_MS,
    expiredMs: WATCHLIST_RESEARCH_EXPIRED_MS,
  },
): WatchlistFreshness {
  if (!asOf) return 'unavailable';
  const timestamp = new Date(asOf).getTime();
  const age = now.getTime() - timestamp;
  if (!Number.isFinite(timestamp) || age < -5 * 60_000 || age > policy.expiredMs) return 'unavailable';
  return age > policy.freshMs ? 'stale' : 'fresh';
}
