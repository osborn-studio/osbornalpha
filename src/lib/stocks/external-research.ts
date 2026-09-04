import { createHash } from 'node:crypto';
import { assessHeadlineSentiment, searchExternalEvidence } from '@/lib/external-evidence';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
import {
  fetchTushareReportRc,
  isTushareConfigured,
} from '@/lib/data/sources/tushare-cached';
import type { TushareReportRc } from '@/lib/data/sources/tushare';
import { deriveConsensus, filterConsensusReports, normalizeBrokerRating } from './consensus';
import type {
  StockNewsItem,
  StockNewsResponse,
  StockReportItem,
  StockReportsResponse,
  StockResearchMeta,
} from './research-types';
import type { EvidenceSearchSnapshot } from '@/lib/external-evidence/types';

function formatTushareDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

async function stockIdentity(ticker: string) {
  const quote = await fetchEastmoneyQuote(ticker).catch(() => null);
  return { name: quote?.name || ticker, market: quote?.market, price: quote?.price ?? null };
}

function evidenceMeta(
  snapshot: EvidenceSearchSnapshot,
  warnings: string[] = snapshot.warnings,
  extraProviders: string[] = [],
  extraResultCount = 0,
): StockResearchMeta {
  return {
    status: snapshot.status,
    providers: Array.from(new Set([...extraProviders, ...(snapshot.provider ? [snapshot.provider] : [])])),
    fetchedAt: snapshot.fetchedAt,
    warnings,
    queryCount: snapshot.queryCount,
    resultCount: snapshot.results.length + extraResultCount,
    durationMs: snapshot.durationMs,
    estimatedCostMicrousd: snapshot.estimatedCostMicrousd,
  };
}

export async function getStockNews(ticker: string, freshnessDays = 14): Promise<StockNewsResponse> {
  const identity = await stockIdentity(ticker);
  const snapshot = await searchExternalEvidence({
    ticker,
    name: identity.name,
    market: identity.market,
    scopes: ['news', 'filing'],
    freshnessDays,
    limit: 15,
  });
  const items: StockNewsItem[] = snapshot.results.map((item) => {
    const sentiment = assessHeadlineSentiment(`${item.title} ${item.snippet}`);
    return {
    id: item.citationId,
    title: item.title,
    source: item.domain,
    url: item.url,
    snippet: item.snippet,
    sentiment: sentiment.score,
    sentimentConfidence: sentiment.confidence,
    sentimentPositiveMatches: sentiment.positiveMatches,
    sentimentNegativeMatches: sentiment.negativeMatches,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    trustScore: item.trustScore,
    relevanceScore: item.relevanceScore,
    qualityScore: item.qualityScore,
    qualityFlags: item.qualityFlags,
    eventClusterId: item.eventClusterId,
    corroborationCount: item.corroborationCount,
    corroboratingSources: item.corroboratingSources,
    sourceType: item.sourceType,
    };
  });
  return {
    ticker,
    items,
    meta: evidenceMeta(snapshot),
  };
}

function reportFromTushare(ticker: string, report: TushareReportRc): StockReportItem {
  const title = report.report_title?.trim() || `${ticker} research update`;
  return {
    id: stableId('ts', `${ticker}|${report.report_date}|${report.org_name}|${title}`),
    title,
    broker: report.org_name?.trim() || null,
    rating: report.rating?.trim() || null,
    ratingNormalized: normalizeBrokerRating(report.rating),
    targetPriceMin: Number.isFinite(report.min_price) ? report.min_price! : null,
    targetPriceMax: Number.isFinite(report.max_price) ? report.max_price! : null,
    targetChangePct: Number.isFinite(report.rd) ? report.rd! : null,
    url: null,
    publishedAt: formatTushareDate(report.report_date),
    source: 'tushare',
    trustScore: 0.78,
    relevanceScore: 0.8,
    qualityScore: 0.78,
    qualityFlags: ['professional_source', 'dated_source'],
  };
}

function reportIdentity(item: StockReportItem): string {
  if (item.url) return `url:${item.url}`;
  return [item.broker || '', item.title.trim().toLocaleLowerCase(), item.publishedAt || ''].join('|');
}

export function mergeDuplicateReports(items: StockReportItem[]): StockReportItem[] {
  const merged = new Map<string, StockReportItem>();
  for (const item of items) {
    const key = reportIdentity(item);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, item);
      continue;
    }
    const preferred = (item.qualityScore ?? item.trustScore) > (current.qualityScore ?? current.trustScore) ? item : current;
    merged.set(key, {
      ...preferred,
      targetPriceMin: preferred.targetPriceMin ?? item.targetPriceMin ?? current.targetPriceMin,
      targetPriceMax: preferred.targetPriceMax ?? item.targetPriceMax ?? current.targetPriceMax,
      targetChangePct: preferred.targetChangePct ?? item.targetChangePct ?? current.targetChangePct,
      rating: preferred.rating ?? item.rating ?? current.rating,
      ratingNormalized: preferred.ratingNormalized && preferred.ratingNormalized !== 'unknown'
        ? preferred.ratingNormalized
        : item.ratingNormalized && item.ratingNormalized !== 'unknown'
          ? item.ratingNormalized
          : current.ratingNormalized ?? 'unknown',
      url: preferred.url ?? current.url,
      qualityFlags: [...new Set([...(current.qualityFlags ?? []), ...(item.qualityFlags ?? []), 'provider_ranked'])] as Array<NonNullable<StockReportItem['qualityFlags']>[number]>,
    });
  }
  return [...merged.values()];
}

export async function getStockReports(ticker: string): Promise<StockReportsResponse> {
  const identity = await stockIdentity(ticker);
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);
  const canUseTushare = isAShare && isTushareConfigured();
  const [snapshot, tushareResult] = await Promise.all([
    searchExternalEvidence({
      ticker,
      name: identity.name,
      market: identity.market,
      scopes: ['broker'],
      freshnessDays: 180,
      limit: 12,
    }),
    canUseTushare
      ? fetchTushareReportRc(ticker).then((items) => ({ items, error: null as string | null })).catch(() => ({ items: [], error: 'tushare_unavailable' }))
      : Promise.resolve({ items: [], error: null as string | null }),
  ]);

  const structured = tushareResult.items.map((item) => reportFromTushare(ticker, item));
  const discovered: StockReportItem[] = snapshot.results.map((item) => ({
    id: item.citationId,
    title: item.title,
    broker: item.domain,
    rating: null,
    ratingNormalized: 'unknown',
    targetPriceMin: null,
    targetPriceMax: null,
    targetChangePct: null,
    url: item.url,
    publishedAt: item.publishedAt,
    source: snapshot.provider || 'web',
    trustScore: item.trustScore,
    relevanceScore: item.relevanceScore,
    qualityScore: item.qualityScore,
    qualityFlags: item.qualityFlags,
    eventClusterId: item.eventClusterId,
    corroborationCount: item.corroborationCount,
    corroboratingSources: item.corroboratingSources,
  }));
  const items = mergeDuplicateReports([...structured, ...discovered]);
  const consensusInput = filterConsensusReports(tushareResult.items, { asOf: new Date(), maxAgeDays: 180, currentPrice: identity.price });
  const consensus = deriveConsensus(consensusInput.accepted);
  const warnings = [
    ...snapshot.warnings,
    ...(tushareResult.error ? [tushareResult.error] : []),
    ...consensusInput.reasons.map((reason) => `consensus_${reason}`),
  ];
  const status = items.length > 0
    ? (snapshot.status === 'complete' && !tushareResult.error ? 'complete' : 'partial')
    : snapshot.status;

  return {
    ticker,
    items,
    consensus: consensus ? {
      targetMedian: consensus.target_median,
      targetMin: consensus.target_min,
      targetMax: consensus.target_max,
      count: consensus.n,
    } : null,
    meta: {
      ...evidenceMeta(snapshot, warnings, structured.length > 0 ? ['tushare'] : [], structured.length),
      status,
    },
  };
}
