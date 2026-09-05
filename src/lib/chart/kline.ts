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

/** Public chart periods aligned with the standard Yahoo Finance range set. */
export const KLINE_RANGES = ['1d', '5d', '1m', '6m', 'ytd', '1y', '5y', 'all'] as const;
export type KlineRange = typeof KLINE_RANGES[number];
export type KlineInterval = 'minute' | 'day' | 'week' | 'month';
export type KlineGranularity = '1m' | '5m' | '1d' | '1w' | '1mo';
export type KlineUnavailableReason = 'market_unsupported' | 'intraday_unsupported' | 'history_unsupported';

export interface KlineRangeConfig {
  range: KlineRange;
  interval: KlineInterval;
  granularity: KlineGranularity;
  providerPeriod: '1' | '5' | 'D' | 'W' | 'M';
  /**
   * Calendar length of the window in exchange-local days. `null` means the
   * full history the providers can return ("All"). Minute ranges select
   * trading sessions instead and leave this null.
   */
  calendarDays: number | 'ytd' | null;
  /** Number of trading sessions an intraday range displays. */
  sessions: number;
  /**
   * Bar count used as the availability probe: providers are asked for more,
   * and the range counts as complete only when upstream history reaches this
   * depth. Also the `requestedBars` value surfaced in chart metadata.
   */
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
  /** Turnover in quote currency when the provider reports it (VWAP seed). */
  amount?: number | null;
  /** Previous comparable close used by the server for audited change calculations. */
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
}

export interface KlineMeta {
  market: Market;
  range: KlineRange;
  interval: KlineInterval;
  granularity: KlineGranularity;
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
  /** How the visible window was selected: exchange sessions or calendar days. */
  rangeBasis: 'trading-sessions' | 'calendar-window';
  requestedBars: number;
  returnedBars: number;
  /** Bars the provider actually returned before the window was applied. */
  availableBars: number;
  missingBars: number;
  /** Daily closes immediately before the window, used to seed MA20 client-side. */
  maWarmupCloses?: number[];
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
  '1d': { range: '1d', interval: 'minute', granularity: '1m', providerPeriod: '1', calendarDays: null, sessions: 1, limit: 240 },
  '5d': { range: '5d', interval: 'minute', granularity: '5m', providerPeriod: '5', calendarDays: null, sessions: 5, limit: 240 },
  '1m': { range: '1m', interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 31, sessions: 0, limit: 32 },
  '6m': { range: '6m', interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 184, sessions: 0, limit: 140 },
  ytd: { range: 'ytd', interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 'ytd', sessions: 0, limit: 260 },
  '1y': { range: '1y', interval: 'day', granularity: '1d', providerPeriod: 'D', calendarDays: 366, sessions: 0, limit: 260 },
  '5y': { range: '5y', interval: 'week', granularity: '1w', providerPeriod: 'W', calendarDays: 1_826, sessions: 0, limit: 275 },
  all: { range: 'all', interval: 'month', granularity: '1mo', providerPeriod: 'M', calendarDays: null, sessions: 0, limit: 600 },
};

/** Regular-session minute counts used for intraday fetch sizing. */
export function marketSessionMinutes(market: Market): number {
  if (market === 'HK') return 330;
  if (market === 'US') return 390;
  return 240;
}

function marketLocalDate(now: Date, market: Market): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: marketTimezone(market), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function ytdTradingDayEstimate(now: Date, market: Market): number {
  const localToday = marketLocalDate(now, market);
  const yearStart = Date.parse(`${localToday.slice(0, 4)}-01-01T00:00:00Z`);
  const elapsedDays = Math.floor((Date.parse(`${localToday}T00:00:00Z`) - yearStart) / 86_400_000) + 1;
  const fullWeeks = Math.floor(elapsedDays / 7);
  const remainder = elapsedDays % 7;
  const firstWeekday = new Date(yearStart).getUTCDay();
  let weekdays = fullWeeks * 5;
  for (let day = 0; day < remainder; day += 1) {
    const weekday = (firstWeekday + day) % 7;
    if (weekday !== 0 && weekday !== 6) weekdays += 1;
  }
  return Math.max(1, weekdays);
}

export function klineBarLimit(ticker: string, range: KlineRange, now = new Date()): number {
  const config = KLINE_RANGE_CONFIG[range];
  if (config.calendarDays === 'ytd') return ytdTradingDayEstimate(now, classifyMarket(ticker));
  if (config.interval !== 'minute') return config.limit;
  const barMinutes = config.granularity === '5m' ? 5 : 1;
  return (marketSessionMinutes(classifyMarket(ticker)) * config.sessions) / barMinutes;
}

/** Markets whose providers support a user-facing adjustment toggle. */
export function adjustmentSelectable(market: Market): boolean {
  return market === 'A' || market === 'HK';
}

export function parseKlineAdjustment(value: string | null): 'qfq' | 'hfq' | 'none' | null {
  return value === 'qfq' || value === 'hfq' || value === 'none' ? value : null;
}

export function parseKlineRange(value: string | null): KlineRange | null {
  // Retain compatibility with links created before the public label changed
  // from Max to All.
  if (value === 'max') return 'all';
  return value && (KLINE_RANGES as readonly string[]).includes(value) ? value as KlineRange : null;
}

export function klineRangeAvailability(
  ticker: string,
  range: KlineRange,
  datagatewayAvailable = process.env.NEXT_PUBLIC_DATAGATEWAY_ENABLED === 'true',
): KlineUnavailableReason | null {
  const market = classifyMarket(ticker);
  // Daily history for JP/KR is supplied by Datagateway when it is configured.
  // Keep intraday disabled because the gateway integration is intentionally
  // daily-only and there is no verified minute fallback for either market.
  const interval = KLINE_RANGE_CONFIG[range].interval;
  if ((market === 'JP' || market === 'KR') && (interval === 'minute' || !datagatewayAvailable)) return 'market_unsupported';
  if (market === 'TW' && interval === 'minute') return 'intraday_unsupported';
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

/** Regular-session clock windows (provider wall-clock labels, HH:MM inclusive). */
export function marketSessionWindows(market: Market): Array<[string, string]> {
  if (market === 'US') return [['09:30', '16:00']];
  if (market === 'HK') return [['09:30', '12:00'], ['13:00', '16:00']];
  return [['09:30', '11:30'], ['13:00', '15:00']];
}

export function isWithinMarketSession(time: string, market: Market): boolean {
  const clock = time.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(clock)) return true;
  return marketSessionWindows(market).some(([start, end]) => clock >= start && clock <= end);
}

/** Calendar key of a bar date for the forming-period check (day/week/month). */
export function periodKeyOf(interval: KlineInterval, date: string): string {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  if (interval === 'month') return day.slice(0, 7);
  if (interval === 'week') {
    const utc = new Date(`${day}T00:00:00Z`).getTime();
    const monday = utc - ((new Date(utc).getUTCDay() + 6) % 7) * 86_400_000;
    return new Date(monday).toISOString().slice(0, 10);
  }
  return day;
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
