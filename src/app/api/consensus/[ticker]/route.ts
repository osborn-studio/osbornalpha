import { NextResponse } from 'next/server';
import { isTushareConfigured, fetchTushareReportRc, TushareError } from '@/lib/data/sources/tushare-cached';
import { deriveConsensus, filterConsensusReports } from '@/lib/stocks/consensus';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { classifyMarket } from '@/lib/utils';
import { loadConfiguredStructuredResearch } from '@/lib/stocks/structured-research-provider';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1h cache — mirrors /api/financials

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/consensus/[ticker]
 *
 * Broker consensus target price from structured providers only. Search results
 * remain visible as research, but never become synthetic target-price inputs.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = normalizeEvidenceTickerParam(raw);
  if (!ticker) return NextResponse.json({ error: 'invalid_ticker', consensus: null }, { status: 400 });
  const market = classifyMarket(ticker);

  if (market === 'A' && isTushareConfigured()) {
    try {
      const reports = await fetchTushareReportRc(ticker);
      const filtered = filterConsensusReports(reports, { maxAgeDays: 180 });
      const consensus = deriveConsensus(filtered.accepted);
      return NextResponse.json({
        source: 'tushare', ticker, consensus,
        meta: { status: consensus ? 'available' : 'unavailable', warnings: filtered.reasons },
      });
    } catch (e: any) {
      if (!(e instanceof TushareError)) {
        return NextResponse.json(
          { source: 'error', ticker, error: e?.message || 'unknown', consensus: null },
          { status: 502 }
        );
      }
      return NextResponse.json({
        source: 'tushare', ticker, consensus: null,
        meta: { status: 'unavailable', warnings: ['tushare_unavailable'] },
      });
    }
  }

  if (market === 'HK' || market === 'US') {
    try {
      const result = await loadConfiguredStructuredResearch(ticker, market);
      const rows = result.items.map((item) => ({
        max_price: item.targetPriceMax,
        min_price: item.targetPriceMin,
        report_date: item.publishedAt,
        org_name: item.broker,
        report_title: item.title,
      }));
      const filtered = filterConsensusReports(rows, { maxAgeDays: 180 });
      const consensus = deriveConsensus(filtered.accepted);
      return NextResponse.json({
        source: result.provider, ticker, consensus,
        meta: {
          status: consensus ? 'available' : 'unavailable',
          warnings: [...new Set([...result.warnings, ...filtered.reasons])],
        },
      });
    } catch {
      return NextResponse.json({
        source: 'structured-research-http', ticker, consensus: null,
        meta: { status: 'unavailable', warnings: ['structured_research_provider_unavailable'] },
      });
    }
  }

  return NextResponse.json({
    source: 'none', ticker, consensus: null,
    meta: {
      status: 'unsupported',
      warnings: [market === 'A' ? 'tushare_unconfigured' : 'structured_research_market_unsupported'],
    },
  });
}
