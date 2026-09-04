import { NextResponse } from 'next/server';
import { fetchTwseQuotesBatch } from '@/lib/data/sources/twse';
import { classifyMarket } from '@/lib/utils';
import {
  aggregateSourceAttempts,
  classifySourceFailure,
  type SourceAttempt,
  type SourceOutcome,
} from '@/lib/quotes/diagnostics';
import { fetchDatagatewayRealtimeQuotes, isDatagatewayConfigured } from '@/lib/data/sources/datagateway-quote';
import { readQuoteCache, resolveQuote, writeQuoteCache, type QuoteResolution, type QuoteShape } from '@/lib/quotes/resolve-quote';
import { parseQuoteBatchRequest } from '@/lib/quotes/batch-contract';

export const dynamic = 'force-dynamic';
export const revalidate = 30;
export const maxDuration = 30;

const FRESH_TTL_MS = 60_000;
const STALE_TTL_MS = 15 * 60_000;

export async function GET(req: Request) {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const request = parseQuoteBatchRequest(url);
  if ('error' in request) {
    return NextResponse.json({ error: request.error }, { status: 400 });
  }
  const { tickers, force } = request;
  const freshQuotes: Record<string, QuoteShape> = {};
  const selectedSources: Record<string, string> = {};
  const toFetch: string[] = [];
  for (const ticker of tickers) {
    const cached = !force ? readQuoteCache(ticker, FRESH_TTL_MS) : null;
    if (cached) {
      freshQuotes[ticker] = cached;
      selectedSources[ticker] = 'cache';
    } else {
      toFetch.push(ticker);
    }
  }

  // Wind/DataGateway is queried once for the whole uncached set. Only the
  // missing symbols continue to the existing per-source fallback cascade.
  let windMap = new Map<string, QuoteShape | null>();
  let windFailure: Exclude<SourceOutcome, 'success' | 'empty'> | null = null;
  let windAttempts = 0;
  const windStartedAt = Date.now();
  if (isDatagatewayConfigured() && toFetch.length > 0) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      windAttempts += 1;
      try {
        windMap = await fetchDatagatewayRealtimeQuotes(toFetch) as Map<string, QuoteShape | null>;
        windFailure = null;
        break;
      } catch (error) {
        windFailure = classifySourceFailure(error);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
  const fallbackTickers = toFetch.filter((ticker) => !windMap.has(ticker.toUpperCase()));
  // TW group: one native multi-symbol mis request (rate limit ~3 req / 5 s);
  // remaining markets go through the per-ticker registry cascade.
  const twTickers = fallbackTickers.filter((t) => classifyMarket(t) === 'TW');
  const otherTickers = fallbackTickers.filter((t) => classifyMarket(t) !== 'TW');

  const twStartedAt = Date.now();
  let twFailure: Exclude<SourceOutcome, 'success' | 'empty'> | null = null;
  const [twMap, results] = await Promise.all([
    twTickers.length > 0
      ? fetchTwseQuotesBatch(twTickers).catch((error) => {
          twFailure = classifySourceFailure(error);
          return new Map<string, QuoteShape | null>();
        })
      : Promise.resolve(new Map<string, QuoteShape | null>()),
    Promise.allSettled(otherTickers.map((ticker) => resolveQuote(ticker, { skipDatagateway: true, force }))),
  ]);

  const quotes: Record<string, QuoteShape | null> = { ...freshQuotes };
  const sourceAttempts: SourceAttempt[] = [];
  let stale = 0;
  if (isDatagatewayConfigured()) {
    for (const ticker of toFetch) {
      const value = windMap.get(ticker.toUpperCase()) ?? null;
      sourceAttempts.push({
        ticker,
        source: 'datagateway-wind',
        outcome: value ? 'success' : windFailure ?? 'empty',
        attempts: windAttempts,
        duration_ms: Date.now() - windStartedAt,
      });
      if (value) {
        writeQuoteCache(ticker, value);
        quotes[ticker] = value;
        selectedSources[ticker] = 'datagateway-wind';
      } else {
        const cached = readQuoteCache(ticker, STALE_TTL_MS);
        if (cached) {
          stale += 1;
          quotes[ticker] = { ...cached, delayed: true, stale: true };
          selectedSources[ticker] = 'stale-cache';
        } else {
          quotes[ticker] = null;
        }
      }
    }
  }
  results.forEach((r, i) => {
    const ticker = otherTickers[i];
    const resolution = r.status === 'fulfilled'
      ? r.value
      : {
          quote: null,
          attempts: [{
            ticker,
            source: 'resolver',
            outcome: classifySourceFailure(r.reason),
            attempts: 1,
            duration_ms: Date.now() - startedAt,
          }],
          selectedSource: null,
        } satisfies QuoteResolution;
    sourceAttempts.push(...resolution.attempts);
    const value = resolution.quote;
    if (value) {
      writeQuoteCache(ticker, value);
      quotes[ticker] = value;
      if (resolution.selectedSource) selectedSources[ticker] = resolution.selectedSource;
      return;
    }
    const cached = readQuoteCache(ticker, STALE_TTL_MS);
    if (cached) {
      stale += 1;
      quotes[ticker] = { ...cached, delayed: true, stale: true };
      selectedSources[ticker] = 'stale-cache';
    } else {
      quotes[ticker] = null;
    }
  });
  for (const t of twTickers) {
    const value = (twMap.get(t) as QuoteShape | undefined) ?? null;
    sourceAttempts.push({
      ticker: t,
      source: 'twse',
      outcome: value ? 'success' : twFailure ?? 'empty',
      attempts: 1,
      duration_ms: Date.now() - twStartedAt,
    });
    if (value) {
      writeQuoteCache(t, value);
      quotes[t] = value;
      selectedSources[t] = 'twse';
      continue;
    }
    const cached = readQuoteCache(t, STALE_TTL_MS);
    if (cached) {
      stale += 1;
      quotes[t] = { ...cached, delayed: true, stale: true };
      selectedSources[t] = 'stale-cache';
    } else {
      quotes[t] = null;
    }
  }

  const failed = tickers.filter((t) => !quotes[t]).length;
  const failedTickers = tickers.filter((t) => !quotes[t]);
  const sources = aggregateSourceAttempts(sourceAttempts);
  if (failed > 0) {
    console.warn('quote batch degraded', { attempted: tickers.length, failed, stale, sources });
  }

  return NextResponse.json({
    quotes,
    meta: {
      attempted: tickers.length,
      failed,
      stale,
      duration_ms: Date.now() - startedAt,
      sources,
      failed_tickers: failedTickers,
      selected_sources: selectedSources,
    },
  });
}
