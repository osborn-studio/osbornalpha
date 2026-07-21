import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn() }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));

import { AdminForbidden, AdminUnauthenticated } from '@/lib/admin/auth';
import { GET } from './route';

describe('GET /api/admin/securities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 before constructing the admin client', async () => {
    mocks.requireAdmin.mockRejectedValue(new AdminUnauthenticated());
    expect((await GET()).status).toBe(401);
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 before constructing the admin client', async () => {
    mocks.requireAdmin.mockRejectedValue(new AdminForbidden());
    expect((await GET()).status).toBe(403);
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });
});
