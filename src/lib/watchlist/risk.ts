import type { Market } from '@/lib/supabase/database.types';

const MIN_RATE = -99;
const MAX_RATE = 100;

/**
 * Resolve the annual risk-free rate used by Watchlist Sharpe calculations.
 * Market-specific values win over the shared fallback. Invalid or unsafe
 * deployment configuration fails closed to zero rather than poisoning metrics.
 */
export function watchlistRiskFreeRatePct(
  market: Market,
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[`WATCHLIST_RISK_FREE_RATE_${market}_PCT`] ?? env.WATCHLIST_RISK_FREE_RATE_PCT;
  if (raw == null || raw.trim() === '') return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > MIN_RATE && value <= MAX_RATE ? value : 0;
}
