import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabase: vi.fn(),
  loadActivePerspectiveGenerationJob: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: mocks.getServerSupabase }));
vi.mock('@/lib/stocks/perspective-job-repository', () => ({
  loadActivePerspectiveGenerationJob: mocks.loadActivePerspectiveGenerationJob,
}));

import { GET } from './route';

const job = {
  id: 'e6191ea7-9a32-4f98-9891-7f2bea177cef', ticker: 'AAPL', status: 'running', stage: 'model', progress: 55,
  error_code: null, created_at: '2026-09-04T12:00:00Z', started_at: '2026-09-04T12:00:01Z',
  finished_at: null, next_attempt_at: '2026-09-04T12:00:00Z',
};

describe('/api/perspectives/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    });
    mocks.loadActivePerspectiveGenerationJob.mockResolvedValue(job);
  });

  it('returns the active owned job for a normalized ticker', async () => {
    const response = await GET(new Request('http://localhost/api/perspectives/jobs?ticker=aapl'));
    expect(response.status).toBe(200);
    expect(mocks.loadActivePerspectiveGenerationJob).toHaveBeenCalledWith(expect.anything(), 'AAPL');
    expect(await response.json()).toEqual({ job: {
      id: job.id, ticker: 'AAPL', status: 'running', stage: 'model', progress: 55, errorCode: null,
      createdAt: job.created_at, startedAt: job.started_at, finishedAt: null, nextAttemptAt: job.next_attempt_at,
    } });
  });

  it('returns null when no active job exists', async () => {
    mocks.loadActivePerspectiveGenerationJob.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/perspectives/jobs?ticker=AAPL'));
    expect(await response.json()).toEqual({ job: null });
  });

  it('rejects invalid tickers before authentication', async () => {
    const response = await GET(new Request('http://localhost/api/perspectives/jobs?ticker=%20'));
    expect(response.status).toBe(400);
    expect(mocks.getServerSupabase).not.toHaveBeenCalled();
  });
});
