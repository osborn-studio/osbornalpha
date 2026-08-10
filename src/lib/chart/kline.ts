import type { Market } from '@/lib/supabase/database.types';
import { classifyMarket } from '@/lib/utils';

export const KLINE_RANGES = ['1d', '1m', '3m', '1y'] as const;
export type KlineRange = typeof KLINE_RANGES[number];
export type KlineInterval = 'minute' | 'day';
export type KlineUnavailableReason = 'market_unsupported' | 'intraday_unsupported' | 'history_unsupported';

export interface KlineRangeConfig {
  range: KlineRange;
  interval: KlineInterval;
  providerPeriod: '1' | 'D';
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
}

export interface KlineMeta {
  range: KlineRange;
  interval: KlineInterval;
  coverageStart: string;
  coverageEnd: string;
  asOf: string;
  timezone: string;
  fetchedAt: string;
  delayed: boolean;
  cacheTtlSeconds: number;
}

export const KLINE_RANGE_CONFIG: Record<KlineRange, KlineRangeConfig> = {
  '1d': { range: '1d', interval: 'minute', providerPeriod: '1', limit: 240 },
  '1m': { range: '1m', interval: 'day', providerPeriod: 'D', limit: 22 },
  '3m': { range: '3m', interval: 'day', providerPeriod: 'D', limit: 66 },
  '1y': { range: '1y', interval: 'day', providerPeriod: 'D', limit: 260 },
};

export function parseKlineRange(value: string | null): KlineRange | null {
  return value && (KLINE_RANGES as readonly string[]).includes(value) ? value as KlineRange : null;
}

export function klineRangeAvailability(ticker: string, range: KlineRange): KlineUnavailableReason | null {
  const market = classifyMarket(ticker);
  if (market === 'JP' || market === 'KR' || /\.TWO$/i.test(ticker)) return 'market_unsupported';
  if (market === 'TW' && range === '1d') return 'intraday_unsupported';
  if (market === 'TW' && range === '1y') return 'history_unsupported';
  return null;
}

export function marketTimezone(market: Market): string {
  if (market === 'US') return 'America/New_York';
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
