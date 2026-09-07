import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), apply: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0,
  })),
}));
vi.mock('@/lib/watchlist/bulk-tags-repository', () => ({ applyBulkTagCommand: mocks.apply }));

import { PATCH } from './route';

const validBody = {
  items: [{ id: '550e8400-e29b-41d4-a716-446655440000', expectedVersion: 2 }],
  tag: 'core', mode: 'add',
};

describe('PATCH /api/watchlist/items/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.apply.mockResolvedValue({ data: [{ id: validBody.items[0].id, tags: ['core'] }], error: null });
  });

  it('applies a validated tag command through the transactional repository', async () => {
    const response = await PATCH(new Request('http://localhost/api/watchlist/items/bulk', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validBody),
    }));
    expect(response.status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(expect.anything(), {
      items: [{ id: validBody.items[0].id, expected_version: 2 }], tag: 'core', mode: 'add',
    });
  });

  it('rejects malformed input before entering the repository', async () => {
    const response = await PATCH(new Request('http://localhost/api/watchlist/items/bulk', {
      method: 'PATCH', body: JSON.stringify({ ...validBody, tag: '' }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it('maps an optimistic concurrency conflict to 409', async () => {
    mocks.apply.mockResolvedValue({ data: null, error: { code: '40001', message: 'watchlist_decision_conflict' } });
    const response = await PATCH(new Request('http://localhost/api/watchlist/items/bulk', {
      method: 'PATCH', body: JSON.stringify(validBody),
    }));
    expect(response.status).toBe(409);
  });
});
