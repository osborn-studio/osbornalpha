import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: () => true,
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0,
  })),
}));
vi.mock('@/lib/watchlist/bulk-workflow-service', () => ({ executeIdempotentWatchlistBulkWorkflow: mocks.execute }));

import { POST } from './route';
import { WatchlistBulkWorkflowRunError } from '@/lib/watchlist/bulk-workflow-run-repository';

describe('POST /api/watchlist/workflows/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.execute.mockResolvedValue({
      requestId: 'request-123', operation: 'research', total: 2,
      succeeded: 1, unchanged: 0, conflicted: 0, failed: 1,
      results: [{ key: 'AAPL', status: 'succeeded' }, { key: 'NVDA', status: 'failed' }],
    });
  });

  it('returns multi-status for partial execution', async () => {
    const response = await POST(new Request('https://example.test/api/watchlist/workflows/bulk', {
      method: 'POST', body: JSON.stringify({ operation: 'research', requestId: 'request-123', tickers: ['AAPL', 'NVDA'] }),
    }));
    expect(response.status).toBe(207);
    expect(response.headers.get('x-request-id')).toBe('request-123');
    expect(mocks.execute).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.objectContaining({ operation: 'research' }));
  });

  it('rejects malformed input before authentication', async () => {
    const response = await POST(new Request('https://example.test/api/watchlist/workflows/bulk', {
      method: 'POST', body: JSON.stringify({ operation: 'research', requestId: 'short', tickers: [] }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('returns a retryable conflict while the same durable request is running', async () => {
    mocks.execute.mockRejectedValueOnce(new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_in_progress'));
    const response = await POST(new Request('https://example.test/api/watchlist/workflows/bulk', {
      method: 'POST', body: JSON.stringify({ operation: 'research', requestId: 'request-123', tickers: ['AAPL'] }),
    }));
    expect(response.status).toBe(409);
    expect(response.headers.get('retry-after')).toBe('2');
    await expect(response.json()).resolves.toMatchObject({
      code: 'watchlist_bulk_workflow_in_progress', requestId: 'request-123', retryable: true,
    });
  });

  it('rejects reuse of a request id for different command content', async () => {
    mocks.execute.mockRejectedValueOnce(new WatchlistBulkWorkflowRunError('watchlist_bulk_workflow_request_conflict'));
    const response = await POST(new Request('https://example.test/api/watchlist/workflows/bulk', {
      method: 'POST', body: JSON.stringify({ operation: 'research', requestId: 'request-123', tickers: ['AAPL'] }),
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'watchlist_bulk_workflow_request_conflict', requestId: 'request-123', retryable: false,
    });
  });
});
