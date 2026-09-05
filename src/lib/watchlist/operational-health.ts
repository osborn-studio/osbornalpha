export interface WatchlistOperationalHealthSnapshot {
  generated_at: string;
  research_queue: { due: number; failed: number; oldest_due_at: string | null };
  metric_queue: { due: number; failed: number; oldest_due_at: string | null };
  perspective_generation_queue: {
    queued: number;
    running: number;
    failed: number;
    oldest_queued_at: string | null;
    oldest_running_at: string | null;
  };
  quotes: { count: number; latest_observed_at: string | null };
  metrics: { count: number; latest_observed_at: string | null };
  alerts: {
    latest_finished_at: string | null;
    latest_status: string | null;
    pending: number;
    failed: number;
    dead_letter: number;
    oldest_pending_at: string | null;
  };
  citations: { sample_size: number; average_coverage: number | null };
  shared_research: { artifacts: number; links: number };
  perspective_evaluations?: { pending: number; dead_letter: number; oldest_due_at: string | null };
}

export interface WatchlistOperationalHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  warnings: string[];
  snapshot: WatchlistOperationalHealthSnapshot;
}

export function watchlistOperationalAlertEvaluation(health: WatchlistOperationalHealth) {
  return {
    metrics: {
      status: health.status,
      warnings: health.warnings,
      snapshot: health.snapshot,
    },
    violations: health.warnings.map((code) => ({ code, value: 1, threshold: 0 })),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function count(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function timestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function ratio(value: unknown): number | null | undefined {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

export function parseWatchlistOperationalHealth(value: unknown): WatchlistOperationalHealthSnapshot | null {
  const input = record(value);
  const research = record(input?.research_queue);
  const metric = record(input?.metric_queue);
  const perspectiveGeneration = record(input?.perspective_generation_queue);
  const quotes = record(input?.quotes);
  const metrics = record(input?.metrics);
  const alerts = record(input?.alerts);
  const citations = record(input?.citations);
  const shared = record(input?.shared_research);
  const perspectiveEvaluations = record(input?.perspective_evaluations);
  const generatedAt = timestamp(input?.generated_at);
  const values = {
    researchDue: count(research?.due), researchFailed: count(research?.failed), researchOldest: timestamp(research?.oldest_due_at),
    metricDue: count(metric?.due), metricFailed: count(metric?.failed), metricOldest: timestamp(metric?.oldest_due_at),
    generationQueued: count(perspectiveGeneration?.queued),
    generationRunning: count(perspectiveGeneration?.running),
    generationFailed: count(perspectiveGeneration?.failed),
    generationOldestQueued: timestamp(perspectiveGeneration?.oldest_queued_at),
    generationOldestRunning: timestamp(perspectiveGeneration?.oldest_running_at),
    quoteCount: count(quotes?.count), quoteLatest: timestamp(quotes?.latest_observed_at),
    metricCount: count(metrics?.count), metricLatest: timestamp(metrics?.latest_observed_at),
    alertLatest: timestamp(alerts?.latest_finished_at), alertPending: count(alerts?.pending),
    alertFailed: count(alerts?.failed), alertDead: count(alerts?.dead_letter), alertOldest: timestamp(alerts?.oldest_pending_at),
    citationSamples: count(citations?.sample_size), citationCoverage: ratio(citations?.average_coverage),
    artifacts: count(shared?.artifacts), links: count(shared?.links),
    perspectivePending: count(perspectiveEvaluations?.pending),
    perspectiveDead: count(perspectiveEvaluations?.dead_letter),
    perspectiveOldest: timestamp(perspectiveEvaluations?.oldest_due_at),
  };
  if (typeof generatedAt !== 'string'
    || [
      values.researchOldest, values.metricOldest, values.generationOldestQueued,
      values.generationOldestRunning, values.quoteLatest, values.metricLatest,
      values.alertLatest, values.alertOldest,
    ]
      .some((item) => item === undefined)
    || values.citationCoverage === undefined
    || values.researchDue === null || values.researchFailed === null || values.metricDue === null || values.metricFailed === null
    || values.generationQueued === null || values.generationRunning === null || values.generationFailed === null
    || values.quoteCount === null || values.metricCount === null || values.alertPending === null || values.alertFailed === null
    || values.alertDead === null || values.citationSamples === null || values.artifacts === null || values.links === null
    || typeof alerts?.latest_status !== 'string' && alerts?.latest_status !== null) return null;
  return {
    generated_at: generatedAt,
    research_queue: { due: values.researchDue, failed: values.researchFailed, oldest_due_at: values.researchOldest ?? null },
    metric_queue: { due: values.metricDue, failed: values.metricFailed, oldest_due_at: values.metricOldest ?? null },
    perspective_generation_queue: {
      queued: values.generationQueued,
      running: values.generationRunning,
      failed: values.generationFailed,
      oldest_queued_at: values.generationOldestQueued ?? null,
      oldest_running_at: values.generationOldestRunning ?? null,
    },
    quotes: { count: values.quoteCount, latest_observed_at: values.quoteLatest ?? null },
    metrics: { count: values.metricCount, latest_observed_at: values.metricLatest ?? null },
    alerts: {
      latest_finished_at: values.alertLatest ?? null,
      latest_status: alerts.latest_status as string | null,
      pending: values.alertPending,
      failed: values.alertFailed,
      dead_letter: values.alertDead,
      oldest_pending_at: values.alertOldest ?? null,
    },
    citations: { sample_size: values.citationSamples, average_coverage: values.citationCoverage ?? null },
    shared_research: { artifacts: values.artifacts, links: values.links },
    ...(values.perspectivePending !== null && values.perspectiveDead !== null && values.perspectiveOldest !== undefined ? {
      perspective_evaluations: {
        pending: values.perspectivePending,
        dead_letter: values.perspectiveDead,
        oldest_due_at: values.perspectiveOldest ?? null,
      },
    } : {}),
  };
}

function ageMinutes(now: number, value: string | null): number | null {
  if (!value) return null;
  return Math.max(0, (now - new Date(value).getTime()) / 60_000);
}

export function evaluateWatchlistOperationalHealth(snapshot: WatchlistOperationalHealthSnapshot): WatchlistOperationalHealth {
  const now = new Date(snapshot.generated_at).getTime();
  const warnings: string[] = [];
  let severity = 0;
  const warn = (code: string, level: 1 | 2 = 1) => {
    warnings.push(code);
    severity = Math.max(severity, level);
  };
  const researchAge = ageMinutes(now, snapshot.research_queue.oldest_due_at);
  const metricAge = ageMinutes(now, snapshot.metric_queue.oldest_due_at);
  const generationQueuedAge = ageMinutes(now, snapshot.perspective_generation_queue.oldest_queued_at);
  const generationRunningAge = ageMinutes(now, snapshot.perspective_generation_queue.oldest_running_at);
  const quoteAge = ageMinutes(now, snapshot.quotes.latest_observed_at);
  const metricSnapshotAge = ageMinutes(now, snapshot.metrics.latest_observed_at);
  const alertAge = ageMinutes(now, snapshot.alerts.latest_finished_at);
  const alertPendingAge = ageMinutes(now, snapshot.alerts.oldest_pending_at);

  if (snapshot.research_queue.failed > 0) warn('research_queue_failed');
  if (snapshot.metric_queue.failed > 0) warn('metric_queue_failed');
  if (snapshot.perspective_generation_queue.failed > 0) warn('perspective_generation_failed');
  if (snapshot.research_queue.due > 100 || (researchAge ?? 0) > 360) warn('research_queue_stalled', 2);
  if (snapshot.metric_queue.due > 100 || (metricAge ?? 0) > 180) warn('metric_queue_stalled', 2);
  if (snapshot.perspective_generation_queue.queued > 25 || (generationQueuedAge ?? 0) > 30) {
    warn('perspective_generation_queue_stalled', 2);
  }
  if (snapshot.perspective_generation_queue.running > 10 || (generationRunningAge ?? 0) > 10) {
    warn('perspective_generation_worker_stalled', 2);
  }
  if (snapshot.alerts.failed > 0) warn('alert_delivery_failed');
  if (snapshot.alerts.dead_letter > 0) warn('alert_dead_letter', 2);
  if (snapshot.alerts.pending > 100 || (alertPendingAge ?? 0) > 60) warn('alert_delivery_stalled', 2);
  if (snapshot.alerts.latest_status === 'failed' || (alertAge ?? 0) > 60) warn('alert_run_unhealthy', 2);
  if (snapshot.quotes.count > 0 && (quoteAge ?? Number.POSITIVE_INFINITY) > 360) warn('quote_snapshots_stale', 2);
  if (snapshot.metrics.count > 0 && (metricSnapshotAge ?? Number.POSITIVE_INFINITY) > 180) warn('metric_snapshots_stale', 2);
  if (snapshot.citations.sample_size > 0 && (snapshot.citations.average_coverage ?? 0) < 0.5) warn('citation_coverage_low');
  if ((snapshot.perspective_evaluations?.dead_letter ?? 0) > 0) warn('perspective_evaluation_dead_letter', 2);
  const hasRuntimeData = snapshot.quotes.count + snapshot.metrics.count + snapshot.shared_research.links > 0
    || snapshot.alerts.latest_finished_at !== null
    || snapshot.perspective_generation_queue.queued + snapshot.perspective_generation_queue.running
      + snapshot.perspective_generation_queue.failed > 0;
  return {
    status: severity === 2 ? 'critical' : severity === 1 ? 'degraded' : hasRuntimeData ? 'healthy' : 'unknown',
    warnings,
    snapshot,
  };
}
