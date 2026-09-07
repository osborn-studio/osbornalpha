import type { WatchlistResearchJob } from '@/lib/supabase/database.types';
import type { WatchlistResearchChanges } from './research-timeline';
import type { WatchlistResearchRefreshResult } from './research-service';

export interface WatchlistResearchJobResult {
  changes: WatchlistResearchChanges;
  refresh: Pick<WatchlistResearchRefreshResult, 'status' | 'refreshedAt' | 'warnings'>;
}

export interface WatchlistResearchJobView {
  id: string;
  ticker: string;
  status: WatchlistResearchJob['status'];
  stage: WatchlistResearchJob['stage'];
  progress: number;
  errorCode: string | null;
  result: WatchlistResearchJobResult | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextAttemptAt: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function resultView(value: unknown): WatchlistResearchJobResult | null {
  const input = record(value);
  const changes = record(input?.changes);
  const refresh = record(input?.refresh);
  if (!changes || typeof changes.hasChanges !== 'boolean'
    || !Number.isSafeInteger(changes.newNews) || Number(changes.newNews) < 0
    || !Number.isSafeInteger(changes.newReports) || Number(changes.newReports) < 0
    || typeof changes.perspectivesChanged !== 'boolean' || !Array.isArray(changes.ratingChanges)
    || !refresh || !['complete', 'partial'].includes(String(refresh.status))
    || typeof refresh.refreshedAt !== 'string'
    || !Array.isArray(refresh.warnings) || !refresh.warnings.every((item) => typeof item === 'string')) return null;
  return {
    changes: changes as unknown as WatchlistResearchChanges,
    refresh: refresh as unknown as WatchlistResearchJobResult['refresh'],
  };
}

export function watchlistResearchJobView(job: WatchlistResearchJob): WatchlistResearchJobView {
  return {
    id: job.id,
    ticker: job.ticker,
    status: job.status,
    stage: job.stage,
    progress: Math.min(100, Math.max(0, Math.round(job.progress))),
    errorCode: job.error_code,
    result: job.status === 'succeeded' ? resultView(job.result) : null,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    nextAttemptAt: job.next_attempt_at,
  };
}
