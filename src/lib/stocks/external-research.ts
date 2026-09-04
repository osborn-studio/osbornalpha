import { createHash } from 'node:crypto';
import { classifyHeadlineSentiment, searchExternalEvidence } from '@/lib/external-evidence';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
import {
  fetchTushareReportRc,
  isTushareConfigured,
} from '@/lib/data/sources/tushare-cached';
import type { TushareReportRc } from '@/lib/data/sources/tushare';
import { deriveConsensus } from './consensus';
import type {
  StockNewsItem,
  StockNewsResponse,
  StockReportItem,
  StockReportsResponse,
  StockResearchMeta,
} from './research-types';

function formatTushareDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

async function stockIdentity(ticker: string) {
  const quote = await fetchEastmoneyQuote(ticker).catch(() => null);
  return { name: quote?.name || ticker, market: quote?.market };
}

function evidenceMeta(
  status: StockResearchMeta['status'],
  provider: string | null,
  fetchedAt: string,
  warnings: string[],
  extraProviders: string[] = [],
): StockResearchMeta {
  return {
    status,
    providers: Array.from(new Set([...extraProviders, ...(provider ? [provider] : [])])),
    fetchedAt,
    warnings,
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
  const items: StockNewsItem[] = snapshot.results.map((item) => ({
    id: item.citationId,
    title: item.title,
    source: item.domain,
    url: item.url,
    snippet: item.snippet,
    sentiment: classifyHeadlineSentiment(`${item.title} ${item.snippet}`),
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    trustScore: item.trustScore,
    sourceType: item.sourceType,
  }));
  return {
    ticker,
    items,
    meta: evidenceMeta(snapshot.status, snapshot.provider, snapshot.fetchedAt, snapshot.warnings),
  };
}

function reportFromTushare(ticker: string, report: TushareReportRc): StockReportItem {
  const title = report.report_title?.trim() || `${ticker} research update`;
  return {
    id: stableId('ts', `${ticker}|${report.report_date}|${report.org_name}|${title}`),
    title,
    broker: report.org_name?.trim() || null,
    rating: report.rating?.trim() || null,
    targetPriceMin: Number.isFinite(report.min_price) ? report.min_price! : null,
    targetPriceMax: Number.isFinite(report.max_price) ? report.max_price! : null,
    targetChangePct: Number.isFinite(report.rd) ? report.rd! : null,
    url: null,
    publishedAt: formatTushareDate(report.report_date),
    source: 'tushare',
    trustScore: 0.78,
  };
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
    targetPriceMin: null,
    targetPriceMax: null,
    targetChangePct: null,
    url: item.url,
    publishedAt: item.publishedAt,
    source: snapshot.provider || 'web',
    trustScore: item.trustScore,
  }));
  const seen = new Set<string>();
  const items = [...structured, ...discovered].filter((item) => {
    const key = item.title.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const consensus = deriveConsensus(tushareResult.items);
  const warnings = [...snapshot.warnings, ...(tushareResult.error ? [tushareResult.error] : [])];
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
    meta: evidenceMeta(status, snapshot.provider, snapshot.fetchedAt, warnings, structured.length > 0 ? ['tushare'] : []),
  };
}
