import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), getAdmin: vi.fn() }));
vi.mock('@/lib/admin/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/admin/auth')>();
  return { ...original, requireAdminUser: mocks.requireAdmin };
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdmin }));

import { AdminUnauthenticated } from '@/lib/admin/auth';
import { GET } from './route';

describe('GET /api/admin/dq', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 before constructing the admin client', async () => {
    mocks.requireAdmin.mockRejectedValue(new AdminUnauthenticated());
    expect((await GET(new Request('https://alpha.example/api/admin/dq'))).status).toBe(401);
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });

  it('rejects control characters in the dataset filter', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
    const res = await GET(new Request('https://alpha.example/api/admin/dq?dataset=a%00b'));
    expect(res.status).toBe(400);
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });

  it('logs the server error and returns a generic 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
    mocks.getAdmin.mockImplementation(() => { throw new Error('no service role key'); });
    const res = await GET(new Request('https://alpha.example/api/admin/dq'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'dq dashboard unavailable' });
    expect(spy).toHaveBeenCalledWith('[admin/dq]', 'no service role key');
    spy.mockRestore();
  });
});
