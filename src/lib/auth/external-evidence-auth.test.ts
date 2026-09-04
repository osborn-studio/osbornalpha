import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  getServerSupabase: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: mocks.configured,
  getServerSupabase: mocks.getServerSupabase,
}));

import { authorizeExternalEvidenceRequest } from './external-evidence-auth';

describe('external evidence API authorization', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('allows authenticated users', async () => {
    mocks.configured.mockReturnValue(true);
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    };
    mocks.getServerSupabase.mockResolvedValue(client);
    await expect(authorizeExternalEvidenceRequest()).resolves.toEqual({ ok: true, userId: 'u1', client });
  });

  it('rejects missing sessions', async () => {
    mocks.configured.mockReturnValue(true);
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    await expect(authorizeExternalEvidenceRequest()).resolves.toEqual({ ok: false, status: 401, error: 'not_authenticated' });
  });

  it('fails closed in production when auth storage is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.configured.mockReturnValue(false);
    await expect(authorizeExternalEvidenceRequest()).resolves.toEqual({ ok: false, status: 503, error: 'authentication_unavailable' });
  });
});
