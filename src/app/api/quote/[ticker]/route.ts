import { NextResponse } from 'next/server';
import { fetchEastmoneyQuote } from '@/lib/data/sources/eastmoney';
import {
  isTushareConfigured,
  fetchTushareDailyBasic,
  fetchTushareFinaIndicator,
} from '@/lib/data/sources/tushare';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  // Primary: Eastmoney (works for A/H/US, no auth)
  let em = null;
  try {
    em = await fetchEastmoneyQuote(ticker);
  } catch (e: any) {
    console.error('Eastmoney quote error:', e?.message);
  }

  // Supplement: Tushare for A-share if token set
  let tushareBasic = null;
  let tushareInd = null;
  const isAShare = /\.(SH|SZ|BJ)$/i.test(ticker);
  const supplemented: string[] = [];

  if (isAShare && isTushareConfigured()) {
    try {
      tushareBasic = await fetchTushareDailyBasic(ticker);
      if (tushareBasic) supplemented.push('daily_basic');
    } catch (e: any) {
      console.error('Tushare daily_basic error:', e?.message);
    }
    try {
      tushareInd = await fetchTushareFinaIndicator(ticker);
      if (tushareInd) supplemented.push('fina_indicator');
    } catch (e: any) {
      console.error('Tushare fina_indicator error:', e?.message);
    }
  }

  if (!em && !tushareBasic) {
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

  // Merge: Eastmoney is base, Tushare overrides fundamentals when present
  const result = {
    source: em && tushareBasic ? 'eastmoney+tushare' : em ? 'eastmoney' : 'tushare',
    ticker,
    ...em,
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
