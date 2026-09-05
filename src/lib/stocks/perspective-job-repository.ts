import type { PerspectiveGenerationJob } from '@/lib/supabase/database.types';
import type { PerspectiveAnalysisRequestMode } from './perspective-analysis';

export type PerspectiveJobDatabase = object;

export interface PerspectiveJobQuotaSnapshot {
  used: number;
  limit: number;
  plan: string;
}

export class PerspectiveJobRepositoryError extends Error {
  constructor(
    public readonly code: string,
    public readonly quota: PerspectiveJobQuotaSnapshot | null = null,
  ) {
    super(code);
    this.name = 'PerspectiveJobRepositoryError';
  }
}

function repositoryError(prefix: string, message: string | undefined): PerspectiveJobRepositoryError {
  const code = ['perspective_quota_exhausted', 'external_evidence_rate_limited']
    .find((candidate) => message?.includes(candidate)) ?? prefix;
  const quotaMatch = message?.match(/perspective_quota_exhausted:(\d+):(-?\d+):([a-z]+)/i);
  const quota = quotaMatch ? {
    used: Number(quotaMatch[1]),
    limit: Number(quotaMatch[2]),
    plan: quotaMatch[3],
  } : null;
  return new PerspectiveJobRepositoryError(code, quota);
}

export interface EnqueuePerspectiveJobInput {
  ticker: string;
  personaIds: string[] | null;
  analysisMode: PerspectiveAnalysisRequestMode;
  llmSource: PerspectiveGenerationJob['llm_source'];
  includeExternalEvidence: boolean;
  warnings: string[];
}

export async function enqueuePerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  input: EnqueuePerspectiveJobInput,
): Promise<PerspectiveGenerationJob> {
  const repository = db as {
    rpc(name: 'enqueue_perspective_generation_job', args: Record<string, unknown>): Promise<{
      data: PerspectiveGenerationJob | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('enqueue_perspective_generation_job', {
    p_ticker: input.ticker,
    p_persona_ids: input.personaIds,
    p_analysis_mode: input.analysisMode,
    p_llm_source: input.llmSource,
    p_include_external_evidence: input.includeExternalEvidence,
    p_warnings: input.warnings,
  });
  if (error || !data) throw repositoryError('perspective_job_enqueue_failed', error?.message);
  return data;
}

export async function loadPerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  id: string,
): Promise<PerspectiveGenerationJob | null> {
  const repository = db as {
    from(name: 'perspective_generation_jobs'): {
      select(columns: '*'): {
        eq(column: 'id', value: string): {
          maybeSingle(): Promise<{ data: PerspectiveGenerationJob | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await repository.from('perspective_generation_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`perspective_job_load_failed:${error.message}`);
  return data;
}

export interface WaitForPerspectiveJobOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  delay?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('request_cancelled'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function cleanup() {
      signal?.removeEventListener('abort', cancelled);
    }
    function done() {
      cleanup();
      resolve();
    }
    function cancelled() {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new Error('request_cancelled'));
    }
    signal?.addEventListener('abort', cancelled, { once: true });
  });
}

export async function waitForPerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  id: string,
  options: WaitForPerspectiveJobOptions = {},
): Promise<PerspectiveGenerationJob | null> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 240_000, 0), 240_000);
  const delay = options.delay ?? abortableDelay;
  const startedAt = Date.now();
  let attempt = 0;
  while (true) {
    const job = await loadPerspectiveGenerationJob(db, id);
    if (!job || !['queued', 'running'].includes(job.status)) return job;
    const waitMs = Math.min(2_000, Math.round(250 * (1.4 ** attempt)));
    if (Date.now() - startedAt + waitMs > timeoutMs) return job;
    await delay(waitMs, options.signal);
    attempt += 1;
  }
}

export async function loadActivePerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  ticker: string,
): Promise<PerspectiveGenerationJob | null> {
  const repository = db as {
    from(name: 'perspective_generation_jobs'): {
      select(columns: '*'): {
        eq(column: 'ticker', value: string): {
          in(column: 'status', values: Array<PerspectiveGenerationJob['status']>): {
            order(column: 'created_at', options: { ascending: false }): {
              limit(count: 1): {
                maybeSingle(): Promise<{ data: PerspectiveGenerationJob | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
    };
  };
  const { data, error } = await repository.from('perspective_generation_jobs')
    .select('*')
    .eq('ticker', ticker)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`perspective_job_load_active_failed:${error.message}`);
  return data;
}

export async function cancelPerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  id: string,
): Promise<PerspectiveGenerationJob | null> {
  const repository = db as {
    rpc(name: 'cancel_perspective_generation_job', args: { p_job_id: string }): Promise<{
      data: PerspectiveGenerationJob | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('cancel_perspective_generation_job', { p_job_id: id });
  if (error) throw new Error(`perspective_job_cancel_failed:${error.message}`);
  return data;
}

export async function claimPerspectiveGenerationJobs(
  db: PerspectiveJobDatabase,
  limit: number,
  jobId: string | null = null,
): Promise<PerspectiveGenerationJob[]> {
  const repository = db as {
    rpc(name: 'claim_perspective_generation_jobs', args: { p_limit: number; p_lease_minutes: number; p_job_id: string | null }): Promise<{
      data: PerspectiveGenerationJob[] | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('claim_perspective_generation_jobs', {
    p_limit: Math.min(Math.max(Math.floor(limit), 1), 5),
    p_lease_minutes: 5,
    p_job_id: jobId,
  });
  if (error) throw new Error(`perspective_job_claim_failed:${error.message}`);
  return data ?? [];
}

export async function updatePerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  id: string,
  leaseToken: string,
  patch: Partial<PerspectiveGenerationJob>,
): Promise<boolean> {
  const repository = db as {
    from(name: 'perspective_generation_jobs'): {
      update(value: Partial<PerspectiveGenerationJob>): {
        eq(column: 'id' | 'lease_token' | 'status', value: string): {
          eq(column: 'id' | 'lease_token' | 'status', value: string): {
            eq(column: 'id' | 'lease_token' | 'status', value: string): {
              select(columns: 'id'): {
                maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
    };
  };
  const { data, error } = await repository.from('perspective_generation_jobs')
    .update(patch)
    .eq('id', id)
    .eq('lease_token', leaseToken)
    .eq('status', 'running')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`perspective_job_update_failed:${error.message}`);
  return data?.id === id;
}
