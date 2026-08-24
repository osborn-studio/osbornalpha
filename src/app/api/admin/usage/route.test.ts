import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AdminUnauthenticated extends Error {}
  class AdminForbidden extends Error {}
  return {
    AdminUnauthenticated,
    AdminForbidden,
    requireAdminUser: vi.fn(),
    getAdminSupabase: vi.fn(),
  };
});

vi.mock('@/lib/admin/auth', () => ({
  AdminUnauthenticated: mocks.AdminUnauthenticated,
  AdminForbidden: mocks.AdminForbidden,
  requireAdminUser: mocks.requireAdminUser,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

import { GET } from './route';

describe('GET /api/admin/usage access boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 without constructing a service-role client when unauthenticated', async () => {
    mocks.requireAdminUser.mockRejectedValue(new mocks.AdminUnauthenticated());

    const response = await GET(new Request('https://example.test/api/admin/usage'));

    expect(response.status).toBe(401);
    expect(mocks.getAdminSupabase).not.toHaveBeenCalled();
  });

  it('returns 403 without constructing a service-role client for non-admin users', async () => {
    mocks.requireAdminUser.mockRejectedValue(new mocks.AdminForbidden());

    const response = await GET(new Request('https://example.test/api/admin/usage'));

    expect(response.status).toBe(403);
    expect(mocks.getAdminSupabase).not.toHaveBeenCalled();
  });
});
