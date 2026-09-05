import { describe, expect, it, vi } from 'vitest';
import type { RadarPayload } from '@/lib/brief/radar';
import type { FinancialReport } from '@/lib/financials/types';
import { loadPerspectiveContext, summarizePerspectiveFinancials } from './perspective-context';

function radar(price: number | null = 200): RadarPayload {
  return {
    ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$', as_of: '2026-09-04T20:00:00.000Z',
    radar_level: 'white', level_label: 'Calm', score: 0, headline: 'No material event', triggers: [],
    markdown: '', disclaimer: '',
    sections: {
      price: {
        value: price, change_pct: 1.25, currency: '$', pe_ttm: 30, pb: 8,
        market_cap_label: '$3T', source: 'datagateway', updated_at: '2026-09-04T20:00:00.000Z',
      },
      flows: {
        available: false, north_top10_count_30d: 0, north_latest_rank: null,
        north_latest_date: null, north_latest_amount_yi: null, north_total_amount_30d_yi: null,
        limit_streak: 0, limit_30d_count: 0,
      },
      events: [{ date: '2026-09-03', title: 'Product event', url: null }],
      calendar: {
        next_earnings_days: 10, next_earnings_date: '20260914',
        upcoming: [{ kind: 'earnings_announce', date: '2026-09-14', days_until: 10, title: 'Earnings' }],
      },
      fundamentals: { roe: null, gross_margin: null, net_margin: null, dividend_yield: 0.5 },
    },
  };
}

function financials(): FinancialReport {
  return {
    source: 'sec-company-facts', ticker: 'AAPL',
    yearly: [{
      year: 2025, periodEnd: '2025-09-27', revenue: 416_161, totalRevenue: 416_161,
      netIncome: 112_010, epsBasic: 7.49, totalAssets: 359_241, totalLiabilities: 285_508,
      equity: 73_733, operatingCashflow: 111_482, freeCashflow: 98_767,
    }],
    quarterly: [],
    ttm: null,
    latestIndicator: { periodEnd: '2025-09-27', roe: 152, grossMargin: 46.2, netMargin: 26.9, currentRatio: 0.9 },
    meta: {
      source: 'sec-company-facts', market: 'US', supported: true, availability: 'available',
      currency: 'USD', unit: 'USD_MILLION', unitScale: 1_000_000, reportingFrequency: 'quarterly',
      latestPeriodEnd: '2025-09-27', availablePeriods: 1, availableQuarterlyPeriods: 0,
      ttmAvailable: false, coverage: { income: 1, balance: 1, cashflow: 1, indicator: true }, warnings: [],
    },
  };
}

function evidence() {
  return {
    requestId: 'evidence-1', status: 'complete' as const, provider: 'tavily', queryCount: 4,
    results: [], fetchedAt: '2026-09-04T20:00:00.000Z', durationMs: 50,
    estimatedCostMicrousd: 100, warnings: [],
  };
}

describe('perspective context', () => {
  it('combines shared radar, financial, and evidence services without market-specific routing', async () => {
    const searchEvidence = vi.fn().mockResolvedValue(evidence());
    const result = await loadPerspectiveContext('AAPL', {
      loadRadar: async () => radar(),
      loadFinancials: async () => financials(),
      searchEvidence,
    });

    expect(searchEvidence).toHaveBeenCalledWith(expect.objectContaining({
      ticker: 'AAPL', name: 'Apple', market: 'US', scopes: ['news', 'filing', 'industry', 'macro'],
    }));
    expect(result).toMatchObject({
      sources: ['datagateway', 'sec-company-facts', 'tavily'],
      financial: { source: 'sec-company-facts', availability: 'available', asOf: '2025-09-27' },
      context: {
        price: 200, pe_ttm: 30, roe: 152, gross_margin: 46.2, net_margin: 26.9,
        financial_source: 'sec-company-facts', financial_unit: 'USD_MILLION',
        events: ['2026-09-03: Product event', '2026-09-14: Earnings'],
      },
    });
    expect(result?.context.financial_summary).toContain('2025: revenue 416,161; net income 112,010');
  });

  it('preserves source units in the financial summary', () => {
    expect(summarizePerspectiveFinancials(financials())).toBe(
      '2025: revenue 416,161; net income 112,010; free cash flow 98,767',
    );
  });

  it('returns an explicit evidence error snapshot when search fails', async () => {
    const result = await loadPerspectiveContext('AAPL', {
      loadRadar: async () => radar(),
      loadFinancials: async () => financials(),
      searchEvidence: vi.fn().mockRejectedValue(new Error('offline')),
      now: () => new Date('2026-09-04T20:00:00.000Z'),
    });

    expect(result?.evidence).toMatchObject({
      status: 'error', provider: null, results: [], fetchedAt: '2026-09-04T20:00:00.000Z',
      warnings: ['evidence_search_failed'],
    });
  });

  it('does not call search when external evidence is explicitly disabled', async () => {
    const searchEvidence = vi.fn();
    const result = await loadPerspectiveContext('AAPL', {
      loadRadar: async () => radar(),
      loadFinancials: async () => financials(),
      searchEvidence,
      includeExternalEvidence: false,
      evidenceSkipWarning: 'external_evidence_not_requested',
      now: () => new Date('2026-09-04T20:00:00.000Z'),
    });

    expect(searchEvidence).not.toHaveBeenCalled();
    expect(result?.evidence).toMatchObject({
      requestId: 'not-requested', status: 'unavailable', results: [],
      warnings: ['external_evidence_not_requested'],
    });
    expect(result?.context.external_evidence).toEqual([]);
  });

  it('keeps market and evidence context when financial loading fails', async () => {
    const result = await loadPerspectiveContext('AAPL', {
      loadRadar: async () => radar(),
      loadFinancials: vi.fn().mockRejectedValue(new Error('financial provider offline')),
      searchEvidence: vi.fn().mockResolvedValue(evidence()),
    });

    expect(result).toMatchObject({
      context: { price: 200, financial_source: 'financial-service' },
      financial: {
        source: 'financial-service', availability: 'unavailable',
        warnings: ['financial_context_unavailable'],
      },
    });
  });

  it('degrades to financial and evidence context when live market price is unavailable', async () => {
    const loadFinancials = vi.fn(async () => financials());
    const searchEvidence = vi.fn(async () => evidence());
    await expect(loadPerspectiveContext('AAPL', {
      loadRadar: async () => radar(null), loadFinancials, searchEvidence,
    })).resolves.toMatchObject({
      context: { ticker: 'AAPL', price: null, financial_source: 'sec-company-facts' },
    });
    expect(loadFinancials).toHaveBeenCalledWith('AAPL');
    expect(searchEvidence).toHaveBeenCalled();
  });
});
