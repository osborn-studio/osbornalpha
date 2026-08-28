import type { Market } from '@/lib/supabase/database.types';
import type {
  KlineAdjustment,
  KlineSourceName,
} from '@/lib/data/kline/types';
import type {
  KlineCacheStatus,
  KlineFreshness,
  KlineWarning,
} from '@/lib/data/kline/reliability';
import { classifyMarket } from '@/lib/utils';

export const KLINE_RANGES = ['1d', '1m', '3m', '1y'] as const;
export type KlineRange = typeof KLINE_RANGES[number];
export type KlineInterval = 'minute' | 'day' | 'month';
export type KlineUnavailableReason = 'market_unsupported' | 'intraday_unsupported' | 'history_unsupported';

export interface KlineRangeConfig {
  range: KlineRange;
  interval: KlineInterval;
  granularity: '1m' | '1d' | '1mo';
  providerPeriod: '1' | 'D' | 'M';
  limit: number;
}

export interface KlineBar {
  /** UTC timeline coordinate created by the server, never parsed by the browser. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Previous comparable close used by the server for audited change calculations. */
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
}

export interface KlineMeta {
  market: Market;
  range: KlineRange;
  interval: KlineInterval;
  granularity: '1m' | '1d' | '1mo';
  source: KlineSourceName;
  adjustment: KlineAdjustment;
  coverageStart: string;
  coverageEnd: string;
  asOf: string;
  timezone: string;
  fetchedAt: string;
  delayed: boolean;
  currency: string;
  currencyCode: string;
  pricePrecision: number;
  minMove: number;
  volumeUnit: 'shares';
  rangeBasis: 'trading-bars';
  requestedBars: number;
  returnedBars: number;
  missingBars: number;
  cacheTtlSeconds: number;
  freshness: KlineFreshness;
  fallbackUsed: boolean;
  cacheStatus: KlineCacheStatus;
  completeness: 'complete' | 'partial';
  partial: boolean;
  warnings: KlineWarning[];
  cacheAgeSeconds?: number;
  staleAgeSeconds?: number;
}

export const KLINE_RANGE_CONFIG: Record<KlineRange, KlineRangeConfig> = {
  '1d': { range: '1d', interval: 'minute', granularity: '1m', providerPeriod: '1', limit: 240 },
  '1m': { range: '1m', interval: 'month', granularity: '1mo', providerPeriod: 'M', limit: 1 },
  '3m': { range: '3m', interval: 'month', granularity: '1mo', providerPeriod: 'M', limit: 3 },
  '1y': { range: '1y', interval: 'month', granularity: '1mo', providerPeriod: 'M', limit: 12 },
};

export function klineBarLimit(ticker: string, range: KlineRange): number {
  if (range !== '1d') return KLINE_RANGE_CONFIG[range].limit;
  const market = classifyMarket(ticker);
  if (market === 'HK') return 330;
  if (market === 'US') return 390;
  return 240;
}

export function parseKlineRange(value: string | null): KlineRange | null {
  return value && (KLINE_RANGES as readonly string[]).includes(value) ? value as KlineRange : null;
}

export function klineRangeAvailability(ticker: string, range: KlineRange): KlineUnavailableReason | null {
  const market = classifyMarket(ticker);
  // Daily history for JP/KR is supplied by Datagateway when it is configured.
  // Keep intraday disabled because the gateway integration is intentionally
  // daily-only and there is no verified minute fallback for either market.
  if ((market === 'JP' || market === 'KR') && range === '1d') return 'market_unsupported';
  if (market === 'TW' && range === '1d') return 'intraday_unsupported';
  return null;
}

export function marketTimezone(market: Market): string {
  if (market === 'US') return 'America/New_York';
  if (market === 'HK') return 'Asia/Hong_Kong';
  if (market === 'TW') return 'Asia/Taipei';
  if (market === 'JP') return 'Asia/Tokyo';
  if (market === 'KR') return 'Asia/Seoul';
  return 'Asia/Shanghai';
}

/**
 * Converts source calendar strings to a deterministic UTC chart coordinate.
 * The coordinate preserves the provider's clock labels and is not treated as
 * an absolute execution timestamp; `meta.timezone` documents that context.
 */
export function toChartTimestamp(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return 0;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) / 1000);
}

/**
 * Retains the precision present in the normalized provider payload, capped to
 * the precision supported by this chart. This avoids silently rounding valid
 * adjusted or sub-cent prices while giving the chart an explicit tick size.
 */
export function inferKlinePricePrecision(
  bars: Array<Pick<KlineBar, 'open' | 'high' | 'low' | 'close'>>,
): number {
  let precision = 0;
  for (const bar of bars) {
    for (const value of [bar.open, bar.high, bar.low, bar.close]) {
      const normalized = value.toFixed(6).replace(/0+$/, '');
      const decimals = normalized.includes('.') ? normalized.split('.')[1].length : 0;
      precision = Math.max(precision, decimals);
    }
  }
  return Math.min(Math.max(precision, 2), 4);
}
