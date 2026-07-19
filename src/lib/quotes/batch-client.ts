export const QUOTE_BATCH_CHUNK_SIZE = 10;
export const QUOTE_TELEMETRY_INTERVAL_MS = 10 * 60_000;
export const QUOTE_SLOW_REQUEST_MS = 1_000;

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
    sources?: Record<string, SourceStats>;
    selected_sources?: Record<string, string>;
  };
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
  const selectedSources: Record<string, string> = {};
  const sources: Record<string, Required<SourceStats>> = {};
  let failedChunks = 0;
  let stale = 0;
  let durationMs = 0;

  input.settled.forEach((result, index) => {
    const chunk = input.chunks[index] ?? [];
    if (result.status === 'rejected') {
      failedChunks += 1;
      chunk.forEach((ticker) => {
        failedTickers.add(ticker);
        if (input.previousQuotes[ticker]) {
          stale += 1;
          selectedSources[ticker] = 'client-cache';
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
      sources,
      selected_sources: selectedSources,
    },
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
