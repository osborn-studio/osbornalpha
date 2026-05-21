import { NextResponse } from 'next/server';
import { buildRadar, type RadarPayload } from '@/lib/brief/radar';

export const dynamic = 'force-dynamic';
export const revalidate = 1800;
export const maxDuration = 60;  // allow longer for batch fan-out

/**
 * GET /api/radar/batch?tickers=A,B,C
 *
 * Fans out buildRadar() in parallel for a list of tickers and returns
 * a map ticker → payload (or null on per-ticker failure). Used by the
 * /radar page to render the full watchlist in one shot.
 *
 * Capped at 25 tickers to stay under Vercel's 60s timeout when the
 * Tushare cache is cold across the board.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickers = (url.searchParams.get('tickers') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  if (tickers.length === 0) {
    return NextResponse.json({ radars: {} });
  }

  const results = await Promise.allSettled(tickers.map((t) => buildRadar(t)));
  const radars: Record<string, RadarPayload | { error: string }> = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      radars[tickers[i]] = r.value;
    } else {
      radars[tickers[i]] = { error: r.reason?.message || 'unknown' };
    }
  });

  // Sort tickers by radar score (high → low) — UI can render in this order
  const order = tickers
    .map((t) => ({ t, score: (radars[t] as RadarPayload).score ?? -999 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);

  return NextResponse.json({ radars, order, generated_at: new Date().toISOString() });
}
