import { NextResponse } from 'next/server';
import { loadFinancialReport } from '@/lib/financials/service';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;  // 1h cache

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).trim();
  if (!ticker || ticker.length > 32) {
    return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
  }

  try {
    const report = await loadFinancialReport(ticker);
    return NextResponse.json({
      source: report.source,
      ticker: report.ticker,
      yearly: report.yearly,
      quarterly: report.quarterly,
      ttm: report.ttm,
      latest_indicator: report.latestIndicator
        ? {
            end_date: report.latestIndicator.periodEnd,
            roe: report.latestIndicator.roe,
            gross_margin: report.latestIndicator.grossMargin,
            net_margin: report.latestIndicator.netMargin,
            current_ratio: report.latestIndicator.currentRatio,
          }
        : null,
      meta: report.meta,
    });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown' },
      { status: 502 }
    );
  }
}
