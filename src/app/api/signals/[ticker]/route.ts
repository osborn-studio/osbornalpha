import { NextResponse } from 'next/server';
import { runBacktest } from '@/lib/signals/backtest';

export const dynamic = 'force-dynamic';
export const revalidate = 1800;  // 30 min cache
export const maxDuration = 30;

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/signals/[ticker]?days=60
 * Returns historical signal events + win/loss stats over the past N days.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '60', 10), 10), 180);

  try {
    const result = await runBacktest(ticker, days);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'backtest failed', stack: e?.stack?.slice(0, 500) },
      { status: 502 }
    );
  }
}
