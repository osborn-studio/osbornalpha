/**
 * DataGateway -> Wind WST intraday adapter.
 *
 * The Gateway exposes bounded underlying ticks rather than minute candles.
 * This adapter aggregates last-price ticks into one-minute OHLCV bars and
 * keeps the Wind credential server-side. If the deployment lacks the WST
 * entitlement, callers can fall back to the public minute providers.
 */

import type { Market } from '@/lib/supabase/database.types';
import { marketTimezone } from '@/lib/chart/kline';
import { KlineProviderError, type SourceKlineBar } from '@/lib/data/kline/types';
import { datagatewayConfig, datagatewayWireSymbol } from './datagateway';

const DEFAULT_PATH = '/v1/market-data/intraday/underlyings/query';
const MAX_RESPONSE_BYTES = 2_000_000;

export interface DatagatewayIntradayOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function localMinute(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function localDay(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isoBounds(day: string): { start: string; end: string } {
  return { start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z` };
}

function rowsFromPayload(payload: unknown): JsonRecord[] {
  const root = record(payload);
  const data = root ? (root.data ?? root.result ?? root.results) : payload;
  if (!Array.isArray(data)) return [];
  return data.map(record).filter((item): item is JsonRecord => !!item);
}

function aggregate(rows: JsonRecord[], timezone: string): SourceKlineBar[] {
  const buckets = new Map<string, { open: number; high: number; low: number; close: number; volume: number; lastVolume: number | null }>();
  const sorted = rows
    .map((row) => ({
      date: timestamp(row.timestamp),
      price: number(row.last_price ?? row.last ?? row.price ?? row.close),
      cumulative: number(row.cumulative_volume ?? row.volume),
    }))
    .filter((item): item is { date: Date; price: number; cumulative: number | null } => !!item.date && item.price > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const item of sorted) {
    const key = localMinute(item.date, timezone);
    const previous = buckets.get(key);
    if (!previous) {
      buckets.set(key, { open: item.price, high: item.price, low: item.price, close: item.price, volume: 0, lastVolume: item.cumulative });
      continue;
    }
    previous.high = Math.max(previous.high, item.price);
    previous.low = Math.min(previous.low, item.price);
    previous.close = item.price;
    if (item.cumulative !== null && previous.lastVolume !== null) {
      previous.volume += Math.max(0, item.cumulative - previous.lastVolume);
    }
    previous.lastVolume = item.cumulative;
  }
  return Array.from(buckets, ([time, bar]) => ({ time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }));
}

async function readLimited(response: Response): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new KlineProviderError('protocol', 'DataGateway intraday response exceeded the size limit');
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new KlineProviderError('protocol', 'DataGateway intraday response exceeded the size limit');
  return text;
}

export async function fetchDatagatewayIntradayKline(
  ticker: string,
  market: Market,
  limit: number,
  options: DatagatewayIntradayOptions = {},
): Promise<{ source: 'datagateway'; bars: SourceKlineBar[]; adjustment: 'intraday'; volumeUnit: 'shares' } | null> {
  const config = datagatewayConfig();
  const symbol = datagatewayWireSymbol(ticker, market);
  if (!config || !symbol) return null;
  const timezone = marketTimezone(market);
  const today = localDay(options.now ?? new Date(), timezone);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4_500);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    // Before the session opens, Wind may have no rows for today. Probe one
    // prior calendar day as well; weekends/holidays simply return no rows.
    for (const day of [today, shiftDay(today, -1)]) {
      const bounds = isoBounds(day);
      const response = await (options.fetchImpl ?? fetch)(new URL(DEFAULT_PATH, config.baseUrl), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ symbols: [symbol], start: bounds.start, end: bounds.end, depth: 1, max_rows: 10_000, purpose: 'execution_backtest' }),
        signal,
        cache: 'no-store',
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        throw new KlineProviderError(response.status === 403 ? 'not_found' : retryable ? 'transient' : 'protocol', `DataGateway intraday HTTP ${response.status}`, retryable, response.status);
      }
      let payload: unknown;
      try { payload = JSON.parse(await readLimited(response)); } catch { throw new KlineProviderError('protocol', 'DataGateway intraday response is invalid JSON'); }
      const bars = aggregate(rowsFromPayload(payload), timezone).slice(-limit);
      if (bars.length > 0) return { source: 'datagateway', bars, adjustment: 'intraday', volumeUnit: 'shares' };
    }
    return null;
  } catch (error) {
    if (error instanceof KlineProviderError) throw error;
    const aborted = controller.signal.aborted || options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
    throw new KlineProviderError('transient', aborted ? 'DataGateway intraday request timed out' : 'DataGateway intraday request failed', true);
  } finally {
    clearTimeout(timer);
  }
}
