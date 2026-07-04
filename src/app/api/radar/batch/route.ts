import { NextResponse } from 'next/server';
import { buildRadar, type RadarPayload } from '@/lib/brief/radar';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import { fetchTwseQuotesBatch } from '@/lib/data/sources/twse';
import { classifyMarket } from '@/lib/utils';
import { getRequestLocale } from '@/lib/i18n/server';

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

  const locale = await getRequestLocale();
  const radars: Record<string, RadarPayload | { error: string } | { skipped: string }> = {};

  // Markets with no configured quote source (JP/KR until EODHD is subscribed)
  // are marked skipped up-front — don't burn time/quota inside buildRadar.
  const buildable = tickers.filter((t) => {
    if (quoteSourcesFor(classifyMarket(t)).length === 0) {
      radars[t] = { skipped: 'source-pending' };
      return false;
    }
    return true;
  });

  // Prime the TWSE 60s quote cache with ONE mis request before the fan-out —
  // otherwise each buildRadar resolves its TW quote independently and a
  // 20-ticker burst would fire 20 mis calls against a ~3 req/5 s limit.
  const twTickers = buildable.filter((t) => classifyMarket(t) === 'TW');
  if (twTickers.length > 0) await fetchTwseQuotesBatch(twTickers).catch(() => {});

  const results = await Promise.allSettled(buildable.map((t) => buildRadar(t, locale)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      radars[buildable[i]] = r.value;
    } else {
      radars[buildable[i]] = { error: r.reason?.message || 'unknown' };
    }
  });

  // Sort tickers by radar score (high → low) — UI can render in this order
  const order = tickers
    .map((t) => ({ t, score: (radars[t] as RadarPayload).score ?? -999 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);

  return NextResponse.json({ radars, order, generated_at: new Date().toISOString() });
}
