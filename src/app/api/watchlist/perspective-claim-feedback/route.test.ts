import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), parse: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/api-rate-limit', () => ({
  consumeWatchlistApiRateLimit: vi.fn(async () => ({
    allowed: true, limit: 60, remaining: 59, retryAfterSeconds: 0,
  })),
}));
vi.mock('@/lib/watchlist/perspective-claim-feedback', () => ({
  parsePerspectiveClaimFeedback: mocks.parse,
  savePerspectiveClaimFeedback: mocks.save,
  deletePerspectiveClaimFeedback: mocks.remove,
}));

import { DELETE, POST } from './route';

const input = {
  perspectiveId: '123e4567-e89b-42d3-a456-426614174000',
  claimId: 'claim_1', verdict: 'unsupported' as const, reason: null,
};

describe('/api/watchlist/perspective-claim-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.parse.mockReturnValue(input);
    mocks.save.mockResolvedValue({ perspective_id: input.perspectiveId, claim_id: input.claimId, verdict: input.verdict });
    mocks.remove.mockResolvedValue(undefined);
  });

  it('saves claim-scoped feedback for an authenticated owner', async () => {
    const response = await POST(new Request('http://localhost/api/watchlist/perspective-claim-feedback', {
      method: 'POST', body: JSON.stringify(input),
    }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), 'user-1', input);
  });

  it('maps a missing claim to 404', async () => {
    mocks.save.mockRejectedValue(new Error('perspective_claim_not_found'));
    const response = await POST(new Request('http://localhost/api/watchlist/perspective-claim-feedback', { method: 'POST' }));
    expect(response.status).toBe(404);
  });

  it('deletes with both identifiers and fails closed without a user', async () => {
    const url = `http://localhost/api/watchlist/perspective-claim-feedback?perspectiveId=${input.perspectiveId}&claimId=${input.claimId}`;
    const response = await DELETE(new Request(url, { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), 'user-1', input.perspectiveId, input.claimId);
    mocks.auth.mockResolvedValue({ data: { user: null } });
    expect((await DELETE(new Request(url, { method: 'DELETE' }))).status).toBe(401);
  });
});
