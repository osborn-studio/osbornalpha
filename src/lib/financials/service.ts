import { classifyMarket } from '@/lib/utils';
import { financialProviderForMarket } from './registry';
import { unavailableFinancialReport } from './report';
import type { FinancialProvider, FinancialReport } from './types';

export async function loadFinancialReport(
  ticker: string,
  dependencies: { provider?: FinancialProvider | null } = {},
): Promise<FinancialReport> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const market = classifyMarket(normalizedTicker);
  const provider = dependencies.provider === undefined
    ? financialProviderForMarket(market)
    : dependencies.provider;
  if (!provider) {
    return unavailableFinancialReport({
      ticker: normalizedTicker,
      market,
      supported: false,
      warning: 'financials_market_unsupported',
    });
  }

  try {
    return await provider.load(normalizedTicker);
  } catch (error) {
    const reason = error instanceof Error && /^(sec_http_\d+|hk-financials-http_(?:http_\d+|invalid_response|timeout))$/.test(error.message)
      ? error.message
      : `${provider.id}_unavailable`;
    return unavailableFinancialReport({
      ticker: normalizedTicker,
      market,
      source: provider.id,
      supported: true,
      warning: reason,
    });
  }
}
