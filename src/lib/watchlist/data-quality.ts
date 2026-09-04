export type QuoteQualityStatus = 'loading' | 'unavailable' | 'stale' | 'delayed' | 'live';

interface QuoteQualityInput {
  price?: number | null;
  prev_close?: number | null;
  volume?: number | null;
  amount?: number | null;
  market_cap?: number | null;
  pe_ttm?: number | null;
  pb?: number | null;
  turnover?: number | null;
  volume_ratio?: number | null;
}

interface HistoryQualityInput {
  status: 'fresh' | 'delayed' | 'stale' | 'unavailable';
  value: {
    coverageRatio?: number | null;
    sampleSize?: number | null;
    benchmarkStatus?: 'unavailable' | 'limited' | 'reliable' | null;
  } | null;
}

export interface WatchlistDataQuality {
  score: number;
  completenessPct: number;
  freshnessPct: number;
  analyticsPct: number | null;
}

function boundedRatio(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function calculateWatchlistDataQuality(
  quote: QuoteQualityInput | null,
  quoteStatus: QuoteQualityStatus,
  history?: HistoryQualityInput | null,
): WatchlistDataQuality {
  const fields = quote ? [
    quote.price, quote.prev_close, quote.volume, quote.amount, quote.market_cap,
    quote.pe_ttm, quote.pb, quote.turnover, quote.volume_ratio,
  ] : [];
  const completenessPct = Math.round((fields.filter((item) => item != null && Number.isFinite(item)).length / 9) * 100);
  const freshnessPct = quoteStatus === 'live' ? 100
    : quoteStatus === 'delayed' ? 70
      : quoteStatus === 'stale' ? 30 : 0;
  const quotePoints = completenessPct * 0.55 + freshnessPct * 0.25;

  if (history === undefined) {
    return {
      score: Math.round(quotePoints / 0.8),
      completenessPct,
      freshnessPct,
      analyticsPct: null,
    };
  }

  const historyFreshness = history?.status === 'fresh' ? 1
    : history?.status === 'delayed' ? 0.75
      : history?.status === 'stale' ? 0.35 : 0;
  const coverage = boundedRatio(history?.value?.coverageRatio);
  const sample = Math.min(1, Math.max(0, Number(history?.value?.sampleSize ?? 0) / 60));
  const benchmark = history?.value?.benchmarkStatus === 'reliable' ? 1
    : history?.value?.benchmarkStatus === 'limited' ? 0.5 : 0;
  const analyticsPct = Math.round((historyFreshness * 0.3 + coverage * 0.35 + sample * 0.2 + benchmark * 0.15) * 100);
  return {
    score: Math.round(quotePoints + analyticsPct * 0.2),
    completenessPct,
    freshnessPct,
    analyticsPct,
  };
}
