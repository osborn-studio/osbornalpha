import type { PerspectiveGenerationJob } from '@/lib/supabase/database.types';

export interface PerspectiveGenerationJobView {
  id: string;
  ticker: string;
  status: PerspectiveGenerationJob['status'];
  stage: PerspectiveGenerationJob['stage'];
  progress: number;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextAttemptAt: string;
}

export function perspectiveGenerationJobView(
  job: PerspectiveGenerationJob,
): PerspectiveGenerationJobView {
  return {
    id: job.id,
    ticker: job.ticker,
    status: job.status,
    stage: job.stage,
    progress: Math.min(100, Math.max(0, Math.round(job.progress))),
    errorCode: job.error_code,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    nextAttemptAt: job.next_attempt_at,
  };
}
