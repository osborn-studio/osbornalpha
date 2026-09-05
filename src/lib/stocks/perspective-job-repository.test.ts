import { describe, expect, it, vi } from 'vitest';
import type { PerspectiveGenerationJob } from '@/lib/supabase/database.types';
import {
  cancelPerspectiveGenerationJob,
  claimPerspectiveGenerationJobs,
  enqueuePerspectiveGenerationJob,
  loadActivePerspectiveGenerationJob,
  loadPerspectiveGenerationJob,
  waitForPerspectiveGenerationJob,
  updatePerspectiveGenerationJob,
} from './perspective-job-repository';

const job = { id: 'job-1', ticker: 'AAPL', status: 'queued' } as PerspectiveGenerationJob;

describe('perspective generation job repository', () => {
  it('maps enqueue input to the narrow RPC contract', async () => {
    const rpc = vi.fn(async () => ({ data: job, error: null }));
    await expect(enqueuePerspectiveGenerationJob({ rpc }, {
      ticker: 'AAPL', personaIds: ['munger'], analysisMode: 'auto', llmSource: 'env',
      includeExternalEvidence: true, warnings: [],
    })).resolves.toBe(job);
    expect(rpc).toHaveBeenCalledWith('enqueue_perspective_generation_job', {
      p_ticker: 'AAPL', p_persona_ids: ['munger'], p_analysis_mode: 'auto', p_llm_source: 'env',
      p_include_external_evidence: true, p_warnings: [],
    });
  });

  it('preserves the atomic quota snapshot returned by the enqueue RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'perspective_quota_exhausted:5:5:free' },
    }));
    await expect(enqueuePerspectiveGenerationJob({ rpc }, {
      ticker: 'AAPL', personaIds: null, analysisMode: 'auto', llmSource: 'env',
      includeExternalEvidence: true, warnings: [],
    })).rejects.toMatchObject({
      code: 'perspective_quota_exhausted',
      quota: { used: 5, limit: 5, plan: 'free' },
    });
  });

  it('loads, cancels, claims, and updates through separate ownership boundaries', async () => {
    const maybeSingle = vi.fn(async () => ({ data: job, error: null }));
    const eqLoad = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq: eqLoad }));
    const maybeSingleUpdate = vi.fn(async () => ({ data: { id: 'job-1' }, error: null }));
    const updateChain: { eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> } = {
      eq: vi.fn(),
      select: vi.fn(() => ({ maybeSingle: maybeSingleUpdate })),
    };
    updateChain.eq.mockReturnValue(updateChain);
    const update = vi.fn(() => updateChain);
    const rpc = vi.fn(async (name: string) => ({ data: name === 'claim_perspective_generation_jobs' ? [job] : job, error: null }));
    const db = { from: vi.fn(() => ({ select, update })), rpc };
    await expect(loadPerspectiveGenerationJob(db, 'job-1')).resolves.toBe(job);
    await expect(cancelPerspectiveGenerationJob(db, 'job-1')).resolves.toBe(job);
    await expect(claimPerspectiveGenerationJobs(db, 50)).resolves.toEqual([job]);
    await expect(updatePerspectiveGenerationJob(db, 'job-1', 'lease-1', { progress: 50 })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('claim_perspective_generation_jobs', {
      p_limit: 5, p_lease_minutes: 5, p_job_id: null,
    });
    expect(update).toHaveBeenCalledWith({ progress: 50 });
    expect(updateChain.eq.mock.calls).toEqual([
      ['id', 'job-1'], ['lease_token', 'lease-1'], ['status', 'running'],
    ]);
  });

  it('reports a lost lease when the guarded update matches no row', async () => {
    const updateChain: { eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> } = {
      eq: vi.fn(),
      select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
    };
    updateChain.eq.mockReturnValue(updateChain);
    const db = { from: vi.fn(() => ({ update: vi.fn(() => updateChain) })) };
    await expect(updatePerspectiveGenerationJob(db, 'job-1', 'expired-lease', { progress: 50 }))
      .resolves.toBe(false);
  });

  it('loads the newest active job for a ticker through the user-scoped client', async () => {
    const maybeSingle = vi.fn(async () => ({ data: job, error: null }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const active = { order };
    const inStatus = vi.fn(() => active);
    const eqTicker = vi.fn(() => ({ in: inStatus }));
    const select = vi.fn(() => ({ eq: eqTicker }));
    const db = { from: vi.fn(() => ({ select })) };

    await expect(loadActivePerspectiveGenerationJob(db, 'AAPL')).resolves.toBe(job);
    expect(eqTicker).toHaveBeenCalledWith('ticker', 'AAPL');
    expect(inStatus).toHaveBeenCalledWith('status', ['queued', 'running']);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('waits for a shared execution to reach a terminal state', async () => {
    const rows = [
      { ...job, status: 'running' },
      { ...job, status: 'succeeded', result: { perspectives: [] } },
    ];
    const maybeSingle = vi.fn(async () => ({ data: rows.shift() ?? null, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const db = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) };
    const delay = vi.fn(async () => undefined);

    await expect(waitForPerspectiveGenerationJob(db, 'job-1', { timeoutMs: 10_000, delay }))
      .resolves.toMatchObject({ status: 'succeeded' });
    expect(delay).toHaveBeenCalledTimes(1);
  });
});
