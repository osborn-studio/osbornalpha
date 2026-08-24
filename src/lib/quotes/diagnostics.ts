export type SourceOutcome = 'success' | 'empty' | 'timeout' | 'error';

export interface SourceAttempt {
  ticker: string;
  source: string;
  outcome: SourceOutcome;
  attempts: number;
  duration_ms: number;
}

export interface SourceSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  retries: number;
  duration_ms: number;
}

export function classifySourceFailure(error: unknown): Exclude<SourceOutcome, 'success' | 'empty'> {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'AbortError' || /timeout|timed out|abort/i.test(message) ? 'timeout' : 'error';
}

function safeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function aggregateSourceAttempts(attempts: SourceAttempt[]): Record<string, SourceSummary> {
  return attempts.reduce<Record<string, SourceSummary>>((summary, attempt) => {
    const current = summary[attempt.source] ?? {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      retries: 0,
      duration_ms: 0,
    };
    current.attempted += 1;
    current.succeeded += attempt.outcome === 'success' ? 1 : 0;
    current.failed += attempt.outcome === 'success' ? 0 : 1;
    current.retries += Math.max(0, safeInteger(attempt.attempts) - 1);
    current.duration_ms += safeInteger(attempt.duration_ms);
    summary[attempt.source] = current;
    return summary;
  }, {});
}
