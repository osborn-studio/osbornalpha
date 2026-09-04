import {
  fetchTushareBalancePeriods,
  fetchTushareCashflowPeriods,
  fetchTushareFinaIndicator,
  fetchTushareIncomePeriods,
  isTushareConfigured,
} from '@/lib/data/sources/tushare-cached';
import { unavailableFinancialReport } from '@/lib/financials/report';
import type { FinancialProvider } from '@/lib/financials/types';
import { buildFinancialReport } from '@/lib/stocks/financials';

export const tushareFinancialProvider: FinancialProvider = {
  id: 'tushare',
  supports: (market) => market === 'A',
  async load(ticker) {
    if (!isTushareConfigured()) {
      return unavailableFinancialReport({
        ticker,
        market: 'A',
        source: 'tushare',
        supported: true,
        warning: 'tushare_token_missing',
      });
    }

    const results = await Promise.allSettled([
      fetchTushareIncomePeriods(ticker, 20),
      fetchTushareBalancePeriods(ticker, 20),
      fetchTushareCashflowPeriods(ticker, 20),
      fetchTushareFinaIndicator(ticker),
    ]);
    const report = buildFinancialReport({
      ticker,
      income: results[0].status === 'fulfilled' ? results[0].value : [],
      balance: results[1].status === 'fulfilled' ? results[1].value : [],
      cashflow: results[2].status === 'fulfilled' ? results[2].value : [],
      indicator: results[3].status === 'fulfilled' ? results[3].value : null,
      warnings: results.flatMap((result, index) => result.status === 'rejected'
        ? [`${['income', 'balance', 'cashflow', 'indicator'][index]}_unavailable`]
        : []),
    });
    return report;
  },
};
