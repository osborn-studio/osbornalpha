export const AI_FAILURE_RATE_THRESHOLD = 0.1;
export const AI_P95_THRESHOLD_MS = 90_000;
export const AI_STALE_RUNNING_MS = 10 * 60_000;
export const QUOTE_CACHE_RATIO_THRESHOLD = 0.2;

export interface AlertWindow {
  from: string;
  to: string;
}

export interface AlertViolation {
  code: string;
  value: number;
  threshold: number;
}

export interface AiRunSample {
  status: 'running' | 'completed' | 'failed';
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
}

export interface QuoteEventSample {
  event_name: string;
  metadata: Record<string, unknown> | null;
}

function roundRatio(value: number): number {
  return Number(value.toFixed(4));
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

export function previousBeijingDayWindow(now: Date): AlertWindow {
  const beijingOffsetMs = 8 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + beijingOffsetMs);
  const currentDayStart = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - beijingOffsetMs;
  return {
    from: new Date(currentDayStart - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(currentDayStart).toISOString(),
  };
}

export function previousQuarterHourWindow(now: Date): AlertWindow {
  const quarterMs = 15 * 60 * 1000;
  const to = Math.floor(now.getTime() / quarterMs) * quarterMs;
  return {
    from: new Date(to - quarterMs).toISOString(),
    to: new Date(to).toISOString(),
  };
}

export function evaluateAiDaily(runs: AiRunSample[], now: Date) {
  const terminal = runs.filter((run) => run.status === 'completed' || run.status === 'failed');
  const failed = terminal.filter((run) => run.status === 'failed');
  const durations = terminal
    .map((run) => run.duration_ms)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const p95Index = durations.length === 0 ? -1 : Math.ceil(durations.length * 0.95) - 1;
  const p95 = p95Index >= 0 ? durations[p95Index] : null;
  const staleBefore = now.getTime() - AI_STALE_RUNNING_MS;
  const staleRunning = runs.filter((run) => (
    run.status === 'running' && new Date(run.created_at).getTime() < staleBefore
  )).length;
  const failuresByErrorCode: Record<string, number> = {};
  for (const run of failed) {
    const code = run.error_code || 'unknown';
    failuresByErrorCode[code] = (failuresByErrorCode[code] ?? 0) + 1;
  }
  const failureRate = terminal.length > 0 ? roundRatio(failed.length / terminal.length) : 0;
  const violations: AlertViolation[] = [];
  if (failureRate > AI_FAILURE_RATE_THRESHOLD) {
    violations.push({ code: 'ai_failure_rate_high', value: failureRate, threshold: AI_FAILURE_RATE_THRESHOLD });
  }
  if (p95 !== null && p95 > AI_P95_THRESHOLD_MS) {
    violations.push({ code: 'ai_p95_high', value: p95, threshold: AI_P95_THRESHOLD_MS });
  }
  if (staleRunning > 0) {
    violations.push({ code: 'ai_stale_running', value: staleRunning, threshold: 0 });
  }
  return {
    metrics: {
      terminal_runs: terminal.length,
      failed_runs: failed.length,
      failure_rate: failureRate,
      p95_duration_ms: p95,
      stale_running: staleRunning,
      failures_by_error_code: failuresByErrorCode,
    },
    violations,
  };
}

export function evaluateQuoteWindow(events: QuoteEventSample[]) {
  let fullFailures = 0;
  let degradedBatches = 0;
  let attemptedTickers = 0;
  let staleTickers = 0;
  for (const event of events) {
    if (event.event_name === 'quote_batch_failed') fullFailures += 1;
    if (event.event_name === 'quote_batch_degraded') degradedBatches += 1;
    attemptedTickers += safeCount(event.metadata?.count);
    staleTickers += safeCount(event.metadata?.stale);
  }
  const cacheRatio = attemptedTickers > 0 ? roundRatio(staleTickers / attemptedTickers) : 0;
  const violations: AlertViolation[] = [];
  if (fullFailures > 0) {
    violations.push({ code: 'quote_batch_failed', value: fullFailures, threshold: 0 });
  }
  if (degradedBatches > 0) {
    violations.push({ code: 'quote_batch_degraded', value: degradedBatches, threshold: 0 });
  }
  if (cacheRatio > QUOTE_CACHE_RATIO_THRESHOLD) {
    violations.push({ code: 'quote_cache_ratio_high', value: cacheRatio, threshold: QUOTE_CACHE_RATIO_THRESHOLD });
  }
  return {
    metrics: {
      batches: events.length,
      full_failures: fullFailures,
      degraded_batches: degradedBatches,
      attempted_tickers: attemptedTickers,
      stale_tickers: staleTickers,
      cache_ratio: cacheRatio,
    },
    violations,
  };
}
