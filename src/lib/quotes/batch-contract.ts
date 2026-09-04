import { normalizeEvidenceTickerParam } from '@/lib/external-evidence/request';

export const QUOTE_BATCH_MAX_TICKERS = 40;
export const QUOTE_BATCH_MAX_QUERY_LENGTH = 1_200;

export interface QuoteBatchRequest {
  tickers: string[];
  force: boolean;
}

export interface QuoteBatchMetaShape {
  failed?: number;
  stale?: number;
  duration_ms?: number;
  failed_tickers?: string[];
  error_codes?: string[];
  sources?: Record<string, {
    attempted?: number;
    succeeded?: number;
    failed?: number;
    retries?: number;
    duration_ms?: number;
  }>;
  selected_sources?: Record<string, string>;
}

export interface QuoteBatchPayloadShape<T = unknown> {
  quotes?: Record<string, T | null>;
  meta?: QuoteBatchMetaShape;
}

export interface QuoteBatchPayloadValidationOptions<T = unknown> {
  /** The symbols requested for this chunk. When supplied, the response must map exactly to them. */
  expectedTickers?: string[];
  /** Optional field-level validator for non-null quote values. */
  validateQuote?: (value: unknown, ticker: string) => value is T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.entries(value).every(([key, item]) => key.length > 0 && typeof item === 'string' && item.length <= 120);
}

function validMeta(value: unknown): value is QuoteBatchMetaShape {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  for (const key of ['failed', 'stale', 'duration_ms']) {
    if (value[key] !== undefined && !finiteNonNegative(value[key])) return false;
  }
  for (const key of ['failed_tickers', 'error_codes']) {
    const item = value[key];
    if (item !== undefined && (!Array.isArray(item) || item.some((entry) => typeof entry !== 'string' || entry.length > 120))) return false;
  }
  if (value.selected_sources !== undefined && !validStringMap(value.selected_sources)) return false;
  if (value.sources !== undefined) {
    if (!isRecord(value.sources)) return false;
    for (const stats of Object.values(value.sources)) {
      if (!isRecord(stats)) return false;
      for (const key of ['attempted', 'succeeded', 'failed', 'retries', 'duration_ms']) {
        if (stats[key] !== undefined && !finiteNonNegative(stats[key])) return false;
      }
    }
  }
  return true;
}

/**
 * Normalize and bound the public batch query. Invalid symbols are rejected
 * instead of being silently dropped, so a caller cannot mistake a partial
 * response for a successful request.
 */
export function parseQuoteBatchRequest(url: URL): QuoteBatchRequest | { error: 'tickers_required' | 'invalid_ticker' | 'too_many_tickers' | 'query_too_large' } {
  const raw = url.searchParams.get('tickers') ?? '';
  if (raw.length > QUOTE_BATCH_MAX_QUERY_LENGTH) return { error: 'query_too_large' };
  const parts = raw.split(',').map((value) => value.trim()).filter(Boolean);
  if (parts.length === 0) return { error: 'tickers_required' };
  if (parts.length > QUOTE_BATCH_MAX_TICKERS) return { error: 'too_many_tickers' };
  const tickers: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const ticker = normalizeEvidenceTickerParam(part);
    if (!ticker) return { error: 'invalid_ticker' };
    if (!seen.has(ticker)) {
      seen.add(ticker);
      tickers.push(ticker);
    }
  }
  return { tickers, force: url.searchParams.has('_') };
}

/** Runtime guard shared by quote clients and API tests. */
export function isQuoteBatchPayload<T = unknown>(
  value: unknown,
  options: QuoteBatchPayloadValidationOptions<T> = {},
): value is QuoteBatchPayloadShape<T> {
  if (!isRecord(value)) return false;
  if (!isRecord(value.quotes)) return false;
  const expected = options.expectedTickers
    ?.map(normalizeEvidenceTickerParam)
    .filter((ticker): ticker is string => !!ticker) ?? null;
  const expectedSet: Set<string> | null = expected ? new Set<string>(expected) : null;
  const actualSet = new Set<string>();
  for (const [key, item] of Object.entries(value.quotes)) {
    const normalizedKey = normalizeEvidenceTickerParam(key);
    if (!normalizedKey || actualSet.has(normalizedKey)) return false;
    actualSet.add(normalizedKey);
    if (expectedSet && !expectedSet.has(normalizedKey)) return false;
    if (item !== null) {
      if (!isRecord(item)) return false;
      if (typeof item.ticker === 'string') {
        const itemTicker = normalizeEvidenceTickerParam(item.ticker);
        if (!itemTicker || itemTicker !== normalizedKey) return false;
      }
      if (options.validateQuote && !options.validateQuote(item, normalizedKey)) return false;
    }
  }
  if (expectedSet && (actualSet.size !== expectedSet.size || [...expectedSet].some((ticker) => !actualSet.has(ticker)))) return false;
  return validMeta(value.meta);
}
