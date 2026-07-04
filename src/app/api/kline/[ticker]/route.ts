import { NextResponse } from 'next/server';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { fetchTwseKline } from '@/lib/data/sources/twse';
import { classifyMarket } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  const url = new URL(req.url);
  const period = (url.searchParams.get('period') || 'D').toUpperCase() as 'D' | 'W' | 'M';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '120', 10), 500);

  try {
    // TW → TWSE STOCK_DAY (listed .TW only; .TWO returns null → 404 for now).
    // Everything else keeps the existing Eastmoney path.
    const result = classifyMarket(ticker) === 'TW'
      ? await fetchTwseKline(ticker, period, limit)
      : await fetchEastmoneyKline(ticker, period, limit);
    if (!result || result.bars.length === 0) {
      return NextResponse.json({ source: 'none', ticker, bars: [] }, { status: 404 });
    }
    return NextResponse.json({ source: result.source, ticker, bars: result.bars });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown', bars: [] },
      { status: 502 }
    );
  }
}
