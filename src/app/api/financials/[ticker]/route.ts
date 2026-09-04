import { NextResponse } from 'next/server';
import {
  isTushareConfigured,
  fetchTushareIncome,
  fetchTushareBalance,
  fetchTushareCashflow,
  fetchTushareFinaIndicator,
} from '@/lib/data/sources/tushare-cached';
import { buildFinancialReport } from '@/lib/stocks/financials';
import { classifyMarket, currencyOfMarket } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;  // 1h cache

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const market = classifyMarket(ticker);

  if (!/\.(SH|SZ|BJ)$/i.test(ticker)) {
    return NextResponse.json(
      {
        source: 'unsupported',
        ticker,
        yearly: [],
        latest_indicator: null,
        error: 'Tushare financials only support A-share',
        meta: {
          source: 'unsupported',
          market,
          supported: false,
          currency: currencyOfMarket(market),
          unit: 'native',
          unitScale: 1,
          reportingFrequency: 'unsupported',
          latestPeriodEnd: null,
          availablePeriods: 0,
          coverage: { income: 0, balance: 0, cashflow: 0, indicator: false },
          warnings: ['financials_market_unsupported'],
        },
      },
      { status: 200 }
    );
  }

  if (!isTushareConfigured()) {
    return NextResponse.json(
      {
        source: 'no-token',
        ticker,
        yearly: [],
        latest_indicator: null,
        error: 'TUSHARE_TOKEN not configured',
        meta: {
          source: 'tushare',
          market: 'A',
          supported: true,
          currency: 'CNY',
          unit: 'CNY_100M',
          unitScale: 1e8,
          reportingFrequency: 'annual',
          latestPeriodEnd: null,
          availablePeriods: 0,
          coverage: { income: 0, balance: 0, cashflow: 0, indicator: false },
          warnings: ['tushare_token_missing'],
        },
      },
      { status: 200 }
    );
  }

  try {
    const results = await Promise.allSettled([
      fetchTushareIncome(ticker, 5),
      fetchTushareBalance(ticker, 5),
      fetchTushareCashflow(ticker, 5),
      fetchTushareFinaIndicator(ticker),
    ]);
    const income = results[0].status === 'fulfilled' ? results[0].value : [];
    const balance = results[1].status === 'fulfilled' ? results[1].value : [];
    const cashflow = results[2].status === 'fulfilled' ? results[2].value : [];
    const indicator = results[3].status === 'fulfilled' ? results[3].value : null;
    const warnings = results.flatMap((result, index) => result.status === 'rejected' ? [`${['income', 'balance', 'cashflow', 'indicator'][index]}_unavailable`] : []);
    const report = buildFinancialReport({ income, balance, cashflow, indicator, warnings });

    return NextResponse.json({
      source: 'tushare',
      ticker,
      yearly: report.yearly,
      latest_indicator: report.latestIndicator
        ? {
            end_date: report.latestIndicator.end_date,
            roe: report.latestIndicator.roe,
            gross_margin: report.latestIndicator.grossprofit_margin,
            net_margin: report.latestIndicator.netprofit_margin,
            current_ratio: report.latestIndicator.current_ratio,
          }
        : null,
      meta: report.meta,
    });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown' },
      { status: 502 }
    );
  }
}
