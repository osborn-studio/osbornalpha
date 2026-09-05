import { NextResponse } from 'next/server';
import { isTushareConfigured, fetchTushareReportRc, TushareError } from '@/lib/data/sources/tushare-cached';
import { deriveConsensus } from '@/lib/stocks/consensus';
import { deriveTargetPrice, deriveValuationRange } from '@/lib/stocks/metrics';
import { getStockOrStub } from '@/lib/data/mock';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1h cache — mirrors /api/financials

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/consensus/[ticker]
 *
 * Broker consensus target price, with graceful degradation:
 *   1. A-share + TUSHARE_TOKEN configured → report_rc (real broker research)
 *   2. Otherwise (non-A-share, no token, Tushare error, or tushare returned no
 *      usable reports) → mock broker_reports via deriveTargetPrice /
 *      deriveValuationRange, reshaped to the same { target_median, target_min,
 *      target_max, n } shape so callers don't need to branch on source.
   *      (Consumed by the stock detail page.)
 *   3. No usable data anywhere → { source: 'none', consensus: null }
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);

  if (isAShare && isTushareConfigured()) {
    try {
      const reports = await fetchTushareReportRc(ticker);
      const consensus = deriveConsensus(reports);
      // Zero usable reports (no broker coverage) → try the mock fallback below.
      if (consensus !== null) {
        return NextResponse.json({ source: 'tushare', ticker, consensus });
      }
    } catch (e: any) {
      if (!(e instanceof TushareError)) {
        return NextResponse.json(
          { source: 'error', ticker, error: e?.message || 'unknown', consensus: null },
          { status: 502 }
        );
      }
      // fall through to mock degradation below
    }
  }

  const stub = getStockOrStub(ticker);
  if (stub && stub.broker_reports?.length) {
    const target_median = deriveTargetPrice(stub.broker_reports);
    if (target_median != null) {
      const range = deriveValuationRange(stub.broker_reports);
      return NextResponse.json({
        source: 'mock',
        ticker,
        consensus: {
          target_median,
          target_min: range?.min ?? null,
          target_max: range?.max ?? null,
          n: stub.broker_reports.length,
        },
      });
    }
  }

  return NextResponse.json({ source: 'none', ticker, consensus: null });
}
