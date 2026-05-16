import { NextResponse } from 'next/server';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickersParam = url.searchParams.get('tickers') || '';
  const tickers = tickersParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);  // cap

  if (tickers.length === 0) {
    return NextResponse.json({ quotes: {} });
  }

  // Parallel fetch (Eastmoney quotes are fast & idempotent)
  const results = await Promise.allSettled(
    tickers.map((t) => fetchEastmoneyQuote(t))
  );

  const quotes: Record<string, any> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      quotes[tickers[i]] = r.value;
    } else {
      quotes[tickers[i]] = null;
    }
  });

  return NextResponse.json({ quotes });
}
