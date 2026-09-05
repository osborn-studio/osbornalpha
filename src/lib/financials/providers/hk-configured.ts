import { isFinancialReport } from '@/lib/financials/contract';
import { unavailableFinancialReport } from '@/lib/financials/report';
import type { FinancialProvider, FinancialReport } from '@/lib/financials/types';

const PROVIDER_ID = 'hk-financials-http';
const TIMEOUT_MS = 8_000;

interface HkFinancialProviderDependencies {
  endpoint?: string | null;
  token?: string | null;
  fetch?: typeof fetch;
}

function configuredEndpoint(value: string | null | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function isHkFinancialProviderConfigured(): boolean {
  return configuredEndpoint(process.env.HK_FINANCIALS_API_URL) !== null;
}

export async function loadConfiguredHkFinancialReport(
  ticker: string,
  dependencies: HkFinancialProviderDependencies = {},
): Promise<FinancialReport> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const endpoint = configuredEndpoint(
    dependencies.endpoint === undefined ? process.env.HK_FINANCIALS_API_URL : dependencies.endpoint,
  );
  if (!endpoint) {
    return unavailableFinancialReport({
      ticker: normalizedTicker,
      market: 'HK',
      source: PROVIDER_ID,
      supported: true,
      warning: 'hk_financials_provider_unconfigured',
    });
  }

  endpoint.searchParams.set('ticker', normalizedTicker);
  const token = dependencies.token === undefined ? process.env.HK_FINANCIALS_API_TOKEN?.trim() : dependencies.token?.trim();
  const response = await (dependencies.fetch ?? fetch)(endpoint, {
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`${PROVIDER_ID}_http_${response.status}`);
  const report: unknown = await response.json();
  if (!isFinancialReport(report)
    || report.ticker.trim().toUpperCase() !== normalizedTicker
    || report.meta.market !== 'HK'
    || report.source !== report.meta.source) {
    throw new Error(`${PROVIDER_ID}_invalid_response`);
  }
  return report;
}

export const configuredHkFinancialProvider: FinancialProvider = {
  id: PROVIDER_ID,
  supports: (market) => market === 'HK',
  load: loadConfiguredHkFinancialReport,
};
