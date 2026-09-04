import { reportAvailability, unavailableFinancialReport } from '@/lib/financials/report';
import type {
  FinancialAmounts,
  FinancialIndicator,
  FinancialProvider,
  FinancialQuarter,
  FinancialQuarterRow,
  FinancialReport,
  FinancialTtmRow,
  FinancialYearRow,
} from '@/lib/financials/types';

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_FACTS_BASE_URL = 'https://data.sec.gov/api/xbrl/companyfacts';
const SEC_USER_AGENT = process.env.SEC_USER_AGENT?.trim() || 'OsbornAlpha/1.0 support@osbornalpha.com';
const SEC_TIMEOUT_MS = 8_000;
const SEC_UNIT_SCALE = 1e6;

interface SecTickerRow {
  cik_str?: number;
  ticker?: string;
}

interface SecFactUnit {
  start?: string;
  end?: string;
  val?: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

interface SecFact {
  units?: Record<string, SecFactUnit[]>;
}

export interface SecCompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: { 'us-gaap'?: Record<string, SecFact> };
}

interface SelectedFact {
  end: string;
  value: number;
  fiscalYear: number;
  quarter?: FinancialQuarter;
  filed: string;
}

const CONCEPTS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  epsBasic: ['EarningsPerShareBasic'],
  totalAssets: ['Assets'],
  totalLiabilities: ['Liabilities'],
  equity: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity'],
  operatingCashflow: ['NetCashProvidedByUsedInOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  grossProfit: ['GrossProfit'],
  currentAssets: ['AssetsCurrent'],
  currentLiabilities: ['LiabilitiesCurrent'],
} as const;

const EMPTY_AMOUNTS: FinancialAmounts = {
  revenue: null,
  totalRevenue: null,
  netIncome: null,
  epsBasic: null,
  totalAssets: null,
  totalLiabilities: null,
  equity: null,
  operatingCashflow: null,
  freeCashflow: null,
};

function compactDate(value: string): string {
  return value.replaceAll('-', '');
}

function durationDays(entry: SecFactUnit): number | null {
  if (!entry.start || !entry.end) return null;
  const value = (Date.parse(entry.end) - Date.parse(entry.start)) / 86_400_000;
  return Number.isFinite(value) ? value : null;
}

function finiteEntry(entry: SecFactUnit): entry is SecFactUnit & { end: string; val: number } {
  return typeof entry.end === 'string' && typeof entry.val === 'number' && Number.isFinite(entry.val);
}

function latestByKey(entries: SelectedFact[], key: (entry: SelectedFact) => string): Map<string, SelectedFact> {
  const rows = new Map<string, SelectedFact>();
  for (const entry of entries) {
    const id = key(entry);
    const current = rows.get(id);
    if (!current || entry.filed > current.filed || (entry.filed === current.filed && entry.end > current.end)) {
      rows.set(id, entry);
    }
  }
  return rows;
}

function factEntries(facts: SecCompanyFacts, concepts: readonly string[], unit: 'USD' | 'USD/shares'): SecFactUnit[] {
  const gaap = facts.facts?.['us-gaap'] ?? {};
  for (const concept of concepts) {
    const entries = gaap[concept]?.units?.[unit];
    if (Array.isArray(entries) && entries.length > 0) return entries;
  }
  return [];
}

function annualFacts(entries: SecFactUnit[]): Map<string, SelectedFact> {
  const selected = entries.filter((entry) => {
    const duration = durationDays(entry);
    return finiteEntry(entry)
      && (entry.form === '10-K' || entry.form === '10-K/A')
      && entry.fp === 'FY'
      && (duration === null || (duration >= 250 && duration <= 450));
  }).map((entry) => ({
    end: compactDate(entry.end!),
    value: entry.val!,
    // Comparative facts inherit the filing's `fy`, not the fact period's fiscal
    // year. The annual period end remains the stable key across later filings.
    fiscalYear: Number(entry.end!.slice(0, 4)),
    filed: entry.filed ?? '',
  }));
  return latestByKey(selected, (entry) => entry.end);
}

function quarterFacts(entries: SecFactUnit[], instant = false): Map<string, SelectedFact> {
  const selected = entries.filter((entry) => {
    const duration = durationDays(entry);
    return finiteEntry(entry)
      && (entry.form === '10-Q' || entry.form === '10-Q/A')
      && ['Q1', 'Q2', 'Q3'].includes(entry.fp ?? '')
      && (instant ? duration === null : duration !== null && duration >= 60 && duration <= 130);
  }).map((entry) => ({
    end: compactDate(entry.end!),
    value: entry.val!,
    fiscalYear: Number.isInteger(entry.fy) ? entry.fy! : Number(entry.end!.slice(0, 4)),
    quarter: entry.fp as FinancialQuarter,
    filed: entry.filed ?? '',
  }));
  return latestByKey(selected, (entry) => `${entry.fiscalYear}:${entry.quarter}`);
}

function cumulativeQuarterFacts(entries: SecFactUnit[]): Map<string, SelectedFact> {
  const selected = entries.filter((entry) => {
    const duration = durationDays(entry);
    const expectedRange = entry.fp === 'Q1' ? [60, 130]
      : entry.fp === 'Q2' ? [130, 230]
        : entry.fp === 'Q3' ? [220, 330]
          : null;
    return finiteEntry(entry)
      && (entry.form === '10-Q' || entry.form === '10-Q/A')
      && expectedRange !== null
      && duration !== null && duration >= expectedRange[0] && duration <= expectedRange[1];
  }).map((entry) => ({
    end: compactDate(entry.end!),
    value: entry.val!,
    fiscalYear: Number.isInteger(entry.fy) ? entry.fy! : Number(entry.end!.slice(0, 4)),
    quarter: entry.fp as FinancialQuarter,
    filed: entry.filed ?? '',
  }));
  return latestByKey(selected, (entry) => `${entry.fiscalYear}:${entry.quarter}`);
}

function discreteFlowQuarterFacts(entries: SecFactUnit[]): Map<string, SelectedFact> {
  const direct = quarterFacts(entries);
  const cumulative = cumulativeQuarterFacts(entries);
  for (const entry of cumulative.values()) {
    const key = `${entry.fiscalYear}:${entry.quarter}`;
    if (direct.has(key)) continue;
    const previousQuarter = entry.quarter === 'Q2' ? 'Q1' : entry.quarter === 'Q3' ? 'Q2' : null;
    const previous = previousQuarter ? cumulative.get(`${entry.fiscalYear}:${previousQuarter}`) : null;
    if (previousQuarter && !previous) continue;
    direct.set(key, { ...entry, value: entry.value - (previous?.value ?? 0) });
  }
  return direct;
}

function scaled(value: number | null | undefined, unitScale = SEC_UNIT_SCALE): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / unitScale : null;
}

function valueAt(rows: Map<string, SelectedFact>, key: string): number | null {
  return rows.get(key)?.value ?? null;
}

function subtract(left: number | null, right: number | null): number | null {
  return left == null || right == null ? null : left - right;
}

function sum(values: Array<number | null>): number | null {
  return values.every((value) => value != null)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null;
}

function ratio(numerator: number | null, denominator: number | null, percentage = false): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * (percentage ? 100 : 1);
}

function q4Value(annual: number | null, quarters: Array<number | null>): number | null {
  const interim = sum(quarters);
  return annual == null || interim == null ? null : annual - interim;
}

function latestIndicator(yearly: FinancialYearRow[], grossProfit: Map<string, SelectedFact>, currentAssets: Map<string, SelectedFact>, currentLiabilities: Map<string, SelectedFact>): FinancialIndicator | null {
  const row = yearly.at(-1);
  if (!row) return null;
  const gross = scaled(valueAt(grossProfit, row.periodEnd));
  const assets = scaled(valueAt(currentAssets, row.periodEnd));
  const liabilities = scaled(valueAt(currentLiabilities, row.periodEnd));
  return {
    periodEnd: row.periodEnd,
    roe: ratio(row.netIncome, row.equity, true),
    grossMargin: ratio(gross, row.revenue, true),
    netMargin: ratio(row.netIncome, row.revenue, true),
    currentRatio: ratio(assets, liabilities),
  };
}

export function buildSecFinancialReport(ticker: string, facts: SecCompanyFacts): FinancialReport {
  const annual = {
    revenue: annualFacts(factEntries(facts, CONCEPTS.revenue, 'USD')),
    netIncome: annualFacts(factEntries(facts, CONCEPTS.netIncome, 'USD')),
    epsBasic: annualFacts(factEntries(facts, CONCEPTS.epsBasic, 'USD/shares')),
    totalAssets: annualFacts(factEntries(facts, CONCEPTS.totalAssets, 'USD')),
    totalLiabilities: annualFacts(factEntries(facts, CONCEPTS.totalLiabilities, 'USD')),
    equity: annualFacts(factEntries(facts, CONCEPTS.equity, 'USD')),
    operatingCashflow: annualFacts(factEntries(facts, CONCEPTS.operatingCashflow, 'USD')),
    capex: annualFacts(factEntries(facts, CONCEPTS.capex, 'USD')),
  };
  const quarter = {
    revenue: quarterFacts(factEntries(facts, CONCEPTS.revenue, 'USD')),
    netIncome: quarterFacts(factEntries(facts, CONCEPTS.netIncome, 'USD')),
    epsBasic: quarterFacts(factEntries(facts, CONCEPTS.epsBasic, 'USD/shares')),
    totalAssets: quarterFacts(factEntries(facts, CONCEPTS.totalAssets, 'USD'), true),
    totalLiabilities: quarterFacts(factEntries(facts, CONCEPTS.totalLiabilities, 'USD'), true),
    equity: quarterFacts(factEntries(facts, CONCEPTS.equity, 'USD'), true),
    operatingCashflow: discreteFlowQuarterFacts(factEntries(facts, CONCEPTS.operatingCashflow, 'USD')),
    capex: discreteFlowQuarterFacts(factEntries(facts, CONCEPTS.capex, 'USD')),
  };
  const annualKeys = [...new Set(Object.values(annual).flatMap((rows) => [...rows.keys()]))].sort();
  const yearly = annualKeys.map((periodEnd): FinancialYearRow => {
    const operatingCashflow = scaled(valueAt(annual.operatingCashflow, periodEnd));
    const capex = scaled(valueAt(annual.capex, periodEnd));
    return {
      ...EMPTY_AMOUNTS,
      year: Number(periodEnd.slice(0, 4)),
      periodEnd,
      revenue: scaled(valueAt(annual.revenue, periodEnd)),
      totalRevenue: scaled(valueAt(annual.revenue, periodEnd)),
      netIncome: scaled(valueAt(annual.netIncome, periodEnd)),
      epsBasic: scaled(valueAt(annual.epsBasic, periodEnd), 1),
      totalAssets: scaled(valueAt(annual.totalAssets, periodEnd)),
      totalLiabilities: scaled(valueAt(annual.totalLiabilities, periodEnd)),
      equity: scaled(valueAt(annual.equity, periodEnd)),
      operatingCashflow,
      freeCashflow: subtract(operatingCashflow, capex),
    };
  }).slice(-6);

  const quarterIndex = new Map<string, SelectedFact>();
  Object.values(quarter).forEach((rows) => rows.forEach((entry, key) => {
    const current = quarterIndex.get(key);
    if (!current || entry.end > current.end) quarterIndex.set(key, entry);
  }));
  const quarterly = [...quarterIndex.entries()].map(([key, entry]): FinancialQuarterRow => {
    const operatingCashflow = scaled(valueAt(quarter.operatingCashflow, key));
    const capex = scaled(valueAt(quarter.capex, key));
    return {
      ...EMPTY_AMOUNTS,
      fiscalYear: entry.fiscalYear,
      quarter: entry.quarter!,
      periodEnd: entry.end,
      revenue: scaled(valueAt(quarter.revenue, key)),
      totalRevenue: scaled(valueAt(quarter.revenue, key)),
      netIncome: scaled(valueAt(quarter.netIncome, key)),
      epsBasic: scaled(valueAt(quarter.epsBasic, key), 1),
      totalAssets: scaled(valueAt(quarter.totalAssets, key)),
      totalLiabilities: scaled(valueAt(quarter.totalLiabilities, key)),
      equity: scaled(valueAt(quarter.equity, key)),
      operatingCashflow,
      freeCashflow: subtract(operatingCashflow, capex),
    };
  });

  for (const yearRow of yearly) {
    const annualEntry = annual.revenue.get(yearRow.periodEnd)
      ?? annual.netIncome.get(yearRow.periodEnd)
      ?? annual.operatingCashflow.get(yearRow.periodEnd);
    if (!annualEntry || quarterly.some((row) => row.fiscalYear === annualEntry.fiscalYear && row.quarter === 'Q4')) continue;
    const firstThree = (['Q1', 'Q2', 'Q3'] as const).map((value) => quarterly.find((row) => row.fiscalYear === annualEntry.fiscalYear && row.quarter === value));
    if (firstThree.some((row) => !row)) continue;
    quarterly.push({
      ...EMPTY_AMOUNTS,
      fiscalYear: annualEntry.fiscalYear,
      quarter: 'Q4',
      periodEnd: yearRow.periodEnd,
      revenue: q4Value(yearRow.revenue, firstThree.map((row) => row!.revenue)),
      totalRevenue: q4Value(yearRow.totalRevenue, firstThree.map((row) => row!.totalRevenue)),
      netIncome: q4Value(yearRow.netIncome, firstThree.map((row) => row!.netIncome)),
      epsBasic: q4Value(yearRow.epsBasic, firstThree.map((row) => row!.epsBasic)),
      totalAssets: yearRow.totalAssets,
      totalLiabilities: yearRow.totalLiabilities,
      equity: yearRow.equity,
      operatingCashflow: q4Value(yearRow.operatingCashflow, firstThree.map((row) => row!.operatingCashflow)),
      freeCashflow: q4Value(yearRow.freeCashflow, firstThree.map((row) => row!.freeCashflow)),
    });
  }
  quarterly.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));

  const latestFour = quarterly.slice(-4);
  const consecutive = latestFour.length === 4 && latestFour.every((row, index) => index === 0
    || row.fiscalYear * 4 + Number(row.quarter.slice(1))
      === latestFour[index - 1].fiscalYear * 4 + Number(latestFour[index - 1].quarter.slice(1)) + 1);
  const ttm: FinancialTtmRow | null = consecutive ? {
    periodEnd: latestFour.at(-1)!.periodEnd,
    revenue: sum(latestFour.map((row) => row.revenue)),
    totalRevenue: sum(latestFour.map((row) => row.totalRevenue)),
    netIncome: sum(latestFour.map((row) => row.netIncome)),
    epsBasic: sum(latestFour.map((row) => row.epsBasic)),
    operatingCashflow: sum(latestFour.map((row) => row.operatingCashflow)),
    freeCashflow: sum(latestFour.map((row) => row.freeCashflow)),
    quarterCount: 4,
  } : null;
  const warnings = [
    ...(yearly.length === 0 ? ['sec_annual_facts_unavailable'] : []),
    ...(quarterly.length === 0 ? ['sec_quarterly_facts_unavailable'] : []),
    ...(!ttm ? ['sec_ttm_unavailable'] : []),
  ];
  const grossProfit = annualFacts(factEntries(facts, CONCEPTS.grossProfit, 'USD'));
  const currentAssets = annualFacts(factEntries(facts, CONCEPTS.currentAssets, 'USD'));
  const currentLiabilities = annualFacts(factEntries(facts, CONCEPTS.currentLiabilities, 'USD'));
  const indicator = latestIndicator(yearly, grossProfit, currentAssets, currentLiabilities);
  const report: FinancialReport = {
    source: 'sec-companyfacts',
    ticker,
    yearly,
    quarterly: quarterly.slice(-12),
    ttm,
    latestIndicator: indicator,
    meta: {
      source: 'sec-companyfacts',
      market: 'US',
      supported: true,
      availability: 'available',
      currency: 'USD',
      unit: 'USD_MILLION',
      unitScale: SEC_UNIT_SCALE,
      reportingFrequency: 'quarterly',
      latestPeriodEnd: quarterly.at(-1)?.periodEnd ?? yearly.at(-1)?.periodEnd ?? null,
      availablePeriods: yearly.length,
      availableQuarterlyPeriods: quarterly.length,
      ttmAvailable: ttm != null,
      coverage: {
        income: Math.max(annual.revenue.size, annual.netIncome.size),
        balance: Math.max(annual.totalAssets.size, annual.totalLiabilities.size, annual.equity.size),
        cashflow: annual.operatingCashflow.size,
        indicator: indicator != null,
      },
      warnings,
    },
  };
  report.meta.availability = reportAvailability(report);
  return report;
}

async function secJson<T>(url: string, revalidate: number): Promise<T> {
  const init: RequestInit & { next: { revalidate: number } } = {
    headers: { Accept: 'application/json', 'User-Agent': SEC_USER_AGENT },
    signal: AbortSignal.timeout(SEC_TIMEOUT_MS),
    next: { revalidate },
  };
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`sec_http_${response.status}`);
  return response.json() as Promise<T>;
}

function normalizeSecTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replaceAll('.', '-');
}

async function resolveCik(ticker: string): Promise<string | null> {
  const rows = await secJson<Record<string, SecTickerRow>>(SEC_TICKERS_URL, 86_400);
  const normalized = normalizeSecTicker(ticker);
  const match = Object.values(rows).find((row) => row.ticker?.toUpperCase() === normalized);
  return Number.isInteger(match?.cik_str) ? String(match!.cik_str).padStart(10, '0') : null;
}

export const secCompanyFactsProvider: FinancialProvider = {
  id: 'sec-companyfacts',
  supports: (market) => market === 'US',
  async load(ticker) {
    const cik = await resolveCik(ticker);
    if (!cik) {
      return unavailableFinancialReport({
        ticker,
        market: 'US',
        source: 'sec-companyfacts',
        supported: true,
        warning: 'sec_cik_unavailable',
      });
    }
    const facts = await secJson<SecCompanyFacts>(`${SEC_FACTS_BASE_URL}/CIK${cik}.json`, 21_600);
    return buildSecFinancialReport(ticker, facts);
  },
};
