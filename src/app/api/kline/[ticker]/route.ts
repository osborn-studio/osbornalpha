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
  const requestedPeriod = (url.searchParams.get('period') || 'D').toUpperCase();
  const period = (['1', 'D', 'W', 'M'].includes(requestedPeriod) ? requestedPeriod : 'D') as '1' | 'D' | 'W' | 'M';
  const requestedLimit = parseInt(url.searchParams.get('limit') || '120', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 120;

  try {
    // TW → TWSE STOCK_DAY (listed .TW only; .TWO returns null → 404 for now).
    // Everything else keeps the existing Eastmoney path.
    const result = classifyMarket(ticker) === 'TW'
      // TWSE only exposes daily history through the source currently in use.
      // A 1D selection degrades to the latest daily bar rather than fabricated intraday data.
      ? await fetchTwseKline(ticker, period === '1' ? 'D' : period, period === '1' ? 1 : limit)
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
