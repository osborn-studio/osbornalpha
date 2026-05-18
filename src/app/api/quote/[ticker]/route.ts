import { NextResponse } from 'next/server';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
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

export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  // Primary: Eastmoney (works for HK/US; A-share is blocked from Vercel egress)
  let em = null;
  try {
    em = await fetchEastmoneyQuote(ticker);
  } catch (e: any) {
    console.error('Eastmoney quote error:', e?.message);
  }

  // Supplement: Tushare for A-share if token set
  let tushareDaily = null;
  let tushareBasic = null;
  let tushareInd = null;
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);
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

  if (!em && !tushareBasic && !tushareDaily) {
    return NextResponse.json(
      {
        source: 'none',
        ticker,
        error: 'No data source returned a quote',
        tushare_configured: isTushareConfigured(),
      },
      { status: 404 }
    );
  }

  // When Eastmoney is unavailable for A-share, synthesize the headline
  // (price / name / change_pct) from Tushare daily + basic.
  const tushareSynth =
    !em && isAShare && (tushareDaily || tushareBasic)
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

  // Merge: Eastmoney base if present, else Tushare-synthesized; then overlay
  // fundamentals from Tushare basic + indicator.
  const result = {
    source: em && tushareBasic ? 'eastmoney+tushare' : em ? 'eastmoney' : 'tushare',
    ticker,
    ...(em || tushareSynth),
    ...(tushareBasic && {
      pe_ttm: tushareBasic.pe_ttm ?? em?.pe_ttm ?? null,
      pb: tushareBasic.pb ?? em?.pb ?? null,
      turnover: tushareBasic.turnover_rate ?? em?.turnover ?? null,
      dividend_yield: tushareBasic.dv_ratio ?? null,
      market_cap: tushareBasic.total_mv ? tushareBasic.total_mv * 10000 : em?.market_cap ?? null,
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
