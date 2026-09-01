import { NextResponse } from 'next/server';
import { KlineResolutionError, resolveKline } from '@/lib/data/kline/reliability';
import {
  KLINE_RANGE_CONFIG,
  KLINE_RANGES,
  inferKlinePricePrecision,
  klineBarLimit,
  klineRangeAvailability,
  marketTimezone,
  parseKlineAdjustment,
  parseKlineRange,
  toChartTimestamp,
  type KlineBar,
  type KlineMeta,
} from '@/lib/chart/kline';
import { classifyMarket, currencyCodeOfMarket, currencyOfMarket } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const url = new URL(req.url);
  const requestedRange = url.searchParams.get('range') ?? '1d';
  const range = parseKlineRange(requestedRange);
  if (!range) {
    return NextResponse.json({ error: 'invalid_range', message: `range must be one of ${KLINE_RANGES.join(', ')}` }, { status: 400 });
  }
  const adjustParam = url.searchParams.get('adjust');
  const adjustment = parseKlineAdjustment(adjustParam) ?? undefined;
  if (adjustParam !== null && !adjustment) {
    return NextResponse.json({ error: 'invalid_adjustment', message: 'adjust must be one of qfq, hfq, none' }, { status: 400 });
  }

  const unavailable = klineRangeAvailability(ticker, range);
  if (unavailable) {
    return NextResponse.json({ error: unavailable, ticker, range, bars: [] }, { status: 422 });
  }

  const market = classifyMarket(ticker);
  const config = KLINE_RANGE_CONFIG[range];
  try {
    const result = await resolveKline({ ticker, range, adjustment });

    const sourceBars = result.bars;
    let previousClose = result.previousClose;
    const bars: KlineBar[] = sourceBars.map((bar) => {
      const change = previousClose === null ? null : bar.close - previousClose;
      const changePct = previousClose && previousClose > 0 ? ((bar.close - previousClose) / previousClose) * 100 : null;
      const normalized = {
        ...bar,
        time: toChartTimestamp(bar.time),
        previousClose,
        change,
        changePct,
      };
      previousClose = bar.close;
      return normalized;
    }).filter((bar) => bar.time > 0);
    if (result.availableBars === 0) {
      return NextResponse.json({ error: 'invalid_data', ticker, range, bars: [] }, { status: 502 });
    }
    // An empty window is a valid answer: the security simply has no bars
    // inside the selected calendar range (e.g. a long suspension). Surface it
    // as a successful empty series so the chart can say so.
    const requestedBars = klineBarLimit(ticker, range, new Date(result.fetchedAt));
    const pricePrecision = inferKlinePricePrecision(bars);
    const coverageEdge = bars.length > 0
      ? { coverageStart: sourceBars[0].time, coverageEnd: sourceBars[sourceBars.length - 1].time, asOf: sourceBars[sourceBars.length - 1].time }
      : { coverageStart: result.asOfFallback, coverageEnd: result.asOfFallback, asOf: result.asOfFallback };
    const meta: KlineMeta = {
      market,
      range,
      interval: config.interval,
      granularity: config.granularity,
      source: result.source,
      adjustment: result.adjustment,
      ...coverageEdge,
      timezone: marketTimezone(market),
      fetchedAt: result.fetchedAt,
      delayed: result.freshness === 'stale',
      currency: currencyOfMarket(market),
      currencyCode: currencyCodeOfMarket(market),
      pricePrecision,
      minMove: 10 ** -pricePrecision,
      volumeUnit: result.volumeUnit,
      rangeBasis: config.interval === 'minute' ? 'trading-sessions' : 'calendar-window',
      requestedBars,
      returnedBars: bars.length,
      availableBars: result.availableBars,
      // For an untruncated "All" series the cap-based requestedBars would
      // fabricate missing months; a truncated series keeps the lower bound.
      missingBars: range === 'all' && result.completeness === 'complete'
        ? 0
        : Math.max(0, requestedBars - result.availableBars),
      ...(result.warmupCloses.length > 0 ? { maWarmupCloses: result.warmupCloses } : {}),
      cacheTtlSeconds: config.interval === 'minute' ? 60 : 300,
      freshness: result.freshness,
      fallbackUsed: result.fallbackUsed,
      cacheStatus: result.cacheStatus,
      completeness: result.completeness,
      partial: result.partial,
      warnings: result.warnings,
      ...(result.cacheAgeSeconds === undefined ? {} : { cacheAgeSeconds: result.cacheAgeSeconds }),
      ...(result.staleAgeSeconds === undefined ? {} : { staleAgeSeconds: result.staleAgeSeconds }),
    };
    return NextResponse.json({ source: result.source, ticker, bars, meta }, {
      headers: { 'Cache-Control': `private, max-age=${meta.cacheTtlSeconds}` },
    });
  } catch (error: unknown) {
    if (error instanceof KlineResolutionError) {
      return NextResponse.json(
        { error: error.code, ticker, range, bars: [] },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: 'provider_unavailable', ticker, range, bars: [] },
      { status: 503 },
    );
  }
}
