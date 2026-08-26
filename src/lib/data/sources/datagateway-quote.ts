/**
 * Datagateway -> Wind realtime snapshot adapter.
 *
 * The gateway is intentionally called only from server code. The request
 * contract is the smallest stable shape for the endpoint:
 *   POST /v1/market-data/tickers/query { symbols: ["600519.SH", "AAPL"] }
 *
 * The response parser accepts common envelope/field aliases because the
 * gateway's vendor-facing Wind field names may differ by deployment. Once the
 * production fixture is available, this boundary can be tightened without
 * changing the quote routes or UI.
 */

import type { Market } from '@/lib/supabase/database.types';
import { classifyMarket, currencyOfMarket } from '@/lib/utils';
import { KlineProviderError } from '@/lib/data/kline/types';
import { datagatewayConfig, datagatewaySymbol } from './datagateway';

export { isDatagatewayConfigured } from './datagateway';

const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 2_500;

export interface DatagatewayRealtimeQuote {
  source: 'datagateway-wind';
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  amount: number;
  amplitude: number;
  market_cap: number | null;
  market_cap_label: string;
  pe_ttm: number | null;
  pb: number | null;
  turnover: number | null;
  volume_ratio: number | null;
  updated_at: string;
  delayed: boolean;
}

export interface DatagatewayQuoteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function first(row: RecordValue, names: string[]): unknown {
  for (const name of names) if (name in row) return row[name];
  return undefined;
}

function number(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    const numeric = Number(value);
    const date = new Date(numeric > 10_000_000_000 ? numeric : numeric * 1_000);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return null;
}

function tickerOf(row: RecordValue): string | null {
  const value = first(row, ['ticker', 'symbol', 'code', 'wind_code', 'sec_code']);
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function normalizeRows(payload: unknown): RecordValue[] {
  const root = asRecord(payload);
  const data = root && (root.data ?? root.result ?? root.results ?? root.quotes ?? root.items);
  if (Array.isArray(data)) return data.map(asRecord).filter((row): row is RecordValue => !!row);
  const dataRecord = asRecord(data);
  if (dataRecord) {
    const fields = dataRecord.fields;
    const items = dataRecord.items;
    if (Array.isArray(fields) && fields.every((field) => typeof field === 'string') && Array.isArray(items)) {
      return items.flatMap((item) => {
        if (!Array.isArray(item)) return [];
        return [Object.fromEntries((fields as string[]).map((field, index) => [field, item[index]]))];
      });
    }
    for (const key of ['quotes', 'items', 'results', 'data']) {
      const nested = dataRecord[key];
      if (Array.isArray(nested)) return nested.map(asRecord).filter((row): row is RecordValue => !!row);
    }
    // Accept { data: { "600519.SH": {...}, "AAPL": {...} } } as well as rows.
    return Object.entries(dataRecord).flatMap(([key, value]) => {
      const row = asRecord(value);
      return row ? [{ ...row, ticker: row.ticker ?? row.symbol ?? key }] : [];
    });
  }
  if (Array.isArray(payload)) return payload.map(asRecord).filter((row): row is RecordValue => !!row);
  return [];
}

function matchRequestedTicker(reported: string | null, requestedTickers: string[]): string | undefined {
  if (!reported) return undefined;
  const normalized = reported.toUpperCase();
  return requestedTickers.find((ticker) => {
    const requested = ticker.toUpperCase();
    return requested === normalized
      || requested.split('.')[0] === normalized
      || normalized.split('.')[0] === requested.split('.')[0];
  });
}

function parseQuote(row: RecordValue, requestedTicker?: string): DatagatewayRealtimeQuote | null {
  const rawTicker = requestedTicker?.toUpperCase() ?? tickerOf(row);
  if (!rawTicker) return null;
  const market = classifyMarket(rawTicker);
  if (!datagatewaySymbol(rawTicker, market)) return null;
  const price = number(first(row, ['price', 'last_price', 'last', 'close', 'rt_last', 'rt_price']));
  if (price === null || price <= 0) return null;
  const prevClose = number(first(row, ['prev_close', 'previous_close', 'pre_close', 'rt_pre_close'])) ?? price;
  const open = number(first(row, ['open', 'rt_open'])) ?? price;
  const high = number(first(row, ['high', 'rt_high'])) ?? price;
  const low = number(first(row, ['low', 'rt_low'])) ?? price;
  const change = number(first(row, ['change', 'chg', 'rt_change'])) ?? price - prevClose;
  const changePct = number(first(row, ['change_pct', 'change_percent', 'pct_change', 'pct_chg', 'rt_pct_chg'])) ?? (prevClose > 0 ? change / prevClose * 100 : 0);
  const rawVolume = number(first(row, ['volume', 'vol', 'rt_vol'])) ?? 0;
  const volumeUnit = String(first(row, ['volume_unit', 'volumeUnit']) ?? 'shares').toLowerCase();
  const volume = volumeUnit === 'lots' || volumeUnit === 'lot' ? rawVolume * 100 : rawVolume;
  const amount = number(first(row, ['amount', 'turnover_amount', 'rt_amt'])) ?? 0;
  const delayedValue = first(row, ['delayed', 'is_delayed']);
  const marketCap = number(first(row, ['market_cap', 'marketCap', 'mkt_cap']));
  const pe = number(first(row, ['pe_ttm', 'pe', 'pe_ttm_ratio']));
  const pb = number(first(row, ['pb', 'pb_ratio']));
  const turnover = number(first(row, ['turnover', 'turnover_rate']));
  const volumeRatio = number(first(row, ['volume_ratio', 'vol_ratio']));
  const updated = first(row, ['updated_at', 'fetched_at', 'timestamp', 'time', 'quote_time', 'rt_time']);
  const updatedAt = timestamp(updated);
  const delayed = delayedValue === true || updatedAt === null;
  return {
    source: 'datagateway-wind',
    ticker: rawTicker,
    name: String(first(row, ['name', 'security_name', 'sec_name']) ?? rawTicker),
    market,
    currency: currencyOfMarket(market),
    price,
    change,
    change_pct: changePct,
    open,
    high,
    low,
    prev_close: prevClose,
    volume,
    amount,
    amplitude: prevClose > 0 ? (high - low) / prevClose * 100 : 0,
    market_cap: marketCap,
    market_cap_label: '—',
    pe_ttm: pe,
    pb,
    turnover,
    volume_ratio: volumeRatio,
    updated_at: updatedAt ?? new Date().toISOString(),
    delayed,
  };
}

function wireSymbol(ticker: string): string | null {
  const market = classifyMarket(ticker);
  const symbol = datagatewaySymbol(ticker, market);
  if (!symbol) return null;
  // Wind uses the .O suffix for US listed equities. The app keeps bare
  // tickers such as AAPL at its public boundary.
  return market === 'US' && !symbol.includes('.') ? `${symbol}.O` : symbol;
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new KlineProviderError('protocol', 'Datagateway quote response exceeded the size limit');
  }
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new KlineProviderError('protocol', 'Datagateway quote response exceeded the size limit');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function parseDatagatewayRealtimeQuotes(payload: unknown, requestedTickers: string[] = []): Map<string, DatagatewayRealtimeQuote> {
  const rows = normalizeRows(payload);
  const result = new Map<string, DatagatewayRealtimeQuote>();
  rows.forEach((row) => {
    const quote = parseQuote(row, matchRequestedTicker(tickerOf(row), requestedTickers));
    if (quote) result.set(quote.ticker, quote);
  });
  // Some single-ticker responses omit ticker in the row.
  if (result.size === 0 && requestedTickers.length === 1) {
    const quote = rows.length > 0 ? parseQuote(rows[0], requestedTickers[0]) : null;
    if (quote) result.set(quote.ticker, quote);
  }
  return result;
}

export async function fetchDatagatewayRealtimeQuotes(
  tickers: string[],
  options: DatagatewayQuoteOptions = {},
): Promise<Map<string, DatagatewayRealtimeQuote>> {
  const config = datagatewayConfig();
  const requested = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  if (!config || requested.length === 0) return new Map();
  const symbols = requested.map(wireSymbol);
  if (symbols.some((symbol) => !symbol)) return new Map();
  const url = new URL(config.realtimeQuotePath, config.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ symbols }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof KlineProviderError) throw error;
    const aborted = controller.signal.aborted || options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
    throw new KlineProviderError('transient', aborted ? 'Datagateway quote request timed out' : 'Datagateway quote request failed', true);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    throw new KlineProviderError(response.status === 429 ? 'rate_limited' : retryable ? 'transient' : 'protocol', `Datagateway quote HTTP ${response.status}`, retryable, response.status);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(await readLimitedText(response));
  } catch (error) {
    if (error instanceof KlineProviderError) throw error;
    throw new KlineProviderError('protocol', 'Datagateway quote response is invalid JSON');
  }
  return parseDatagatewayRealtimeQuotes(payload, requested);
}

export async function fetchDatagatewayRealtimeQuote(ticker: string, options: DatagatewayQuoteOptions = {}) {
  const quotes = await fetchDatagatewayRealtimeQuotes([ticker], options);
  return quotes.get(ticker.trim().toUpperCase()) ?? null;
}
