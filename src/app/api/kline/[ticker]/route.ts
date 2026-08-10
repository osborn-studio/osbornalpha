import { NextResponse } from 'next/server';
import { fetchEastmoneyKline } from '@/lib/data/sources/eastmoney';
import { fetchTwseKline } from '@/lib/data/sources/twse';
import {
  KLINE_RANGE_CONFIG,
  klineRangeAvailability,
  marketTimezone,
  parseKlineRange,
  toChartTimestamp,
  type KlineBar,
  type KlineMeta,
} from '@/lib/chart/kline';
import { classifyMarket } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const requestedRange = new URL(req.url).searchParams.get('range') ?? '3m';
  const range = parseKlineRange(requestedRange);
  if (!range) {
    return NextResponse.json({ error: 'invalid_range', message: 'range must be one of 1d, 1m, 3m, 1y' }, { status: 400 });
  }

  const unavailable = klineRangeAvailability(ticker, range);
  if (unavailable) {
    return NextResponse.json({ error: unavailable, ticker, range, bars: [] }, { status: 422 });
  }

  const market = classifyMarket(ticker);
  const config = KLINE_RANGE_CONFIG[range];
  try {
    const result = market === 'TW'
      ? await fetchTwseKline(ticker, 'D', config.limit)
      : await fetchEastmoneyKline(ticker, config.providerPeriod, config.limit);
    if (!result || result.bars.length === 0) {
      return NextResponse.json({ error: 'no_data', ticker, range, bars: [] }, { status: 404 });
    }

    const sourceBars = result.bars;
    const bars: KlineBar[] = sourceBars.map((bar) => ({ ...bar, time: toChartTimestamp(bar.time) })).filter((bar) => bar.time > 0);
    if (bars.length === 0) {
      return NextResponse.json({ error: 'invalid_data', ticker, range, bars: [] }, { status: 502 });
    }
    const now = new Date().toISOString();
    const meta: KlineMeta = {
      range,
      interval: config.interval,
      coverageStart: sourceBars[0].time,
      coverageEnd: sourceBars[sourceBars.length - 1].time,
      asOf: sourceBars[sourceBars.length - 1].time,
      timezone: marketTimezone(market),
      fetchedAt: now,
      delayed: true,
      cacheTtlSeconds: config.interval === 'minute' ? 60 : 300,
    };
    return NextResponse.json({ source: result.source, ticker, bars, meta }, {
      headers: { 'Cache-Control': `private, max-age=${meta.cacheTtlSeconds}` },
    });
  } catch {
    return NextResponse.json(
      { error: 'provider_error', ticker, range, bars: [] },
      { status: 502 }
    );
  }
}
