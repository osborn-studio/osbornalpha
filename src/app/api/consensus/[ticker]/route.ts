import { NextResponse } from 'next/server';
import { isTushareConfigured, fetchTushareReportRc, TushareError } from '@/lib/data/sources/tushare-cached';
import { deriveConsensus } from '@/lib/stocks/consensus';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1h cache

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/consensus/[ticker]
 *
 * Broker consensus target price from a licensed source only (company-research spec §9.4, decision D):
 *   1. A-share + TUSHARE_TOKEN configured → report_rc (real broker research)
 *   2. Anything else (non-A-share, no token, Tushare error, no usable reports) → { source: 'none', consensus: null }
 * The former mock fallback (fabricated broker_reports) is closed.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);

  if (isAShare && isTushareConfigured()) {
    try {
      const reports = await fetchTushareReportRc(ticker);
      const consensus = deriveConsensus(reports);
      if (consensus !== null) return NextResponse.json({ source: 'tushare', ticker, consensus });
    } catch (e: any) {
      if (!(e instanceof TushareError)) {
        return NextResponse.json(
          { source: 'error', ticker, error: e?.message || 'unknown', consensus: null },
          { status: 502 }
        );
      }
    }
  }
  return NextResponse.json({ source: 'none', ticker, consensus: null });
}
