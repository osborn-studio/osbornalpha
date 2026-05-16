import { NextResponse } from 'next/server';
import {
  isTushareConfigured,
  fetchTushareIncome,
  fetchTushareBalance,
  fetchTushareCashflow,
  fetchTushareFinaIndicator,
} from '@/lib/data/sources/tushare';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;  // 1h cache

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  if (!/\.(SH|SZ|BJ)$/i.test(ticker)) {
    return NextResponse.json(
      { source: 'unsupported', ticker, error: 'Tushare financials only support A-share' },
      { status: 200 }
    );
  }

  if (!isTushareConfigured()) {
    return NextResponse.json(
      { source: 'no-token', ticker, error: 'TUSHARE_TOKEN not configured' },
      { status: 200 }
    );
  }

  try {
    const [income, balance, cashflow, indicator] = await Promise.all([
      fetchTushareIncome(ticker, 5).catch(() => []),
      fetchTushareBalance(ticker, 5).catch(() => []),
      fetchTushareCashflow(ticker, 5).catch(() => []),
      fetchTushareFinaIndicator(ticker).catch(() => null),
    ]);

    // Build 5-year summary table (most recent first)
    const years = Array.from(new Set([
      ...income.map((r) => r.end_date.slice(0, 4)),
      ...balance.map((r) => r.end_date.slice(0, 4)),
    ])).sort();

    const byYear = (rows: any[]) =>
      Object.fromEntries(rows.map((r) => [r.end_date.slice(0, 4), r]));

    const incomeByYear = byYear(income);
    const balanceByYear = byYear(balance);
    const cashflowByYear = byYear(cashflow);

    const yearly = years.map((y) => {
      const i = incomeByYear[y] || {};
      const b = balanceByYear[y] || {};
      const c = cashflowByYear[y] || {};
      // Numbers from Tushare are in 元. Convert to 亿 for display.
      const yi = (n?: number) => (n != null ? n / 1e8 : null);
      return {
        year: parseInt(y, 10),
        revenue_yi:        yi(i.revenue),
        total_revenue_yi:  yi(i.total_revenue),
        net_income_yi:     yi(i.n_income),
        eps_basic:         i.basic_eps ?? null,
        total_assets_yi:   yi(b.total_assets),
        total_liab_yi:     yi(b.total_liab),
        equity_yi:         yi(b.total_hldr_eqy_inc_min_int),
        op_cashflow_yi:    yi(c.n_cashflow_act),
        free_cashflow_yi:  yi(c.free_cashflow),
      };
    });

    return NextResponse.json({
      source: 'tushare',
      ticker,
      yearly,
      latest_indicator: indicator
        ? {
            end_date: indicator.end_date,
            roe: indicator.roe,
            gross_margin: indicator.grossprofit_margin,
            net_margin: indicator.netprofit_margin,
            current_ratio: indicator.current_ratio,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { source: 'error', ticker, error: e?.message || 'unknown' },
      { status: 502 }
    );
  }
}
