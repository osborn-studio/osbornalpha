/**
 * Server-only Datagateway adapter for daily OHLCV history.
 *
 * Expected contract (until the vendor-specific document is supplied):
 *   GET {DATAGATEWAY_BASE_URL}{DATAGATEWAY_DAILY_KLINE_PATH}
 *     ?symbol=600519.SH&market=A&interval=1d&limit=23&adjustment=qfq
 *   Authorization: Bearer {DATAGATEWAY_API_KEY}
 *
 * Successful payloads may wrap the payload in `data`, but must contain
 * `bars` and return individual-share volume. This module is deliberately
 * the only place that knows the upstream URL, credential, and wire shape.
 */

import type { Market } from '@/lib/supabase/database.types';
import {
  KlineProviderError,
  type KlineAdjustment,
  type SourceKlineBar,
  type SourceKlineSeries,
} from '@/lib/data/kline/types';

const DEFAULT_DAILY_KLINE_PATH = '/v1/market/kline/daily';
const MAX_RESPONSE_BYTES = 1_000_000;

export interface DatagatewayConfig {
  baseUrl: URL;
  apiKey: string;
  dailyKlinePath: string;
  realtimeQuotePath: string;
}

export interface DatagatewayKlineOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/** Returns null for missing or unsafe configuration so public fallbacks stay usable. */
export function datagatewayConfig(env: Record<string, string | undefined> = process.env): DatagatewayConfig | null {
  const base = env.DATAGATEWAY_BASE_URL?.trim();
  const apiKey = env.DATAGATEWAY_API_KEY?.trim();
  if (!base || !apiKey) return null;
  try {
    const baseUrl = new URL(base.endsWith('/') ? base : `${base}/`);
    if (baseUrl.protocol !== 'https:') return null;
    const dailyKlinePath = env.DATAGATEWAY_DAILY_KLINE_PATH?.trim() || DEFAULT_DAILY_KLINE_PATH;
    const realtimeQuotePath = env.DATAGATEWAY_REALTIME_QUOTE_PATH?.trim() || '/v1/market-data/tickers/query';
    if (!dailyKlinePath.startsWith('/') || dailyKlinePath.startsWith('//')) return null;
    if (!realtimeQuotePath.startsWith('/') || realtimeQuotePath.startsWith('//')) return null;
    return { baseUrl, apiKey, dailyKlinePath, realtimeQuotePath };
  } catch {
    return null;
  }
}

export function isDatagatewayConfigured(): boolean {
  return datagatewayConfig() !== null;
}

export function datagatewaySymbol(ticker: string, market: Market): string | null {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.]{1,16}$/.test(symbol)) return null;
  if (market === 'A') return /^\d{6}\.(SH|SZ|BJ)$/.test(symbol) ? symbol : null;
  // Wind commonly uses four-digit HK symbols (for example 0700.HK), while
  // some feeds pad them to five digits. Accept both wire representations.
  if (market === 'HK') return /^\d{4,5}\.HK$/.test(symbol) ? symbol : null;
  if (market === 'TW') return /^\d{4,6}\.(TW|TWO)$/.test(symbol) ? symbol : null;
  if (market === 'JP') return /^\d{4,5}\.T$/.test(symbol) ? symbol : null;
  if (market === 'KR') return /^\d{4,6}\.(KS|KQ)$/.test(symbol) ? symbol : null;
  return /^[A-Z.]{1,10}$/.test(symbol) ? symbol : null;
}

/** Canonical symbol used on the gateway wire. Wind uses four-digit HK codes. */
export function datagatewayWireSymbol(ticker: string, market: Market): string | null {
  const symbol = datagatewaySymbol(ticker, market);
  if (!symbol || market !== 'HK') return symbol;
  const code = symbol.slice(0, -3);
  return `${Number(code).toString().padStart(4, '0')}.HK`;
}

export function datagatewayDailyKlineUrl(config: DatagatewayConfig, input: {
  ticker: string;
  market: Market;
  limit: number;
  adjustment: KlineAdjustment;
}): URL | null {
  const symbol = datagatewayWireSymbol(input.ticker, input.market);
  if (!symbol || input.adjustment === 'intraday') return null;
  const url = new URL(config.dailyKlinePath, config.baseUrl);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('market', input.market);
  url.searchParams.set('interval', '1d');
  url.searchParams.set('limit', String(input.limit));
  url.searchParams.set('adjustment', input.adjustment);
  return url;
}

function valueAsNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateFromTimestamp(value: number): string | null {
  const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function valueAsDate(value: unknown): string | null {
  if (typeof value === 'number') {
    const text = String(Math.trunc(value));
    if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return dateFromTimestamp(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function field(row: JsonRecord, ...names: string[]): unknown {
  const lower = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) if (lower.has(name.toLowerCase())) return lower.get(name.toLowerCase());
  return undefined;
}

function parseBar(value: unknown): SourceKlineBar {
  const row = record(value);
  if (!row) throw new KlineProviderError('invalid_data', 'Datagateway K-line row is invalid');
  const time = valueAsDate(field(row, 'time', 'date', 'trade_date', 'trade_dt', 'timestamp'));
  const open = valueAsNumber(field(row, 'open', 'o', 'rt_open'));
  const high = valueAsNumber(field(row, 'high', 'h', 'rt_high'));
  const low = valueAsNumber(field(row, 'low', 'l', 'rt_low'));
  const close = valueAsNumber(field(row, 'close', 'c', 'rt_last', 'rt_close'));
  const volume = valueAsNumber(field(row, 'volume', 'vol', 'v', 'rt_vol', 'rt_volume'));
  if (!time || open === null || high === null || low === null || close === null || volume === null) {
    throw new KlineProviderError('invalid_data', 'Datagateway K-line row is missing required fields');
  }
  return { time, open, high, low, close, volume };
}

function normalizeAdjustment(value: unknown, expected: KlineAdjustment): KlineAdjustment {
  if (value === undefined || value === null || value === '') return expected;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'qfq' || normalized === 'forward' || normalized === 'forward_adjusted') return 'qfq';
  if (normalized === 'none' || normalized === 'raw' || normalized === 'unadjusted') return 'none';
  throw new KlineProviderError('invalid_data', 'Datagateway returned an unsupported adjustment mode');
}

/** Parses and validates the small, provider-specific JSON boundary before shared validation. */
export function parseDatagatewayDailyKline(payload: unknown, expectedAdjustment: KlineAdjustment): SourceKlineSeries {
  const root = record(payload);
  const rootData = root ? field(root, 'data', 'result', 'results') : undefined;
  const data = record(rootData) ?? root;
  if (!data && !Array.isArray(rootData) && !Array.isArray(payload)) {
    throw new KlineProviderError('protocol', 'Datagateway response is not an object');
  }
  let barsValue: unknown = Array.isArray(rootData)
    ? rootData
    : Array.isArray(payload)
      ? payload
      : field(data!, 'bars', 'items', 'kline', 'rows', 'records');
  if (data && !Array.isArray(barsValue) && barsValue === undefined) {
    const keyedRows = Object.entries(data).filter(([, value]) => record(value));
    if (keyedRows.length > 0) {
      barsValue = keyedRows.map(([key, value]) => ({ date: key, ...(value as JsonRecord) }));
    }
  }
  const fields = data ? field(data, 'fields') : (root ? field(root, 'fields') : undefined);
  if (Array.isArray(fields) && fields.every((name) => typeof name === 'string') && Array.isArray(barsValue)) {
    barsValue = barsValue.map((item) => Array.isArray(item)
      ? Object.fromEntries((fields as string[]).map((name, index) => [name, item[index]]))
      : item);
  }
  if (!Array.isArray(barsValue)) throw new KlineProviderError('protocol', 'Datagateway response is missing bars');
  const volumeUnit = (data ? field(data, 'volume_unit', 'volumeUnit') : undefined)
    ?? (root ? field(root, 'volume_unit', 'volumeUnit') : undefined);
  if (volumeUnit !== undefined && String(volumeUnit).toLowerCase() !== 'shares') {
    throw new KlineProviderError('invalid_data', 'Datagateway volume must be denominated in shares');
  }
  const adjustment = normalizeAdjustment(
    (data ? field(data, 'adjustment') : undefined) ?? (root ? field(root, 'adjustment') : undefined),
    expectedAdjustment,
  );
  if (adjustment !== expectedAdjustment) {
    throw new KlineProviderError('invalid_data', 'Datagateway adjustment does not match the requested series');
  }
  return { source: 'datagateway', adjustment, volumeUnit: 'shares', bars: barsValue.map(parseBar) };
}

async function readLimitedText(response: Response, maximumBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new KlineProviderError('protocol', 'Datagateway response exceeded the size limit');
  }
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new KlineProviderError('protocol', 'Datagateway response exceeded the size limit');
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function fetchDatagatewayDailyKline(
  ticker: string,
  market: Market,
  limit: number,
  adjustment: KlineAdjustment,
  options: DatagatewayKlineOptions = {},
): Promise<SourceKlineSeries | null> {
  const config = datagatewayConfig();
  const url = config && datagatewayDailyKlineUrl(config, { ticker, market, limit, adjustment });
  if (!config || !url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2_500);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof KlineProviderError) throw error;
    const aborted = controller.signal.aborted || options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
    throw new KlineProviderError('transient', aborted ? 'Datagateway request timed out' : 'Datagateway request failed', true);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    const kind = response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : retryable ? 'transient' : 'protocol';
    throw new KlineProviderError(kind, `Datagateway HTTP ${response.status}`, retryable, response.status);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await readLimitedText(response, MAX_RESPONSE_BYTES));
  } catch (error) {
    if (error instanceof KlineProviderError) throw error;
    throw new KlineProviderError('protocol', 'Datagateway response is invalid JSON');
  }
  return parseDatagatewayDailyKline(payload, adjustment);
}
