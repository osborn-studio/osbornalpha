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

  it('limits the membership query to security-master scopes before applying its row cap', async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), data: [] };
    mocks.requireAdmin.mockResolvedValueOnce({});
    mocks.getAdmin.mockReturnValueOnce({ from: () => query });

    expect((await GET()).status).toBe(200);
    expect(query.in).toHaveBeenCalledWith('universe', [
      'a_stock', 'a_exchange_fund', 'a_cb', 'hk_main', 'sp500', 'nasdaq_top500', 'us_china',
    ]);
  });

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
