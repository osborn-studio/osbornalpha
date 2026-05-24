import { NextResponse } from 'next/server';
import { buildCalendar } from '@/lib/brief/calendar';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/calendar/[ticker]?days=14
 *
 * Forward-looking event calendar aggregating Tushare's 4 calendar endpoints
 * (disclosure_date + forecast + dividend + share_float). A-share only;
 * non-A-share returns an empty events array.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const url = new URL(req.url);
  const horizonDays = Math.min(
    Math.max(parseInt(url.searchParams.get('days') || '14', 10), 1),
    90
  );

  try {
    const payload = await buildCalendar(ticker, horizonDays);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'calendar build failed', ticker },
      { status: 502 }
    );
  }
}
