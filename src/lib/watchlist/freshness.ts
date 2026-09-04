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
): WatchlistFreshness {
  return watchlistTimestampFreshness(asOf, now, {
    freshMs: WATCHLIST_MARKET_FRESH_MS,
    expiredMs: WATCHLIST_MARKET_EXPIRED_MS,
  });
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
