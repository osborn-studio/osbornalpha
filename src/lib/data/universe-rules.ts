/**
 * Stock universe classification rules — TypeScript port.
 *
 * SOURCE & ATTRIBUTION:
 *   Inspired by https://github.com/zer0quant/zer0share/blob/main/zer0share/universe.py
 *   (zer0share, 2026, no formal LICENSE file but README claims MIT)
 *
 *   The underlying rules (tradable A-share filters: ST exclusion, suspension
 *   exclusion, listing-age threshold, liquidity floor, market-cap percentile)
 *   are public-domain quant practice — they are NOT covered by copyright.
 *   Only the original Python expression was re-implemented here.
 *
 * PURPOSE:
 *   Given a snapshot of A-share stocks (basic info + daily quote + market cap +
 *   ST/suspension flags + price limits + 20-day average amount), classify each
 *   stock into 0-N of the following universes:
 *
 *     - univ_research_base   for cross-sectional factor research / standardization
 *     - univ_trade_base      tighter universe — actually tradable today
 *     - univ_trade_hs300     trade_base ∩ HS300 (沪深 300) members
 *     - univ_trade_zz500     trade_base ∩ ZZ500 (中证 500) members
 *     - univ_trade_zz1000    trade_base ∩ ZZ1000 (中证 1000) members
 *
 * USAGE:
 *   const classifications = classifyUniverse(stocks, {
 *     tradeDate: '2026-05-17',
 *     hs300Members: new Set(['600519.SH', ...]),
 *     zz500Members: new Set([...]),
 *     zz1000Members: new Set([...]),
 *   });
 *   // → Map<ticker, { research, trade, hs300, zz500, zz1000 }>
 *
 *   Or for a single stock:
 *   const flags = classifyOne(stock, ctx);
 */

import type { Market } from '@/lib/supabase/database.types';

// ─── Input: per-stock snapshot ────────────────────────────────────────────

export interface UniverseStockInput {
  /** Tushare-style code e.g. "600519.SH" / "002624.SZ" / "830699.BJ" */
  ts_code: string;
  /** Tushare symbol (6 digits without exchange suffix) */
  symbol: string;
  /** Tushare market category: "主板" | "创业板" | "科创板" | "中小板" | "北交所" | "CDR" */
  market: string;
  /** "L" listed, "D" delisted, "P" 暂停上市 */
  list_status?: string | null;
  /** YYYY-MM-DD; date the stock was first listed */
  list_date?: string | null;
  /** YYYY-MM-DD; null/undefined if not delisted */
  delist_date?: string | null;
  /** Today's quote — needed for one-price-limit detection */
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  /** Daily up/down limit prices for this stock today */
  up_limit?: number | null;
  down_limit?: number | null;
  /** Total market cap in 元 (Tushare daily_basic.total_mv × 10⁴) */
  total_mv?: number | null;
  /** Rolling 20-day avg amount in 元 (cumsum of daily_kline.amount × 10³) */
  avg_amount_20d?: number | null;
  /** Set to true if the stock is currently ST */
  is_st?: boolean;
  /** Set to true if the stock is suspended today */
  is_suspended?: boolean;
}

export interface UniverseContext {
  /** Today's date — used to evaluate list_date/delist_date */
  tradeDate: string;  // 'YYYY-MM-DD'
  /** Optional: index member sets for HS300 / ZZ500 / ZZ1000 */
  hs300Members?: Set<string>;
  zz500Members?: Set<string>;
  zz1000Members?: Set<string>;
  /**
   * Liquidity floor — minimum 20-day average amount in 元.
   * Default 10,000 元 ≈ 1 万元 (matches zer0share default).
   * For HNWI screening you may want higher (e.g., 50M).
   */
  minAvgAmount20d?: number;
  /**
   * Market-cap percentile floor:
   *   - research base excludes bottom `pctResearch` of total_mv (default 0.02 = 2%)
   *   - trade base excludes bottom `pctTrade` (default 0.05 = 5%)
   */
  pctResearch?: number;
  pctTrade?: number;
}

// ─── Output: classification flags per stock ────────────────────────────────

export interface UniverseFlags {
  ts_code: string;
  is_a_share_common: boolean;
  is_listed: boolean;
  is_not_delisted: boolean;
  is_old_enough: boolean;       // listed for ≥ 183 days
  is_st: boolean;
  is_suspended: boolean;
  has_amount_liquidity: boolean;
  passes_research_mv: boolean;
  passes_trade_mv: boolean;
  is_one_price_up_limit: boolean;
  is_one_price_down_limit: boolean;
  /** Final universe memberships */
  in_research_base: boolean;
  in_trade_base: boolean;
  in_hs300: boolean;
  in_zz500: boolean;
  in_zz1000: boolean;
}

// ─── Atomic rule predicates ────────────────────────────────────────────────

const A_SHARE_SUFFIXES = ['.SH', '.SZ', '.BJ'] as const;

/**
 * Universal A-share common stock filter:
 * - Suffix .SH/.SZ/.BJ (excludes US ADRs etc.)
 * - Symbol does NOT start with 200 or 900 (excludes B-shares: 沪 900xxx, 深 200xxx)
 * - Market is not "CDR" (excludes Chinese Depositary Receipts)
 */
export function isAShareCommon(stock: UniverseStockInput): boolean {
  const code = stock.ts_code.toUpperCase();
  const sym = String(stock.symbol);
  const hasASuffix = A_SHARE_SUFFIXES.some((s) => code.endsWith(s));
  const isBShare = sym.startsWith('200') || sym.startsWith('900');
  const isCDR = (stock.market || '').toUpperCase() === 'CDR';
  return hasASuffix && !isBShare && !isCDR;
}

/** Listed on or before `tradeDate` */
export function isListed(stock: UniverseStockInput, tradeDate: string): boolean {
  if (!stock.list_date) return false;
  return stock.list_date <= tradeDate;
}

/** Not delisted as of `tradeDate` (delist_date is null or > today) */
export function isNotDelisted(stock: UniverseStockInput, tradeDate: string): boolean {
  if (!stock.delist_date) return true;
  return stock.delist_date > tradeDate;
}

/** Listed for at least 183 days (≥ 6 months) — filters new IPOs from research */
export function isOldEnough(stock: UniverseStockInput, tradeDate: string, days = 183): boolean {
  if (!stock.list_date) return false;
  const listed = new Date(stock.list_date + 'T00:00:00Z').getTime();
  const today = new Date(tradeDate + 'T00:00:00Z').getTime();
  const ageDays = (today - listed) / 86400000;
  return ageDays >= days;
}

/** 20-day avg trading amount ≥ floor (元). Default 1万 matches zer0share. */
export function hasAmountLiquidity(stock: UniverseStockInput, minAmount = 10_000): boolean {
  return (stock.avg_amount_20d ?? 0) >= minAmount;
}

/**
 * One-price up/down limit detection:
 *   open == high == low == close == up_limit (or down_limit)
 * Reflects a stock that can't be traded today (full-day stuck at limit).
 */
export function isOnePriceLimit(stock: UniverseStockInput, direction: 'up' | 'down'): boolean {
  const limit = direction === 'up' ? stock.up_limit : stock.down_limit;
  if (limit == null) return false;
  const { open, high, low, close } = stock;
  if (open == null || high == null || low == null || close == null) return false;
  const samePrice = open === high && high === low && low === close;
  const atLimit = Math.abs(close - limit) < 0.01;
  return samePrice && atLimit;
}

/**
 * Compute "passes market-cap percentile" filter for a batch of stocks.
 * Returns Set<ts_code> of stocks NOT in the bottom `pct` by total_mv.
 *
 * (Cannot be evaluated per-stock without the full cohort — call once per batch.)
 */
export function computeMVFloors(
  stocks: UniverseStockInput[],
  pctResearch: number,
  pctTrade: number
): { passesResearch: Set<string>; passesTrade: Set<string> } {
  const withMV = stocks.filter((s) => s.total_mv != null && s.total_mv > 0);
  // Sort ascending by total_mv
  withMV.sort((a, b) => (a.total_mv as number) - (b.total_mv as number));

  const cutoffResearch = Math.floor(withMV.length * pctResearch);
  const cutoffTrade = Math.floor(withMV.length * pctTrade);

  const passesResearch = new Set<string>();
  const passesTrade = new Set<string>();
  withMV.forEach((s, i) => {
    if (i >= cutoffResearch) passesResearch.add(s.ts_code);
    if (i >= cutoffTrade) passesTrade.add(s.ts_code);
  });
  return { passesResearch, passesTrade };
}

// ─── Classification ────────────────────────────────────────────────────────

/**
 * Classify a single stock given its own data + market-cap percentile sets.
 * Use `classifyUniverse()` for the typical batch case.
 */
export function classifyOne(
  stock: UniverseStockInput,
  ctx: UniverseContext,
  mvSets: { passesResearch: Set<string>; passesTrade: Set<string> }
): UniverseFlags {
  const ts_code = stock.ts_code;
  const is_a_share_common = isAShareCommon(stock);
  const is_listed = isListed(stock, ctx.tradeDate);
  const is_not_delisted = isNotDelisted(stock, ctx.tradeDate);
  const is_old_enough = isOldEnough(stock, ctx.tradeDate);
  const is_st = !!stock.is_st;
  const is_suspended = !!stock.is_suspended;
  const has_amount_liquidity = hasAmountLiquidity(stock, ctx.minAvgAmount20d ?? 10_000);
  const passes_research_mv = mvSets.passesResearch.has(ts_code);
  const passes_trade_mv = mvSets.passesTrade.has(ts_code);
  const is_one_price_up_limit = isOnePriceLimit(stock, 'up');
  const is_one_price_down_limit = isOnePriceLimit(stock, 'down');

  const in_research_base =
    is_a_share_common &&
    is_listed &&
    is_not_delisted &&
    !is_st &&
    is_old_enough &&
    has_amount_liquidity &&
    passes_research_mv;

  const in_trade_base =
    in_research_base &&
    !is_suspended &&
    !is_one_price_up_limit &&
    !is_one_price_down_limit &&
    passes_trade_mv;

  const in_hs300 = in_trade_base && (ctx.hs300Members?.has(ts_code) ?? false);
  const in_zz500 = in_trade_base && (ctx.zz500Members?.has(ts_code) ?? false);
  const in_zz1000 = in_trade_base && (ctx.zz1000Members?.has(ts_code) ?? false);

  return {
    ts_code,
    is_a_share_common,
    is_listed,
    is_not_delisted,
    is_old_enough,
    is_st,
    is_suspended,
    has_amount_liquidity,
    passes_research_mv,
    passes_trade_mv,
    is_one_price_up_limit,
    is_one_price_down_limit,
    in_research_base,
    in_trade_base,
    in_hs300,
    in_zz500,
    in_zz1000,
  };
}

/**
 * Batch classify: returns a Map keyed by ts_code.
 * This is the primary entry point.
 */
export function classifyUniverse(
  stocks: UniverseStockInput[],
  ctx: UniverseContext
): Map<string, UniverseFlags> {
  const mvSets = computeMVFloors(
    stocks,
    ctx.pctResearch ?? 0.02,
    ctx.pctTrade ?? 0.05
  );
  const out = new Map<string, UniverseFlags>();
  for (const s of stocks) {
    out.set(s.ts_code, classifyOne(s, ctx, mvSets));
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert UI ticker (e.g., '600519.SH' or '600519.sh') to canonical lowercase suffix. */
export function normalizeTicker(t: string): string {
  const m = t.toUpperCase().match(/^(\d+)\.(SH|SZ|BJ)$/);
  return m ? `${m[1]}.${m[2]}` : t.toUpperCase();
}

/** Best-guess market from ticker suffix; useful when no explicit field. */
export function tickerToMarket(t: string): Market | null {
  const u = t.toUpperCase();
  if (/\.(SH|SZ|BJ)$/.test(u)) return 'A';
  if (/\.HK$/.test(u)) return 'HK';
  if (/^[A-Z\.]+$/.test(u)) return 'US';
  return null;
}

/** Summary stats: count of stocks in each universe. */
export function universeCounts(flags: Map<string, UniverseFlags>): {
  research: number;
  trade: number;
  hs300: number;
  zz500: number;
  zz1000: number;
} {
  let research = 0, trade = 0, hs300 = 0, zz500 = 0, zz1000 = 0;
  for (const f of flags.values()) {
    if (f.in_research_base) research++;
    if (f.in_trade_base) trade++;
    if (f.in_hs300) hs300++;
    if (f.in_zz500) zz500++;
    if (f.in_zz1000) zz1000++;
  }
  return { research, trade, hs300, zz500, zz1000 };
}
