import { NextResponse } from 'next/server';
import { buildCalendar, type CalendarEvent } from '@/lib/brief/calendar';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const maxDuration = 60;

/**
 * GET /api/calendar/batch?tickers=A,B,C&days=14
 *
 * Watchlist-wide event calendar. Returns a flat chronological event list
 * (sorted by date asc) plus a per-ticker map for detail rendering.
 *
 * Cap: 25 tickers. Calendar fetchers are cached at DAY TTL so warm
 * responses are sub-second.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tickers = (url.searchParams.get('tickers') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);
  const horizonDays = Math.min(
    Math.max(parseInt(url.searchParams.get('days') || '14', 10), 1),
    90
  );

  if (tickers.length === 0) {
    return NextResponse.json({ events: [], by_ticker: {}, horizon_days: horizonDays });
  }

  const results = await Promise.allSettled(tickers.map((t) => buildCalendar(t, horizonDays)));

  const by_ticker: Record<string, { events: CalendarEvent[]; next_earnings: any } | { error: string }> = {};
  const flat: Array<CalendarEvent & { ticker: string; name?: string }> = [];

  results.forEach((r, i) => {
    const ticker = tickers[i] || 'unknown';
    if (r.status === 'fulfilled') {
      by_ticker[ticker] = { events: r.value.events, next_earnings: r.value.next_earnings };
      for (const e of r.value.events) {
        flat.push({ ...e, ticker });
      }
    } else {
      by_ticker[ticker] = { error: (r.reason as any)?.message || 'unknown' };
    }
  });

  flat.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    horizon_days: horizonDays,
    events: flat,
    by_ticker,
    counts: {
      total: flat.length,
      earnings: flat.filter((e) => e.kind === 'earnings_announce').length,
      guidance: flat.filter((e) => e.kind === 'earnings_guidance').length,
      dividends: flat.filter((e) => e.kind === 'dividend_ex_date').length,
      unlocks: flat.filter((e) => e.kind === 'share_unlock').length,
    },
  });
}
