import { NextResponse } from 'next/server';
import {
  isTushareConfigured,
  fetchTushareTopHolders,
  fetchTushareFloatHolders,
} from '@/lib/data/sources/tushare';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;  // 24h cache (quarterly disclosure)

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  if (!/\.(SH|SZ|BJ)$/i.test(ticker)) {
    return NextResponse.json(
      { source: 'unsupported', ticker, error: 'Tushare holders only support A-share' },
      { status: 200 }
    );
  }

  if (!isTushareConfigured()) {
    return NextResponse.json(
      { source: 'no-token', ticker, error: 'TUSHARE_TOKEN not configured' },
      { status: 200 }
    );
  }

  try {
    const [top10, floats] = await Promise.all([
      fetchTushareTopHolders(ticker).catch(() => []),
      fetchTushareFloatHolders(ticker).catch(() => []),
    ]);

    return NextResponse.json({
      source: 'tushare',
      ticker,
      top10_holders: top10,
      top10_floatholders: floats,
      reporting_period: top10[0]?.end_date || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown' },
      { status: 502 }
    );
  }
}
