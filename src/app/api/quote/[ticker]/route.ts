import { NextResponse } from 'next/server';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import { classifyMarket } from '@/lib/utils';
import {
  isTushareConfigured,
  fetchTushareDaily,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
} from '@/lib/data/sources/tushare-cached';
import { MOCK_UNIVERSE } from '@/lib/data/mock';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

interface Ctx { params: Promise<{ ticker: string }> }

function lookupName(ticker: string): string {
  return MOCK_UNIVERSE.find((u) => u.t === ticker)?.n || ticker;
}

/** One transient-failure retry with 200 ms backoff. */
async function withRetry<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    const first = await fn();
    if (first) return first;
  } catch { /* fall through */ }
  await new Promise((r) => setTimeout(r, 200));
  try {
    return await fn();
  } catch {
    return null;
  }
}

/**
 * Layered quote resolver for the headline (price / name / change_pct).
 * Sources come from the market-routed registry (quoteSourcesFor):
 *
 *   A / HK / US:  Eastmoney → Sina → Tencent → (A-share only) Tushare daily
 *   TW:           TWSE (mis, batched + 60 s cached)
 *   JP / KR:      EODHD when configured, else no source ("pending")
 *
 * Fundamentals (PE / PB / ROE / market_cap / dividend) still come from
 * Tushare basic + indicator for A-share — those don't have a free
 * equivalent of comparable quality, and the cached layer keeps cost
 * to one hit per ticker per day.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);
  const sources = quoteSourcesFor(classifyMarket(ticker));

  // ── Headline cascade (registry-routed) ──
  let headline: any = null;
  let headlineSource = 'none';
  for (const s of sources) {
    headline = await withRetry(() => s.fetch(ticker));
    if (headline) {
      headlineSource = s.name;
      break;
    }
  }

  // ── Tushare supplements (A-share only) ──
  let tushareDaily = null;
  let tushareBasic = null;
  let tushareInd = null;
  const supplemented: string[] = [];

  if (isAShare && isTushareConfigured()) {
    const [dailyArr, basic, ind] = await Promise.all([
      fetchTushareDaily(ticker, 1).catch(() => []),
      fetchTushareDailyBasic(ticker).catch(() => null),
      fetchTushareFinaIndicator(ticker).catch(() => null),
    ]);
    tushareDaily = dailyArr[0] || null;
    tushareBasic = basic;
    tushareInd = ind;
    if (tushareDaily) supplemented.push('daily');
    if (tushareBasic) supplemented.push('daily_basic');
    if (tushareInd) supplemented.push('fina_indicator');
  }

  // If all free sources failed and we have no Tushare data either, 404.
  if (!headline && !tushareBasic && !tushareDaily) {
    return NextResponse.json(
      {
        source: 'none',
        ticker,
        error: 'No data source returned a quote',
        tushare_configured: isTushareConfigured(),
        chain_tried: [...sources.map((s) => s.name), isAShare ? 'tushare' : null].filter(Boolean),
        // JP/KR with no configured source → let the frontend show "source pending"
        pending: sources.length === 0,
      },
      { status: 404 }
    );
  }

  // ── Final Tushare-headline synthesis (A-share only, if all 3 free sources failed) ──
  const tushareSynth =
    !headline && isAShare && (tushareDaily || tushareBasic)
      ? {
          name: lookupName(ticker),
          market: 'A' as const,
          currency: '¥',
          price: tushareDaily?.close ?? tushareBasic?.close ?? 0,
          change: tushareDaily?.change ?? 0,
          change_pct: tushareDaily?.pct_chg ?? 0,
          open: tushareDaily?.open ?? 0,
          high: tushareDaily?.high ?? 0,
          low: tushareDaily?.low ?? 0,
          prev_close: tushareDaily?.pre_close ?? 0,
          volume: tushareDaily?.vol ?? 0,
          amount: tushareDaily?.amount ?? 0,
          amplitude:
            tushareDaily && tushareDaily.pre_close > 0
              ? ((tushareDaily.high - tushareDaily.low) / tushareDaily.pre_close) * 100
              : 0,
          updated_at: tushareDaily?.trade_date
            ? `${tushareDaily.trade_date.slice(0, 4)}-${tushareDaily.trade_date.slice(4, 6)}-${tushareDaily.trade_date.slice(6, 8)}T15:00:00+08:00`
            : new Date().toISOString(),
          delayed: true,
        }
      : null;

  if (tushareSynth) headlineSource = 'tushare';

  // ── Merge — headline (free source or tushare-synth) + Tushare overlays ──
  const result = {
    source: tushareBasic && headlineSource !== 'tushare'
      ? `${headlineSource}+tushare`
      : headlineSource,
    ticker,
    ...(headline || tushareSynth),
    ...(tushareBasic && {
      pe_ttm: tushareBasic.pe_ttm ?? headline?.pe_ttm ?? null,
      pb: tushareBasic.pb ?? headline?.pb ?? null,
      turnover: tushareBasic.turnover_rate ?? headline?.turnover ?? null,
      dividend_yield: tushareBasic.dv_ratio ?? null,
      market_cap: tushareBasic.total_mv ? tushareBasic.total_mv * 10000 : headline?.market_cap ?? null,
    }),
    ...(tushareInd && {
      roe: tushareInd.roe ?? null,
      gross_margin: tushareInd.grossprofit_margin ?? null,
      net_margin: tushareInd.netprofit_margin ?? null,
    }),
    supplemented,
  };

  return NextResponse.json(result);
}
