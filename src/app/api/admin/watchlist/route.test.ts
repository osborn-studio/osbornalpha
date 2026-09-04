import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminForbidden, AdminUnauthenticated } from '@/lib/admin/auth';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn() }));
vi.mock('@/lib/admin/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/admin/auth')>(),
  requireAdminUser: mocks.requireAdmin,
}));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));

import { GET } from './route';

describe('admin watchlist operations route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated and non-admin sessions before constructing the admin client', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated());
    expect((await GET()).status).toBe(401);
    mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden());
    expect((await GET()).status).toBe(403);
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });
});
