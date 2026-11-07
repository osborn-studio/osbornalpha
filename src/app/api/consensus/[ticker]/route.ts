import { NextResponse } from 'next/server';
import { isTushareConfigured, fetchTushareReportRc, TushareError } from '@/lib/data/sources/tushare-cached';
import { deriveConsensus } from '@/lib/stocks/consensus';
// FOREIGN: mock imports removed (spec §9.4)

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1h cache — mirrors /api/financials

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/consensus/[ticker]
 *
 * Broker consensus target price, with graceful degradation:
 *   1. A-share + TUSHARE_TOKEN configured → report_rc (real broker research)
 *   2. Otherwise (non-A-share, no token, Tushare error, or Tushare returned no
 *      usable reports) → { source: 'none', consensus: null }.
 *      FOREIGN: library reports now come from /api/broker-research/by-ticker.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);

  if (isAShare && isTushareConfigured()) {
    try {
      const reports = await fetchTushareReportRc(ticker);
      const consensus = deriveConsensus(reports);
      // Zero usable reports (no broker coverage) → fall through to source none below.
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
      // fall through to source none below
    }
  }

  // FOREIGN ↓ no mock fallback (spec §9.4)
  // FOREIGN ↑
  return NextResponse.json({ source: 'none', ticker, consensus: null });
}
