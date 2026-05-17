import { NextResponse } from 'next/server';
import { runBatchBacktest } from '@/lib/signals/batchBacktest';

export const dynamic = 'force-dynamic';
export const revalidate = 1800;
export const maxDuration = 60;

const DEFAULT_WATCHLIST = [
  '600519.SH', '002624.SZ', '002594.SZ', '300750.SZ',
  '00700.HK', '09988.HK',
  'AAPL', 'NVDA', 'MSFT', 'GOOGL',
];

/**
 * GET /api/backtest?tickers=A,B,C&days=60
 *   Without tickers → uses DEFAULT_WATCHLIST.
 *   Returns ranked Sentinel signal reliability across the batch.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickersParam = url.searchParams.get('tickers');
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '60', 10), 10), 180);

  const tickers = tickersParam
    ? tickersParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40)
    : DEFAULT_WATCHLIST;

  try {
    const result = await runBatchBacktest(tickers, days);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'batch backtest failed' },
      { status: 502 }
    );
  }
}
