export const QUOTE_BATCH_CHUNK_SIZE = 10;
export const QUOTE_TELEMETRY_INTERVAL_MS = 10 * 60_000;
export const QUOTE_SLOW_REQUEST_MS = 1_000;
export const QUOTE_BATCH_SUSPEND_THRESHOLD_MS = 60_000;
export { isQuoteBatchPayload } from './batch-contract';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Guard fields consumed by the watchlist so malformed provider output is never cached as a quote. */
export function isLiveQuotePayload(value: unknown, ticker: string): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const quote = value as Record<string, unknown>;
  if (typeof quote.ticker !== 'string' || quote.ticker.trim().toUpperCase() !== ticker.toUpperCase()) return false;
  for (const key of ['price', 'change', 'change_pct', 'open', 'high', 'low', 'prev_close', 'volume', 'amount', 'amplitude']) {
    if (!isFiniteNumber(quote[key])) return false;
  }
  for (const key of ['market_cap', 'pe_ttm', 'pb', 'turnover', 'volume_ratio']) {
    if (quote[key] !== null && quote[key] !== undefined && !isFiniteNumber(quote[key])) return false;
  }
  return typeof quote.source === 'string'
    && typeof quote.name === 'string'
    && typeof quote.market === 'string'
    && typeof quote.currency === 'string'
    && typeof quote.market_cap_label === 'string'
    && typeof quote.updated_at === 'string'
    && typeof quote.delayed === 'boolean';
}

interface SourceStats {
  attempted?: number;
  succeeded?: number;
  failed?: number;
  retries?: number;
  duration_ms?: number;
}

export interface QuoteBatchPayload<T> {
  quotes?: Record<string, T | null>;
  meta?: {
    failed?: number;
    stale?: number;
    duration_ms?: number;
    failed_tickers?: string[];
    error_codes?: string[];
    sources?: Record<string, SourceStats>;
    selected_sources?: Record<string, string>;
  };
}

function markStale<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  return { ...(value as Record<string, unknown>), stale: true, delayed: true } as T;
}

export interface QuoteBatchMeta {
  attempted: number;
  failed: number;
  stale: number;
  duration_ms: number;
  failed_tickers: string[];
  failed_chunks: number;
  error_codes: string[];
  sources: Record<string, Required<SourceStats>>;
  selected_sources: Record<string, string>;
}

export function quoteBatchErrorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'name' in error && error.name === 'AbortError') {
    return 'timeout';
  }
  const message = error instanceof Error ? error.message : '';
  const httpStatus = message.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  if (httpStatus) return `http_${httpStatus}`;
  if (error instanceof TypeError) return 'network_error';
  return 'chunk_failed';
}

export function shouldRetryQuoteBatchError(error: unknown, attempt: number): boolean {
  if (attempt >= 1) return false;
  const code = quoteBatchErrorCode(error);
  if (code === 'network_error' || code === 'timeout') return true;
  const status = Number(code.match(/^http_(\d{3})$/)?.[1]);
  return status === 408 || status === 429 || status >= 500;
}

export function classifyQuoteBatchOutcome(input: {
  allChunksFailed: boolean;
  allTickersUnavailable: boolean;
  failed: number;
  durationMs: number;
}): 'loaded' | 'degraded' | 'failed' | 'suspended' {
  const fullFailure = input.allChunksFailed || input.allTickersUnavailable;
  if (fullFailure && input.durationMs >= QUOTE_BATCH_SUSPEND_THRESHOLD_MS) return 'suspended';
  if (fullFailure) return 'failed';
  if (input.failed > 0) return 'degraded';
  return 'loaded';
}

export function chunkQuoteTickers(tickers: string[], size = QUOTE_BATCH_CHUNK_SIZE): string[][] {
  const boundedSize = Math.max(1, Math.floor(size));
  const unique = [...new Set(tickers.filter(Boolean))];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += boundedSize) {
    chunks.push(unique.slice(index, index + boundedSize));
  }
  return chunks;
}

export function mergeQuoteBatchResults<T>(input: {
  tickers: string[];
  previousQuotes: Record<string, T | null>;
  chunks: string[][];
  settled: PromiseSettledResult<QuoteBatchPayload<T>>[];
}) {
  const quotes: Record<string, T | null> = {};
  for (const ticker of input.tickers) quotes[ticker] = input.previousQuotes[ticker] ?? null;

  const failedTickers = new Set<string>();
  const errorCodes = new Set<string>();
  const selectedSources: Record<string, string> = {};
  const sources: Record<string, Required<SourceStats>> = {};
  let failedChunks = 0;
  let stale = 0;
  let durationMs = 0;

  input.settled.forEach((result, index) => {
    const chunk = input.chunks[index] ?? [];
    if (result.status === 'rejected') {
      failedChunks += 1;
      errorCodes.add(quoteBatchErrorCode(result.reason));
      chunk.forEach((ticker) => {
        failedTickers.add(ticker);
        if (input.previousQuotes[ticker]) {
          stale += 1;
          selectedSources[ticker] = 'client-cache';
          quotes[ticker] = markStale(input.previousQuotes[ticker]);
        }
      });
      return;
    }

    const payload = result.value;
    const nextQuotes = payload.quotes ?? {};
    const meta = payload.meta ?? {};
    durationMs = Math.max(durationMs, Number(meta.duration_ms) || 0);
    stale += Number(meta.stale) || 0;
    Object.assign(selectedSources, meta.selected_sources ?? {});

    for (const [source, stats] of Object.entries(meta.sources ?? {})) {
      const aggregate = sources[source] ?? { attempted: 0, succeeded: 0, failed: 0, retries: 0, duration_ms: 0 };
      aggregate.attempted += Number(stats.attempted) || 0;
      aggregate.succeeded += Number(stats.succeeded) || 0;
      aggregate.failed += Number(stats.failed) || 0;
      aggregate.retries += Number(stats.retries) || 0;
      aggregate.duration_ms += Number(stats.duration_ms) || 0;
      sources[source] = aggregate;
    }

    const reportedFailures = new Set(meta.failed_tickers ?? []);
    for (const ticker of chunk) {
      const value = nextQuotes[ticker];
      if (value) quotes[ticker] = value;
      if (!value || reportedFailures.has(ticker)) {
        failedTickers.add(ticker);
        if (!value && input.previousQuotes[ticker]) {
          stale += 1;
          selectedSources[ticker] = 'client-cache';
          quotes[ticker] = markStale(input.previousQuotes[ticker]);
        }
      }
    }
  });

  return {
    quotes,
    meta: {
      attempted: input.tickers.length,
      failed: failedTickers.size,
      stale,
      duration_ms: durationMs,
      failed_tickers: [...failedTickers],
      failed_chunks: failedChunks,
      error_codes: [...errorCodes],
      sources,
      selected_sources: selectedSources,
    } satisfies QuoteBatchMeta,
  };
}

export function shouldReportQuoteBatch(input: {
  now: number;
  lastReportedAt: number;
  manual: boolean;
  failed: number;
  stale: number;
  durationMs: number;
}): boolean {
  return input.manual
    || input.failed > 0
    || input.stale > 0
    || input.durationMs >= QUOTE_SLOW_REQUEST_MS
    || input.lastReportedAt === 0
    || input.now - input.lastReportedAt >= QUOTE_TELEMETRY_INTERVAL_MS;
}
