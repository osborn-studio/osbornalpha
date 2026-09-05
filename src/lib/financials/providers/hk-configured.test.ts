import { describe, expect, it, vi } from 'vitest';
import { loadConfiguredHkFinancialReport } from './hk-configured';
import type { FinancialReport } from '../types';

function report(): FinancialReport {
  return {
    source: 'licensed-hk-feed',
    ticker: '0700.HK',
    yearly: [],
    quarterly: [],
    ttm: null,
    latestIndicator: null,
    meta: {
      source: 'licensed-hk-feed', market: 'HK', supported: true, availability: 'unavailable',
      currency: 'HKD', unit: 'HKD_MILLION', unitScale: 1_000_000, reportingFrequency: 'annual',
      latestPeriodEnd: null, availablePeriods: 0, availableQuarterlyPeriods: 0,
      ttmAvailable: false, coverage: { income: 0, balance: 0, cashflow: 0, indicator: false }, warnings: [],
    },
  };
}

describe('configured HK financial provider', () => {
  it('returns an explicit unavailable report when no licensed endpoint is configured', async () => {
    await expect(loadConfiguredHkFinancialReport('0700.hk', { endpoint: null })).resolves.toMatchObject({
      ticker: '0700.HK', source: 'hk-financials-http',
      meta: { market: 'HK', supported: true, availability: 'unavailable', warnings: ['hk_financials_provider_unconfigured'] },
    });
  });

  it('loads a validated normalized report from the configured HTTPS adapter', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(report()), { status: 200 }));
    const result = await loadConfiguredHkFinancialReport('0700.hk', {
      endpoint: 'https://financials.example.test/v1/report', token: 'secret', fetch: request,
    });
    expect(result.source).toBe('licensed-hk-feed');
    expect(request).toHaveBeenCalledWith(
      new URL('https://financials.example.test/v1/report?ticker=0700.HK'),
      expect.objectContaining({ headers: { accept: 'application/json', authorization: 'Bearer secret' } }),
    );
  });

  it('rejects mismatched or malformed provider responses', async () => {
    const invalid = { ...report(), ticker: '0005.HK' };
    await expect(loadConfiguredHkFinancialReport('0700.HK', {
      endpoint: 'https://financials.example.test/v1/report',
      fetch: async () => new Response(JSON.stringify(invalid), { status: 200 }),
    })).rejects.toThrow('hk-financials-http_invalid_response');
  });
});
