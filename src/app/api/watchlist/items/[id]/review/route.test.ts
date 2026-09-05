import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/decision-service', () => ({ executeWatchlistDecision: mocks.execute }));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/watchlist/items/item-1/review', {
    method: 'POST', body: JSON.stringify(body),
  });
}

describe('POST /api/watchlist/items/[id]/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.execute.mockResolvedValue({ status: 'updated', item: { id: 'item-1', review_at: null, decision_version: 3 } });
  });

  it('completes a review through the existing versioned decision service', async () => {
    const response = await POST(request({ action: 'complete', expectedVersion: 2 }), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(expect.anything(), 'user-1', 'item-1', {
      expectedVersion: 2, patch: { review_at: null },
    });
    expect(await response.json()).toMatchObject({ action: 'complete', item: { decision_version: 3 } });
  });

  it('snoozes to a future date and rejects stale dates', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    const response = await POST(request({ action: 'snooze', expectedVersion: 2, reviewAt: future }), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(expect.anything(), 'user-1', 'item-1', {
      expectedVersion: 2, patch: { review_at: future },
    });
    const invalid = await POST(request({ action: 'snooze', expectedVersion: 2, reviewAt: '2020-01-01' }), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('preserves optimistic concurrency conflicts', async () => {
    mocks.execute.mockResolvedValueOnce({ status: 'conflict', currentItem: { id: 'item-1', decision_version: 4 } });
    const response = await POST(request({ action: 'complete', expectedVersion: 2 }), {
      params: Promise.resolve({ id: 'item-1' }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'watchlist_decision_conflict', currentItem: { decision_version: 4 } });
  });
});
