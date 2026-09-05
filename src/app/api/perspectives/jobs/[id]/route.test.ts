import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabase: vi.fn(),
  loadPerspectiveGenerationJob: vi.fn(),
  cancelPerspectiveGenerationJob: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: mocks.getServerSupabase }));
vi.mock('@/lib/stocks/perspective-job-repository', () => ({
  loadPerspectiveGenerationJob: mocks.loadPerspectiveGenerationJob,
  cancelPerspectiveGenerationJob: mocks.cancelPerspectiveGenerationJob,
}));

import { DELETE, GET } from './route';

const id = 'e6191ea7-9a32-4f98-9891-7f2bea177cef';
const context = { params: Promise.resolve({ id }) };
const job = {
  id, ticker: 'AAPL', status: 'running', stage: 'model', progress: 55, error_code: null,
  created_at: '2026-09-04T12:00:00Z', started_at: '2026-09-04T12:00:01Z',
  finished_at: null, next_attempt_at: '2026-09-04T12:00:00Z',
};

describe('/api/perspectives/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    });
    mocks.loadPerspectiveGenerationJob.mockResolvedValue(job);
    mocks.cancelPerspectiveGenerationJob.mockResolvedValue({ ...job, cancel_requested_at: '2026-09-04T12:01:00Z' });
  });

  it('returns only the owned public job contract', async () => {
    const response = await GET(new Request(`http://localhost/api/perspectives/jobs/${id}`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job: {
      id, ticker: 'AAPL', status: 'running', stage: 'model', progress: 55, errorCode: null,
      createdAt: '2026-09-04T12:00:00Z', startedAt: '2026-09-04T12:00:01Z',
      finishedAt: null, nextAttemptAt: '2026-09-04T12:00:00Z',
    } });
  });

  it('cancels through the ownership-scoped RPC', async () => {
    const response = await DELETE(new Request(`http://localhost/api/perspectives/jobs/${id}`, { method: 'DELETE' }), context);
    expect(response.status).toBe(200);
    expect(mocks.cancelPerspectiveGenerationJob).toHaveBeenCalledWith(expect.anything(), id);
  });

  it('rejects malformed ids before database work', async () => {
    const response = await GET(new Request('http://localhost/api/perspectives/jobs/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(response.status).toBe(400);
    expect(mocks.getServerSupabase).not.toHaveBeenCalled();
  });
});
