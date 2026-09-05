import { buildRadar, type RadarPayload } from '@/lib/brief/radar';
import { searchExternalEvidence, searchExternalEvidenceUncached } from '@/lib/external-evidence';
import type { EvidenceSearchSnapshot } from '@/lib/external-evidence/types';
import { loadFinancialReport } from '@/lib/financials/service';
import { unavailableFinancialReport } from '@/lib/financials/report';
import type { FinancialReport, FinancialYearRow } from '@/lib/financials/types';
import type { StockContext } from '@/lib/data/personas';
import { classifyMarket, currencyOfMarket } from '@/lib/utils';

export interface PerspectiveContextBundle {
  context: StockContext;
  evidence: EvidenceSearchSnapshot;
  sources: string[];
  financial: {
    source: string;
    availability: FinancialReport['meta']['availability'];
    asOf: string | null;
    warnings: string[];
  };
}

interface PerspectiveContextDependencies {
  loadRadar?: (ticker: string) => Promise<RadarPayload>;
  loadFinancials?: (ticker: string) => Promise<FinancialReport>;
  searchEvidence?: typeof searchExternalEvidence;
  now?: () => Date;
  includeExternalEvidence?: boolean;
  evidenceSkipWarning?: string;
  signal?: AbortSignal;
}

function displayNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function financialRow(row: FinancialYearRow): string | null {
  const revenue = row.revenue ?? row.totalRevenue;
  if (revenue == null && row.netIncome == null) return null;
  const values = [
    ...(revenue == null ? [] : [`revenue ${displayNumber(revenue)}`]),
    ...(row.netIncome == null ? [] : [`net income ${displayNumber(row.netIncome)}`]),
    ...(row.freeCashflow == null ? [] : [`free cash flow ${displayNumber(row.freeCashflow)}`]),
  ];
  return `${row.year}: ${values.join('; ')}`;
}

export function summarizePerspectiveFinancials(report: FinancialReport): string | undefined {
  const annual = [...report.yearly]
    .sort((left, right) => left.year - right.year)
    .slice(-5)
    .map(financialRow)
    .filter((row): row is string => row !== null);
  const ttm = report.ttm && (report.ttm.revenue ?? report.ttm.totalRevenue) != null
    ? `TTM ${report.ttm.periodEnd}: revenue ${displayNumber((report.ttm.revenue ?? report.ttm.totalRevenue)!)}${report.ttm.netIncome == null ? '' : `; net income ${displayNumber(report.ttm.netIncome)}`}${report.ttm.freeCashflow == null ? '' : `; free cash flow ${displayNumber(report.ttm.freeCashflow)}`}`
    : null;
  const rows = [...annual, ...(ttm ? [ttm] : [])];
  return rows.length > 0 ? rows.join(' | ') : undefined;
}

function unavailableEvidence(now: Date): EvidenceSearchSnapshot {
  return {
    requestId: crypto.randomUUID(),
    status: 'error',
    provider: null,
    queryCount: 0,
    results: [],
    fetchedAt: now.toISOString(),
    durationMs: 0,
    estimatedCostMicrousd: null,
    warnings: ['evidence_search_failed'],
  };
}

function skippedEvidence(now: Date, warning: string): EvidenceSearchSnapshot {
  return {
    requestId: 'not-requested',
    status: 'unavailable',
    provider: null,
    queryCount: 0,
    results: [],
    fetchedAt: now.toISOString(),
    durationMs: 0,
    estimatedCostMicrousd: 0,
    warnings: [warning],
  };
}

function radarEvents(radar: RadarPayload): string[] {
  return [...new Set([
    ...radar.sections.events.map((event) => `${event.date}: ${event.title}`),
    ...radar.sections.calendar.upcoming.map((event) => `${event.date}: ${event.title}`),
  ])].slice(0, 12);
}

export async function loadPerspectiveContext(
  ticker: string,
  dependencies: PerspectiveContextDependencies = {},
): Promise<PerspectiveContextBundle | null> {
  const loadRadar = dependencies.loadRadar ?? buildRadar;
  const loadFinancials = dependencies.loadFinancials ?? loadFinancialReport;
  const searchEvidence = dependencies.searchEvidence ?? ((request: Parameters<typeof searchExternalEvidence>[0]) => (
    dependencies.signal
      ? searchExternalEvidenceUncached(request, { signal: dependencies.signal })
      : searchExternalEvidence(request)
  ));
  const includeExternalEvidence = dependencies.includeExternalEvidence !== false;
  const radar = await loadRadar(ticker).catch(() => null);
  const market = radar?.market ?? classifyMarket(ticker);
  const name = radar?.name ?? ticker;

  const [financial, evidence] = await Promise.all([
    loadFinancials(ticker).catch(() => unavailableFinancialReport({
      ticker,
      market,
      source: 'financial-service',
      supported: true,
      warning: 'financial_context_unavailable',
    })),
    includeExternalEvidence
      ? searchEvidence({
          ticker,
          name,
          market,
          scopes: ['news', 'filing', 'industry', 'macro'],
          freshnessDays: 30,
          limit: 12,
        }).catch((error) => {
          if (dependencies.signal?.aborted) throw error;
          return unavailableEvidence(dependencies.now?.() ?? new Date());
        })
      : Promise.resolve(skippedEvidence(
          dependencies.now?.() ?? new Date(),
          dependencies.evidenceSkipWarning ?? 'external_evidence_not_requested',
        )),
  ]);
  const hasMarketContext = radar?.sections.price.value != null || (radar?.sections.events.length ?? 0) > 0
    || (radar?.sections.calendar.upcoming.length ?? 0) > 0;
  const hasFinancialContext = financial.yearly.length > 0 || financial.quarterly.length > 0
    || financial.ttm !== null || financial.latestIndicator !== null;
  if (!hasMarketContext && !hasFinancialContext && evidence.results.length === 0) return null;
  const financialSummary = summarizePerspectiveFinancials(financial);
  const context: StockContext = {
    ticker,
    name,
    market,
    currency: radar?.currency ?? currencyOfMarket(market),
    market_as_of: radar?.as_of ?? null,
    price: radar?.sections.price.value ?? null,
    change_pct: radar?.sections.price.change_pct ?? null,
    pe_ttm: radar?.sections.price.pe_ttm ?? null,
    pb: radar?.sections.price.pb ?? null,
    roe: financial.latestIndicator?.roe ?? radar?.sections.fundamentals.roe ?? null,
    market_cap_label: radar?.sections.price.market_cap_label,
    dividend_yield: radar?.sections.fundamentals.dividend_yield ?? null,
    gross_margin: financial.latestIndicator?.grossMargin ?? radar?.sections.fundamentals.gross_margin ?? null,
    net_margin: financial.latestIndicator?.netMargin ?? radar?.sections.fundamentals.net_margin ?? null,
    financial_summary: financialSummary,
    financial_source: financial.source,
    financial_unit: financial.meta.unit,
    financial_as_of: financial.meta.latestPeriodEnd,
    events: radar ? radarEvents(radar) : [],
    external_evidence: evidence.results,
  };
  return {
    context,
    evidence,
    sources: [...new Set([
      radar?.sections.price.source,
      financial.source,
      ...(evidence.provider ? [evidence.provider] : []),
    ].filter((source): source is string => !!source))],
    financial: {
      source: financial.source,
      availability: financial.meta.availability,
      asOf: financial.meta.latestPeriodEnd,
      warnings: financial.meta.warnings,
    },
  };
}
