import { classifyMarket } from '@/lib/utils';
import type { MarketReturnProvider, MarketReturnSnapshot, WatchlistHistoryRange } from '../types';

const YAHOO_CHART_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 8_000_000;

interface YahooChartResult {
  meta?: { symbol?: string; currency?: string };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ close?: Array<number | null> }>;
    adjclose?: Array<{ adjclose?: Array<number | null> }>;
  };
  events?: {
    dividends?: Record<string, unknown>;
    splits?: Record<string, unknown>;
  };
}

interface YahooChartResponse {
  chart?: { result?: YahooChartResult[] | null; error?: unknown };
}

const YAHOO_RANGES: Record<WatchlistHistoryRange, string> = {
  '1m': '1mo',
  '6m': '6mo',
  ytd: 'ytd',
  '1y': '1y',
  '5y': '5y',
  all: 'max',
};

function yahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.SH$/, '.SS');
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function returnPct(first: number, last: number): number {
  return ((last / first) - 1) * 100;
}

function dateOf(timestamp: number): string {
  return new Date(timestamp * 1_000).toISOString().slice(0, 10);
}

export function buildYahooReturnSnapshot(
  ticker: string,
  range: WatchlistHistoryRange,
  payload: YahooChartResponse,
): MarketReturnSnapshot {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const rows = timestamps.flatMap((timestamp, index) => {
    const close = closes[index];
    return Number.isFinite(timestamp) && finitePositive(close)
      ? [{ timestamp, close, adjustedClose: finitePositive(adjusted[index]) ? adjusted[index] : null }]
      : [];
  });
  if (rows.length < 2) throw new Error('yahoo_return_history_insufficient');

  const first = rows[0];
  const last = rows.at(-1)!;
  const priceReturnPct = returnPct(first.close, last.close);
  const adjustedRows = rows.filter((row): row is typeof row & { adjustedClose: number } => row.adjustedClose !== null);
  const adjustedCoverageComplete = adjustedRows.length === rows.length;
  const totalReturnPct = adjustedCoverageComplete
    ? returnPct(adjustedRows[0].adjustedClose, adjustedRows.at(-1)!.adjustedClose)
    : null;
  const dividendCount = Object.keys(result?.events?.dividends ?? {}).length;
  const splitCount = Object.keys(result?.events?.splits ?? {}).length;
  const warnings = adjustedCoverageComplete ? [] : ['adjusted_close_incomplete'];

  return {
    ticker: ticker.trim().toUpperCase(),
    market: classifyMarket(ticker),
    range,
    source: 'yahoo-chart',
    currency: result?.meta?.currency ?? '',
    priceReturnPct,
    totalReturnPct,
    distributionContributionPct: totalReturnPct == null ? null : totalReturnPct - priceReturnPct,
    dividendCount,
    splitCount,
    coverageStart: dateOf(first.timestamp),
    coverageEnd: dateOf(last.timestamp),
    asOf: dateOf(last.timestamp),
    methodology: {
      priceBasis: 'unadjusted_close',
      totalReturnBasis: totalReturnPct == null ? 'unavailable' : 'adjusted_close_reinvestment',
    },
    warnings,
  };
}

async function fetchYahooChart(ticker: string, range: WatchlistHistoryRange, signal?: AbortSignal): Promise<YahooChartResponse> {
  const query = new URLSearchParams({
    range: YAHOO_RANGES[range],
    interval: range === 'all' ? '1mo' : range === '5y' ? '1wk' : '1d',
    events: 'div,splits',
    includeAdjustedClose: 'true',
  });
  const response = await fetch(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(yahooSymbol(ticker))}?${query}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; OsbornAlpha/1.0)' },
    signal: signal ? AbortSignal.any([AbortSignal.timeout(YAHOO_TIMEOUT_MS), signal]) : AbortSignal.timeout(YAHOO_TIMEOUT_MS),
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error(`yahoo_chart_http_${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('yahoo_chart_response_too_large');
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('yahoo_chart_response_too_large');
  try {
    return JSON.parse(text) as YahooChartResponse;
  } catch {
    throw new Error('yahoo_chart_invalid_json');
  }
}

export const yahooChartReturnProvider = {
  id: 'yahoo-chart',
  supports: () => true,
  async load(ticker: string, range: WatchlistHistoryRange, signal?: AbortSignal) {
    return buildYahooReturnSnapshot(ticker, range, await fetchYahooChart(ticker, range, signal));
  },
} satisfies MarketReturnProvider;
