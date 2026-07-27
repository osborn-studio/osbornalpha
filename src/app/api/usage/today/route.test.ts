import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabase: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: mocks.getServerSupabase,
}));

import { GET } from './route';

function countBuilder(count: number) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'gte', 'lt']) builder[method] = vi.fn();
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lt.mockResolvedValue({ count, error: null });
  return builder;
}

describe('GET /api/usage/today status semantics', () => {
  it('counts only completed platform events while keeping all BYO rows informational', async () => {
    const profile = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { plan: 'free', role: 'user', plan_expires_at: null },
        error: null,
      }),
    };
    const featureQueries = [countBuilder(1), countBuilder(2), countBuilder(3)];
    const byoQuery = countBuilder(4);
    let usageQueryIndex = 0;
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profile;
        return [...featureQueries, byoQuery][usageQueryIndex++];
      }),
    });

    const response = await GET();

    expect(response.status).toBe(200);
    for (const query of featureQueries) {
      expect(query.eq).toHaveBeenCalledWith('status', 'completed');
    }
    expect(byoQuery.eq).not.toHaveBeenCalledWith('status', expect.anything());
    expect((await response.json()).byoCalls).toBe(4);
  });
});
