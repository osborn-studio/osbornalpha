import { buildRadar, type RadarPayload } from '@/lib/brief/radar';
import { searchExternalEvidence } from '@/lib/external-evidence';
import type { EvidenceSearchSnapshot } from '@/lib/external-evidence/types';
import { loadFinancialReport } from '@/lib/financials/service';
import { unavailableFinancialReport } from '@/lib/financials/report';
import type { FinancialReport, FinancialYearRow } from '@/lib/financials/types';
import type { StockContext } from '@/lib/data/personas';

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
  const searchEvidence = dependencies.searchEvidence ?? searchExternalEvidence;
  const radar = await loadRadar(ticker);
  if (radar.sections.price.value == null || radar.sections.price.value <= 0) return null;

  const [financial, evidence] = await Promise.all([
    loadFinancials(ticker).catch(() => unavailableFinancialReport({
      ticker,
      market: radar.market,
      source: 'financial-service',
      supported: true,
      warning: 'financial_context_unavailable',
    })),
    searchEvidence({
      ticker,
      name: radar.name,
      market: radar.market,
      scopes: ['news', 'filing', 'industry', 'macro'],
      freshnessDays: 30,
      limit: 12,
    }).catch(() => unavailableEvidence(dependencies.now?.() ?? new Date())),
  ]);
  const financialSummary = summarizePerspectiveFinancials(financial);
  const context: StockContext = {
    ticker,
    name: radar.name,
    market: radar.market,
    currency: radar.currency,
    price: radar.sections.price.value,
    change_pct: radar.sections.price.change_pct ?? 0,
    pe_ttm: radar.sections.price.pe_ttm,
    pb: radar.sections.price.pb,
    roe: financial.latestIndicator?.roe ?? radar.sections.fundamentals.roe,
    market_cap_label: radar.sections.price.market_cap_label,
    dividend_yield: radar.sections.fundamentals.dividend_yield,
    gross_margin: financial.latestIndicator?.grossMargin ?? radar.sections.fundamentals.gross_margin,
    net_margin: financial.latestIndicator?.netMargin ?? radar.sections.fundamentals.net_margin,
    financial_summary: financialSummary,
    financial_source: financial.source,
    financial_unit: financial.meta.unit,
    financial_as_of: financial.meta.latestPeriodEnd,
    events: radarEvents(radar),
    external_evidence: evidence.results,
  };
  return {
    context,
    evidence,
    sources: [...new Set([
      radar.sections.price.source,
      financial.source,
      ...(evidence.provider ? [evidence.provider] : []),
    ].filter(Boolean))],
    financial: {
      source: financial.source,
      availability: financial.meta.availability,
      asOf: financial.meta.latestPeriodEnd,
      warnings: financial.meta.warnings,
    },
  };
}
