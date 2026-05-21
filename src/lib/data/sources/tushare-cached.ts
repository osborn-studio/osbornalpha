/**
 * Cached drop-in wrappers for Tushare Pro fetchers.
 *
 * Strategy: Next.js `unstable_cache` — persistent across cold starts via
 * Vercel's Data Cache. No external infra (no Supabase, no Redis).
 *
 * TTLs chosen to balance freshness vs Tushare 积分 consumption:
 *
 *   daily_basic       24h    — refreshes once per trading session
 *   fina_indicator    7d     — quarterly disclosure, no daily change
 *   income            7d     — same as fina_indicator
 *   balance           7d
 *   cashflow          7d
 *   daily (kline)     6h     — intraday refresh acceptable
 *   top10_holders     24h    — quarterly disclosure
 *   top10_floatholders 24h
 *
 * On cache HIT: zero Tushare 积分, ~10ms response from Vercel edge cache.
 * On cache MISS: full Tushare round-trip, then write-through to cache.
 *
 * Drop-in: replace `import {fn} from '@/lib/data/sources/tushare'`
 *          with     `import {fn} from '@/lib/data/sources/tushare-cached'`.
 *
 * Note on cache invalidation: Next.js `unstable_cache` tags are STATIC
 * per wrapper (cannot include args), so we use TTL-based expiry only.
 * Manual purge available via `revalidateTag('tushare')` for global flush.
 */

import { unstable_cache } from 'next/cache';
import {
  fetchTushareDaily as _fetchTushareDaily,
  fetchTushareDailyBasic as _fetchTushareDailyBasic,
  fetchTushareFinaIndicator as _fetchTushareFinaIndicator,
  fetchTushareIncome as _fetchTushareIncome,
  fetchTushareBalance as _fetchTushareBalance,
  fetchTushareCashflow as _fetchTushareCashflow,
  fetchTushareTopHolders as _fetchTushareTopHolders,
  fetchTushareFloatHolders as _fetchTushareFloatHolders,
  fetchTushareHkHold as _fetchTushareHkHold,
  fetchTushareLimitList as _fetchTushareLimitList,
  fetchTushareAnnouncements as _fetchTushareAnnouncements,
  isTushareConfigured,
  TushareError,
} from './tushare';

const DAY = 24 * 60 * 60;     // seconds
const HOUR = 60 * 60;

// ─── Cached wrappers (one per Tushare endpoint) ────────────────────────────

export const fetchTushareDaily = unstable_cache(
  async (ticker: string, limit = 1) => _fetchTushareDaily(ticker, limit),
  ['tushare-daily'],
  { revalidate: 6 * HOUR, tags: ['tushare', 'tushare-daily'] }
);

export const fetchTushareDailyBasic = unstable_cache(
  async (ticker: string) => _fetchTushareDailyBasic(ticker),
  ['tushare-daily-basic'],
  { revalidate: DAY, tags: ['tushare', 'tushare-daily-basic'] }
);

export const fetchTushareFinaIndicator = unstable_cache(
  async (ticker: string) => _fetchTushareFinaIndicator(ticker),
  ['tushare-fina-indicator'],
  { revalidate: 7 * DAY, tags: ['tushare', 'tushare-fina-indicator'] }
);

export const fetchTushareIncome = unstable_cache(
  async (ticker: string, limit = 5) => _fetchTushareIncome(ticker, limit),
  ['tushare-income'],
  { revalidate: 7 * DAY, tags: ['tushare', 'tushare-income'] }
);

export const fetchTushareBalance = unstable_cache(
  async (ticker: string, limit = 5) => _fetchTushareBalance(ticker, limit),
  ['tushare-balance'],
  { revalidate: 7 * DAY, tags: ['tushare', 'tushare-balance'] }
);

export const fetchTushareCashflow = unstable_cache(
  async (ticker: string, limit = 5) => _fetchTushareCashflow(ticker, limit),
  ['tushare-cashflow'],
  { revalidate: 7 * DAY, tags: ['tushare', 'tushare-cashflow'] }
);

export const fetchTushareTopHolders = unstable_cache(
  async (ticker: string) => _fetchTushareTopHolders(ticker),
  ['tushare-top10-holders'],
  { revalidate: DAY, tags: ['tushare', 'tushare-holders'] }
);

export const fetchTushareFloatHolders = unstable_cache(
  async (ticker: string) => _fetchTushareFloatHolders(ticker),
  ['tushare-top10-float'],
  { revalidate: DAY, tags: ['tushare', 'tushare-holders'] }
);

// ─── 5000-积分 endpoints ──────────────────────────────────────────────────
// 6h TTL for flows + limits — intra-day refresh isn't valuable for signals
// computed over multi-day windows.

export const fetchTushareHkHold = unstable_cache(
  async (ticker: string, days = 25) => _fetchTushareHkHold(ticker, days),
  ['tushare-hk-hold'],
  { revalidate: 6 * HOUR, tags: ['tushare', 'tushare-hk-hold'] }
);

export const fetchTushareLimitList = unstable_cache(
  async (ticker: string, days = 30) => _fetchTushareLimitList(ticker, days),
  ['tushare-limit-list'],
  { revalidate: 6 * HOUR, tags: ['tushare', 'tushare-limit-list'] }
);

export const fetchTushareAnnouncements = unstable_cache(
  async (ticker: string, days = 30) => _fetchTushareAnnouncements(ticker, days),
  ['tushare-anns'],
  { revalidate: 6 * HOUR, tags: ['tushare', 'tushare-anns'] }
);

// Pass-through (not data-fetching)
export { isTushareConfigured, TushareError };
