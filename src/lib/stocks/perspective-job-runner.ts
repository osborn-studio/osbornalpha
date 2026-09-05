import { boundedMap } from '@/lib/async/bounded-map';
import type { QuotaResult } from '@/lib/billing/quota';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { PerspectiveGenerationJob } from '@/lib/supabase/database.types';
import { resolveLlmForUser, resolvePlatformLlm, type ResolvedLlm } from '@/lib/llm/resolve';
import {
  generateStockPerspectives,
  PerspectiveGenerationError,
  type GenerateStockPerspectivesInput,
} from './perspective-generation-service';
import {
  claimPerspectiveGenerationJobs,
  loadPerspectiveGenerationJob,
  updatePerspectiveGenerationJob,
  type PerspectiveJobDatabase,
} from './perspective-job-repository';

const PERMANENT_ERROR_CODES = new Set([
  'external_evidence_required',
  'perspective_quota_exhausted',
  'pricing_unavailable',
  'budget_invariant_violation',
  'usage_audit_invariant',
  'llm_provider_unavailable',
]);

export interface PerspectiveJobRunnerDependencies {
  resolveLlm: (job: PerspectiveGenerationJob, db: PerspectiveJobDatabase) => Promise<ResolvedLlm | null>;
  generate: (input: GenerateStockPerspectivesInput) => Promise<Record<string, unknown>>;
  loadJob: typeof loadPerspectiveGenerationJob;
  updateJob: typeof updatePerspectiveGenerationJob;
  now: () => Date;
}

const productionDependencies: PerspectiveJobRunnerDependencies = {
  resolveLlm: async (job, db) => job.llm_source === 'user'
    ? resolveLlmForUser(job.user_id, db)
    : resolvePlatformLlm(),
  generate: generateStockPerspectives,
  loadJob: loadPerspectiveGenerationJob,
  updateJob: updatePerspectiveGenerationJob,
  now: () => new Date(),
};

function resultGenerationId(result: Record<string, unknown>): string | null {
  const meta = result.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>).generation_id;
  return typeof value === 'string' ? value : null;
}

function storedJobResult(result: Record<string, unknown>): Record<string, unknown> {
  // The generation service already bounds and sanitizes every model field.
  // Keeping its public response lets a concurrent synchronous caller reuse the
  // same durable execution instead of starting a second provider request.
  return {
    source: typeof result.source === 'string' ? result.source : null,
    ticker: typeof result.ticker === 'string' ? result.ticker : null,
    context: result.context && typeof result.context === 'object' && !Array.isArray(result.context)
      ? result.context
      : {},
    perspectives: Array.isArray(result.perspectives) ? result.perspectives : [],
    meta: result.meta && typeof result.meta === 'object' && !Array.isArray(result.meta) ? result.meta : {},
  };
}

type JobExecutionState = 'active' | 'cancelled' | 'superseded';
export type PerspectiveJobOutcome = 'succeeded' | 'queued' | 'failed' | 'cancelled' | 'superseded';

export interface PerspectiveJobExecution {
  outcome: PerspectiveJobOutcome;
  result: Record<string, unknown> | null;
  error: PerspectiveGenerationError | null;
}

function reservedQuota(job: PerspectiveGenerationJob): QuotaResult | null {
  return job.llm_source === 'env' ? {
    allowed: true,
    used: job.quota_used,
    limit: job.quota_limit,
    plan: job.quota_plan,
  } : null;
}

async function executionState(
  db: PerspectiveJobDatabase,
  job: PerspectiveGenerationJob,
  leaseToken: string,
  dependencies: PerspectiveJobRunnerDependencies,
): Promise<JobExecutionState> {
  const current = await dependencies.loadJob(db, job.id);
  if (!current || current.status !== 'running' || current.lease_token !== leaseToken) return 'superseded';
  return current.cancel_requested_at === null ? 'active' : 'cancelled';
}

function retryAt(job: PerspectiveGenerationJob, now: Date): string {
  const delayMinutes = Math.min(30, 2 ** Math.max(0, job.attempt_count - 1));
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

function errorCode(error: unknown): string {
  if (error instanceof PerspectiveGenerationError) return error.code;
  return error instanceof Error && /^[a-z0-9_:-]+$/i.test(error.message)
    ? error.message.slice(0, 120)
    : 'perspective_job_failed';
}

function monitorExecutionState(
  db: PerspectiveJobDatabase,
  job: PerspectiveGenerationJob,
  leaseToken: string,
  dependencies: PerspectiveJobRunnerDependencies,
  controller: AbortController,
): () => void {
  let checking = false;
  const timer = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    void executionState(db, job, leaseToken, dependencies)
      .then((state) => {
        if (state !== 'active') controller.abort(new Error(`perspective_job_${state}`));
      })
      .catch(() => controller.abort(new Error('perspective_job_lease_check_failed')))
      .finally(() => { checking = false; });
  }, 1_000);
  return () => clearInterval(timer);
}

async function executePerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  job: PerspectiveGenerationJob,
  dependencies: PerspectiveJobRunnerDependencies = productionDependencies,
): Promise<PerspectiveJobExecution> {
  const now = dependencies.now();
  const leaseToken = job.lease_token;
  if (!leaseToken) return { outcome: 'superseded', result: null, error: null };
  const controller = new AbortController();
  let stopMonitoring: () => void = () => {};
  const update = (patch: Partial<PerspectiveGenerationJob>) => dependencies.updateJob(
    db,
    job.id,
    leaseToken,
    patch,
  );
  try {
    const initialState = await executionState(db, job, leaseToken, dependencies);
    if (initialState === 'superseded') return { outcome: 'superseded', result: null, error: null };
    if (initialState === 'cancelled') {
      const updated = await update({
        status: 'cancelled', stage: 'complete', progress: 100,
        lease_expires_at: null, lease_token: null,
        finished_at: now.toISOString(), updated_at: now.toISOString(),
      });
      return { outcome: updated ? 'cancelled' : 'superseded', result: null, error: null };
    }
    stopMonitoring = monitorExecutionState(db, job, leaseToken, dependencies, controller);
    const llm = await dependencies.resolveLlm(job, db);
    if (!llm || llm.source !== job.llm_source) {
      throw new PerspectiveGenerationError('llm_provider_unavailable', 503, 'job');
    }
    const quota = reservedQuota(job);
    const result = await dependencies.generate({
      ticker: job.ticker,
      userId: job.user_id,
      db,
      llm,
      personaIds: job.persona_ids,
      analysisMode: job.requested_analysis_mode,
      includeExternalEvidence: job.include_external_evidence,
      analysisWarnings: job.request_warnings,
      quota,
      usageIdempotencyKey: leaseToken,
      signal: controller.signal,
      onProgress: async (stage, progress) => {
        const updated = await update({
          stage, progress, lease_expires_at: new Date(dependencies.now().getTime() + 5 * 60_000).toISOString(),
          updated_at: dependencies.now().toISOString(),
        });
        if (!updated) throw new PerspectiveGenerationError('perspective_job_lease_lost', 409, 'job');
      },
      isCancelled: async () => (await executionState(db, job, leaseToken, dependencies)) !== 'active',
    });
    const finishedAt = dependencies.now().toISOString();
    const updated = await update({
      status: 'succeeded', stage: 'complete', progress: 100,
      result_generation_id: resultGenerationId(result), result: storedJobResult(result),
      error_code: null, error_message: null, lease_expires_at: null, lease_token: null,
      finished_at: finishedAt, updated_at: finishedAt,
    });
    return { outcome: updated ? 'succeeded' : 'superseded', result: updated ? result : null, error: null };
  } catch (error) {
    const code = errorCode(error);
    const finishedAt = dependencies.now();
    if (code === 'perspective_job_lease_lost') return { outcome: 'superseded', result: null, error: null };
    if (code === 'perspective_job_cancelled') {
      const updated = await update({
        status: 'cancelled', stage: 'complete', progress: 100,
        error_code: null, error_message: null, lease_expires_at: null, lease_token: null,
        finished_at: finishedAt.toISOString(), updated_at: finishedAt.toISOString(),
      });
      return { outcome: updated ? 'cancelled' : 'superseded', result: null, error: null };
    }
    const retry = !PERMANENT_ERROR_CODES.has(code) && job.attempt_count < job.max_attempts;
    const updated = await update(retry ? {
      status: 'queued', stage: 'queued', progress: 0, next_attempt_at: retryAt(job, finishedAt),
      error_code: code, error_message: code, lease_expires_at: null, lease_token: null,
      updated_at: finishedAt.toISOString(),
    } : {
      status: 'failed', stage: 'complete', progress: 100,
      error_code: code, error_message: code, lease_expires_at: null, lease_token: null,
      finished_at: finishedAt.toISOString(), updated_at: finishedAt.toISOString(),
    });
    return {
      outcome: updated ? retry ? 'queued' : 'failed' : 'superseded',
      result: null,
      error: error instanceof PerspectiveGenerationError ? error : null,
    };
  } finally {
    stopMonitoring();
  }
}

export async function runPerspectiveGenerationJob(
  db: PerspectiveJobDatabase,
  job: PerspectiveGenerationJob,
  dependencies: PerspectiveJobRunnerDependencies = productionDependencies,
): Promise<PerspectiveJobOutcome> {
  return (await executePerspectiveGenerationJob(db, job, dependencies)).outcome;
}

async function runClaimedPerspectiveGenerationJobs(
  limit: number,
  db: PerspectiveJobDatabase,
  jobId: string | null,
): Promise<{ claimed: number; succeeded: number; queued: number; failed: number; cancelled: number; superseded: number }> {
  const jobs = await claimPerspectiveGenerationJobs(db, limit, jobId);
  const settled = await boundedMap(jobs, 2, (job) => runPerspectiveGenerationJob(db, job));
  const outcomes = settled.map((result) => result.status === 'fulfilled' ? result.value : 'failed');
  return {
    claimed: jobs.length,
    succeeded: outcomes.filter((value) => value === 'succeeded').length,
    queued: outcomes.filter((value) => value === 'queued').length,
    failed: outcomes.filter((value) => value === 'failed').length,
    cancelled: outcomes.filter((value) => value === 'cancelled').length,
    superseded: outcomes.filter((value) => value === 'superseded').length,
  };
}

export async function runPerspectiveGenerationJobs(
  limit = 2,
  db: PerspectiveJobDatabase = getAdminSupabase(),
): ReturnType<typeof runClaimedPerspectiveGenerationJobs> {
  return runClaimedPerspectiveGenerationJobs(limit, db, null);
}

export async function runPerspectiveGenerationJobById(
  jobId: string,
  db: PerspectiveJobDatabase = getAdminSupabase(),
): ReturnType<typeof runClaimedPerspectiveGenerationJobs> {
  return runClaimedPerspectiveGenerationJobs(1, db, jobId);
}

export async function runPerspectiveGenerationJobByIdWithResult(
  jobId: string,
  db: PerspectiveJobDatabase = getAdminSupabase(),
  llm?: ResolvedLlm,
): Promise<PerspectiveJobExecution> {
  const jobs = await claimPerspectiveGenerationJobs(db, 1, jobId);
  const job = jobs[0];
  if (!job) return { outcome: 'superseded', result: null, error: null };
  const dependencies = llm
    ? { ...productionDependencies, resolveLlm: async () => llm }
    : productionDependencies;
  return executePerspectiveGenerationJob(db, job, dependencies);
}
