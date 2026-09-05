import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveGenerationJob } from '@/lib/supabase/database.types';
import { PerspectiveGenerationError } from './perspective-generation-service';
import { runPerspectiveGenerationJob, type PerspectiveJobRunnerDependencies } from './perspective-job-runner';

const job: PerspectiveGenerationJob = {
  id: 'job-1', user_id: 'user-1', ticker: 'AAPL', persona_ids: null,
  requested_analysis_mode: 'auto', llm_source: 'env', include_external_evidence: true,
  request_warnings: [], status: 'running', stage: 'context', progress: 10,
  attempt_count: 1, max_attempts: 3, quota_plan: 'free', quota_limit: 5, quota_used: 1,
  next_attempt_at: '2026-09-04T12:00:00Z',
  lease_expires_at: '2026-09-04T12:05:00Z', lease_token: 'lease-1', cancel_requested_at: null,
  result_generation_id: null, result: {}, error_code: null, error_message: null,
  created_at: '2026-09-04T12:00:00Z', started_at: '2026-09-04T12:00:00Z',
  finished_at: null, updated_at: '2026-09-04T12:00:00Z',
};

function dependencies(overrides: Partial<PerspectiveJobRunnerDependencies> = {}): PerspectiveJobRunnerDependencies {
  return {
    resolveLlm: vi.fn(async () => ({ provider: 'deepseek', model: 'test', source: 'env' as const, protocol: 'openai' as const, apiKey: 'x', baseUrl: 'x' })),
    generate: vi.fn(async () => ({ meta: { generation_id: 'generation-1' }, perspectives: [{ persona: 'munger' }] })),
    loadJob: vi.fn(async () => job),
    updateJob: vi.fn(async () => true),
    now: () => new Date('2026-09-04T12:01:00Z'),
    ...overrides,
  };
}

describe('perspective job runner', () => {
  it('runs one job and stores the bounded public response for synchronous reuse', async () => {
    const deps = dependencies();
    await expect(runPerspectiveGenerationJob({}, job, deps)).resolves.toBe('succeeded');
    expect(deps.generate).toHaveBeenCalledWith(expect.objectContaining({
      ticker: 'AAPL', userId: 'user-1', includeExternalEvidence: true,
      usageIdempotencyKey: 'lease-1', signal: expect.any(AbortSignal),
    }));
    expect(deps.updateJob).toHaveBeenLastCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({
      status: 'succeeded', result_generation_id: 'generation-1',
      result: {
        source: null,
        ticker: null,
        context: {},
        perspectives: [{ persona: 'munger' }],
        meta: { generation_id: 'generation-1' },
      },
    }));
  });

  it('never falls back from a BYO job to a platform provider', async () => {
    const deps = dependencies({ resolveLlm: vi.fn(async () => ({
      provider: 'deepseek', model: 'test', source: 'env' as const, protocol: 'openai' as const, apiKey: 'x', baseUrl: 'x',
    })) });
    await expect(runPerspectiveGenerationJob({}, { ...job, llm_source: 'user' }, deps)).resolves.toBe('failed');
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.updateJob).toHaveBeenLastCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({
      status: 'failed', error_code: 'llm_provider_unavailable',
    }));
  });

  it('acknowledges cancellation before provider work', async () => {
    const deps = dependencies({ loadJob: vi.fn(async () => ({ ...job, cancel_requested_at: '2026-09-04T12:00:30Z' })) });
    await expect(runPerspectiveGenerationJob({}, job, deps)).resolves.toBe('cancelled');
    expect(deps.resolveLlm).not.toHaveBeenCalled();
  });

  it('does not overwrite a job after another worker replaces its lease', async () => {
    const deps = dependencies({
      loadJob: vi.fn(async () => ({ ...job, lease_token: 'new-lease' })),
    });
    await expect(runPerspectiveGenerationJob({}, job, deps)).resolves.toBe('superseded');
    expect(deps.resolveLlm).not.toHaveBeenCalled();
    expect(deps.updateJob).not.toHaveBeenCalled();
  });

  it('requeues transient failures but terminates permanent failures', async () => {
    const transient = dependencies({ generate: vi.fn(async () => { throw new Error('provider_error'); }) });
    await expect(runPerspectiveGenerationJob({}, job, transient)).resolves.toBe('queued');
    expect(transient.updateJob).toHaveBeenLastCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({ status: 'queued' }));

    const permanent = dependencies({ generate: vi.fn(async () => {
      throw new PerspectiveGenerationError('external_evidence_required', 424, 'evidence');
    }) });
    await expect(runPerspectiveGenerationJob({}, job, permanent)).resolves.toBe('failed');
    expect(permanent.updateJob).toHaveBeenLastCalledWith({}, 'job-1', 'lease-1', expect.objectContaining({ status: 'failed' }));
  });
});
