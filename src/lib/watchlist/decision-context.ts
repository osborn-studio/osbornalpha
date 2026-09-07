export interface WatchlistDecisionContextSummary {
  capturedAt: string | null;
  metric: {
    historyRange: string | null;
    benchmarkTicker: string | null;
    calculatorVersion: string | null;
    observedAt: string | null;
    coverageRatio: number | null;
  } | null;
  research: { newsCount: number; reportCount: number; latestFetchedAt: string | null };
  perspective: {
    modelVersion: string | null;
    promptVersion: string | null;
    analysisMode: string | null;
    evidenceCount: number;
    evidenceCoverageRatio: number | null;
    generatedAt: string | null;
  } | null;
  alerts: { unreadCount: number; failedDeliveryCount: number; latestTriggeredAt: string | null };
  reviewReasonCount: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function ratio(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function parseWatchlistDecisionContext(value: unknown): WatchlistDecisionContextSummary | null {
  const snapshot = record(value);
  if (!snapshot || snapshot.schema_version !== 1) return null;
  const metricValue = record(snapshot.metric);
  const researchValue = record(snapshot.research) ?? {};
  const perspectiveValue = record(snapshot.perspective);
  const alertValue = record(snapshot.alerts) ?? {};
  return {
    capturedAt: text(snapshot.captured_at),
    metric: metricValue ? {
      historyRange: text(metricValue.history_range),
      benchmarkTicker: text(metricValue.benchmark_ticker),
      calculatorVersion: text(metricValue.calculator_version),
      observedAt: text(metricValue.observed_at),
      coverageRatio: ratio(metricValue.coverage_ratio),
    } : null,
    research: {
      newsCount: count(researchValue.news_count),
      reportCount: count(researchValue.report_count),
      latestFetchedAt: text(researchValue.latest_fetched_at),
    },
    perspective: perspectiveValue ? {
      modelVersion: text(perspectiveValue.model_version),
      promptVersion: text(perspectiveValue.prompt_version),
      analysisMode: text(perspectiveValue.resolved_analysis_mode),
      evidenceCount: count(perspectiveValue.evidence_result_count),
      evidenceCoverageRatio: ratio(perspectiveValue.evidence_coverage_ratio),
      generatedAt: text(perspectiveValue.generated_at),
    } : null,
    alerts: {
      unreadCount: count(alertValue.unread_count),
      failedDeliveryCount: count(alertValue.failed_delivery_count),
      latestTriggeredAt: text(alertValue.latest_triggered_at),
    },
    reviewReasonCount: Array.isArray(snapshot.review_reasons) ? snapshot.review_reasons.length : 0,
  };
}
