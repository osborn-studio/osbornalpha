import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSecFinancialReport, secCompanyFactsProvider, type SecCompanyFacts } from './sec-company-facts';

afterEach(() => vi.unstubAllGlobals());

function annual(val: number, unit = 'USD') {
  return { units: { [unit]: [
    { start: '2024-01-01', end: '2024-12-31', val, fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' },
    { start: '2024-01-01', end: '2024-12-31', val, fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' },
  ] } };
}

function quarters(values: number[], unit = 'USD') {
  const periods = [
    ['2024-01-01', '2024-03-31', 'Q1'],
    ['2024-04-01', '2024-06-30', 'Q2'],
    ['2024-07-01', '2024-09-30', 'Q3'],
  ];
  return { units: { [unit]: periods.map(([start, end, fp], index) => ({ start, end, fp, val: values[index], fy: 2024, form: '10-Q', filed: `${end.slice(0, 4)}-${end.slice(5, 7)}-15` })) } };
}

function cumulativeQuarters(values: number[], unit = 'USD') {
  const periods = [
    ['2024-01-01', '2024-03-31', 'Q1'],
    ['2024-01-01', '2024-06-30', 'Q2'],
    ['2024-01-01', '2024-09-30', 'Q3'],
  ];
  return { units: { [unit]: periods.map(([start, end, fp], index) => ({ start, end, fp, val: values[index], fy: 2024, form: '10-Q', filed: `${end.slice(0, 4)}-${end.slice(5, 7)}-15` })) } };
}

function facts(): SecCompanyFacts {
  const merge = (annualFact: ReturnType<typeof annual>, quarterFact: ReturnType<typeof quarters>, unit = 'USD') => ({
    units: { [unit]: [...annualFact.units[unit], ...quarterFact.units[unit]] },
  });
  return {
    entityName: 'Example Corp',
    facts: { 'us-gaap': {
      Revenues: merge(annual(400e6), quarters([80e6, 90e6, 100e6])),
      NetIncomeLoss: merge(annual(40e6), quarters([8e6, 9e6, 10e6])),
      EarningsPerShareBasic: merge(annual(4, 'USD/shares'), quarters([0.8, 0.9, 1], 'USD/shares'), 'USD/shares'),
      Assets: { units: { USD: [
        { end: '2024-12-31', val: 900e6, fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-01' },
        { end: '2024-03-31', val: 800e6, fy: 2024, fp: 'Q1', form: '10-Q', filed: '2024-04-15' },
        { end: '2024-06-30', val: 830e6, fy: 2024, fp: 'Q2', form: '10-Q', filed: '2024-07-15' },
        { end: '2024-09-30', val: 860e6, fy: 2024, fp: 'Q3', form: '10-Q', filed: '2024-10-15' },
      ] } },
      Liabilities: annual(300e6),
      StockholdersEquity: annual(600e6),
      NetCashProvidedByUsedInOperatingActivities: merge(annual(60e6), cumulativeQuarters([10e6, 25e6, 42e6])),
      PaymentsToAcquirePropertyPlantAndEquipment: merge(annual(20e6), cumulativeQuarters([3e6, 7e6, 12e6])),
      GrossProfit: annual(160e6),
      AssetsCurrent: annual(300e6),
      LiabilitiesCurrent: annual(150e6),
    } },
  };
}

describe('SEC Company Facts financial provider', () => {
  it('normalizes USD values, derives Q4 and publishes TTM totals', () => {
    const report = buildSecFinancialReport('AAPL', facts());
    expect(report.yearly).toEqual([expect.objectContaining({
      year: 2024, periodEnd: '20241231', revenue: 400, netIncome: 40,
      totalAssets: 900, operatingCashflow: 60, freeCashflow: 40,
    })]);
    expect(report.quarterly.map((row) => [row.quarter, row.revenue])).toEqual([
      ['Q1', 80], ['Q2', 90], ['Q3', 100], ['Q4', 130],
    ]);
    expect(report.quarterly.map((row) => [row.quarter, row.operatingCashflow])).toEqual([
      ['Q1', 10], ['Q2', 15], ['Q3', 17], ['Q4', 18],
    ]);
    expect(report.ttm).toMatchObject({ revenue: 400, netIncome: 40, freeCashflow: 40, quarterCount: 4 });
    expect(report.latestIndicator).toMatchObject({ roe: 40 / 600 * 100, grossMargin: 40, netMargin: 10, currentRatio: 2 });
    expect(report.meta).toMatchObject({
      source: 'sec-companyfacts', market: 'US', supported: true, availability: 'available',
      unit: 'USD_MILLION', unitScale: 1e6, availablePeriods: 1, availableQuarterlyPeriods: 4, ttmAvailable: true,
    });
  });

  it('keeps missing concepts null and reports partial coverage', () => {
    const report = buildSecFinancialReport('EMPTY', { facts: { 'us-gaap': {} } });
    expect(report.yearly).toEqual([]);
    expect(report.quarterly).toEqual([]);
    expect(report.ttm).toBeNull();
    expect(report.meta.availability).toBe('unavailable');
    expect(report.meta.warnings).toEqual(expect.arrayContaining(['sec_annual_facts_unavailable', 'sec_quarterly_facts_unavailable', 'sec_ttm_unavailable']));
  });

  it('resolves ticker to a padded CIK and identifies itself to SEC', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ 0: { cik_str: 320193, ticker: 'AAPL' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify(facts())));
    vi.stubGlobal('fetch', fetcher);

    const report = await secCompanyFactsProvider.load('aapl');

    expect(report.meta.source).toBe('sec-companyfacts');
    expect(String(fetcher.mock.calls[1][0])).toBe('https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json');
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ Accept: 'application/json' });
    expect(fetcher.mock.calls[0][1].headers['User-Agent']).toContain('@');
  });

  it('propagates caller cancellation into the SEC request', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();

    const pending = secCompanyFactsProvider.load('AAPL', controller.signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
