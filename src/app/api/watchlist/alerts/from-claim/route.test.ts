import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: () => true,
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 30, remaining: 29, retryAfterSeconds: 0,
  })),
}));
vi.mock('@/lib/watchlist/perspective-alert-draft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/watchlist/perspective-alert-draft')>();
  return { ...actual, createPerspectiveAlertDraft: mocks.create };
});

import { POST } from './route';

const itemId = '123e4567-e89b-42d3-a456-426614174000';
const perspectiveId = '223e4567-e89b-42d3-a456-426614174000';

function request(body: Record<string, unknown>) {
  return new Request('https://example.test/api/watchlist/alerts/from-claim', {
    method: 'POST', body: JSON.stringify(body),
  });
}

describe('POST /api/watchlist/alerts/from-claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.create.mockResolvedValue({
      alert: { id: 'alert-1', enabled: false, origin: { claim_id: 'claim_1' } }, error: null,
    });
  });

  it('creates a disabled alert draft for an owned claim', async () => {
    const response = await POST(request({ itemId, perspectiveId, claimId: 'claim_1' }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), {
      itemId, perspectiveId, claimId: 'claim_1', cooldownMinutes: 1440,
    });
    expect(await response.json()).toMatchObject({ alert: { id: 'alert-1', enabled: false } });
  });

  it('rejects malformed identifiers before storage', async () => {
    const response = await POST(request({ itemId: 'bad', perspectiveId, claimId: 'claim_1' }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('maps duplicate claim rules to a conflict', async () => {
    mocks.create.mockResolvedValueOnce({ alert: null, error: { code: '23505', message: 'duplicate' } });
    const response = await POST(request({ itemId, perspectiveId, claimId: 'claim_1' }));
    expect(response.status).toBe(409);
  });
});
