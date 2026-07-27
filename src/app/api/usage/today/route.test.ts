import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabase: vi.fn(),
  getAdminSupabase: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: mocks.getServerSupabase,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

import { GET } from './route';

function countBuilder(count: number) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lt']) builder[method] = vi.fn();
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lt.mockResolvedValue({ count, error: null });
  return builder;
}

describe('GET /api/usage/today status semantics', () => {
  it('counts only completed platform events while keeping completed and failed BYO rows informational', async () => {
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
    const costQuery = {
      select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(),
    };
    costQuery.select.mockReturnValue(costQuery);
    costQuery.eq.mockReturnValue(costQuery);
    costQuery.gte.mockReturnValue(costQuery);
    costQuery.lt.mockResolvedValue({ data: [], error: null });
    let usageQueryIndex = 0;
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return profile;
        return [...featureQueries, byoQuery][usageQueryIndex++];
      }),
    });
    mocks.getAdminSupabase.mockReturnValue({ from: vi.fn(() => costQuery) });

    const response = await GET();

    expect(response.status).toBe(200);
    for (const query of featureQueries) {
      expect(query.eq).toHaveBeenCalledWith('status', 'completed');
    }
    expect(byoQuery.in).toHaveBeenCalledWith('status', ['completed', 'failed']);
    expect((await response.json()).byoCalls).toBe(4);
  });

  it('counts one completed mixed-provider row as platform usage and not as a BYO call', async () => {
    const rows = [{
      user_id: 'user-1',
      feature: 'copilot',
      byo: false,
      status: 'completed',
      created_at: new Date().toISOString(),
      provider: 'mixed',
      model: 'byo-model+deepseek-v4-flash',
    }];
    const profile = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { plan: 'free', role: 'user', plan_expires_at: null },
        error: null,
      }),
    };
    function filteringBuilder() {
      let filtered = rows;
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        gte: vi.fn(),
        lt: vi.fn(),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockImplementation((field: string, value: unknown) => {
        filtered = filtered.filter((row) => row[field as keyof typeof row] === value);
        return builder;
      });
      builder.in.mockImplementation((field: string, values: unknown[]) => {
        filtered = filtered.filter((row) => values.includes(row[field as keyof typeof row]));
        return builder;
      });
      builder.gte.mockReturnValue(builder);
      builder.lt.mockImplementation(async () => ({ count: filtered.length, error: null }));
      return builder;
    }
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : filteringBuilder()),
    });
    mocks.getAdminSupabase.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(), lt: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    });

    const response = await GET();
    const body = await response.json();

    expect(body.usage.copilot.used).toBe(1);
    expect(body.byoCalls).toBe(0);
  });

  it('counts completed and failed BYO runs but excludes pending runs', async () => {
    const rows = [
      { user_id: 'user-1', feature: 'copilot', byo: true, status: 'completed', created_at: new Date().toISOString() },
      { user_id: 'user-1', feature: 'copilot', byo: true, status: 'failed', created_at: new Date().toISOString() },
      { user_id: 'user-1', feature: 'copilot', byo: true, status: 'pending', created_at: new Date().toISOString() },
    ];
    const profile = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { plan: 'free', role: 'user', plan_expires_at: null }, error: null }),
    };
    function filteringBuilder() {
      let filtered = rows;
      const builder = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lt: vi.fn() };
      builder.select.mockReturnValue(builder);
      builder.eq.mockImplementation((field: string, value: unknown) => {
        filtered = filtered.filter((row) => row[field as keyof typeof row] === value);
        return builder;
      });
      builder.in.mockImplementation((field: string, values: unknown[]) => {
        filtered = filtered.filter((row) => values.includes(row[field as keyof typeof row]));
        return builder;
      });
      builder.gte.mockReturnValue(builder);
      builder.lt.mockImplementation(async () => ({ count: filtered.length, error: null }));
      return builder;
    }
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : filteringBuilder()),
    });
    mocks.getAdminSupabase.mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    });

    const response = await GET();

    expect((await response.json()).byoCalls).toBe(2);
  });

  it('sanitizes returned reservation-ledger errors and scopes the query to the authenticated user', async () => {
    const profile = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { plan: 'free', role: 'user', plan_expires_at: null }, error: null }),
    };
    const costQuery = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn() };
    costQuery.select.mockReturnValue(costQuery);
    costQuery.eq.mockReturnValue(costQuery);
    costQuery.gte.mockReturnValue(costQuery);
    costQuery.lt.mockResolvedValue({ data: null, error: { message: 'password=super-secret' } });
    const queries = [countBuilder(0), countBuilder(0), countBuilder(0), countBuilder(0)];
    let index = 0;
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-authenticated' } } }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : queries[index++]),
    });
    mocks.getAdminSupabase.mockReturnValue({ from: vi.fn(() => costQuery) });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'Usage cost unavailable' });
    expect(JSON.stringify(body)).not.toContain('super-secret');
    expect(costQuery.eq).toHaveBeenCalledWith('user_id', 'user-authenticated');
  });

  it('sanitizes thrown reservation-ledger errors', async () => {
    const profile = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { plan: 'free', role: 'user', plan_expires_at: null }, error: null }),
    };
    const queries = [countBuilder(0), countBuilder(0), countBuilder(0), countBuilder(0)];
    let index = 0;
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : queries[index++]),
    });
    mocks.getAdminSupabase.mockImplementation(() => { throw new Error('database token=secret'); });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'Usage cost unavailable' });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('reports settled spend plus active reserved/incurred spend, without released or expired reservations', async () => {
    const profile = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { plan: 'pro', role: 'user', plan_expires_at: null }, error: null,
      }),
    };
    const now = Date.now();
    const costRows = [
      { status: 'settled', settled_micrormb: 1_200_000, reserved_micrormb: 1_500_000, cap_exempt: false, expires_at: new Date(now - 1).toISOString() },
      { status: 'incurred', settled_micrormb: null, reserved_micrormb: 2_300_000, cap_exempt: false, expires_at: new Date(now - 1).toISOString() },
      { status: 'reserved', settled_micrormb: null, reserved_micrormb: 800_000, cap_exempt: false, expires_at: new Date(now + 60_000).toISOString() },
      { status: 'released', settled_micrormb: null, reserved_micrormb: 9_000_000, cap_exempt: false, expires_at: new Date(now + 60_000).toISOString() },
      { status: 'reserved', settled_micrormb: null, reserved_micrormb: 7_000_000, cap_exempt: false, expires_at: new Date(now - 1).toISOString() },
    ];
    const costQuery = {
      select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(),
    };
    costQuery.select.mockReturnValue(costQuery);
    costQuery.eq.mockReturnValue(costQuery);
    costQuery.gte.mockReturnValue(costQuery);
    costQuery.lt.mockResolvedValue({ data: costRows, error: null });
    const queries = [countBuilder(0), countBuilder(0), countBuilder(0), countBuilder(0)];
    let index = 0;
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : queries[index++]),
    });
    mocks.getAdminSupabase.mockReturnValue({ from: vi.fn(() => costQuery) });

    const response = await GET();
    const body = await response.json();

    expect(body.cost).toEqual({
      usedMicrormb: 4_300_000,
      capUsedMicrormb: 4_300_000,
      limitMicrormb: 8_800_000,
      currency: 'CNY',
    });
  });

  it('includes cap-exempt admin cost in displayed spend, keeps non-exempt cap-used, and still counts completed runs', async () => {
    const profile = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { plan: 'pro', role: 'admin', plan_expires_at: null }, error: null,
      }),
    };
    const costQuery = {
      select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn(),
    };
    costQuery.select.mockReturnValue(costQuery);
    costQuery.eq.mockReturnValue(costQuery);
    costQuery.gte.mockReturnValue(costQuery);
    costQuery.lt.mockResolvedValue({ data: [
      { status: 'settled', settled_micrormb: 3_000_000, reserved_micrormb: 3_000_000, cap_exempt: true, expires_at: null },
      { status: 'incurred', settled_micrormb: null, reserved_micrormb: 500_000, cap_exempt: false, expires_at: null },
    ], error: null });
    const queries = [countBuilder(7), countBuilder(6), countBuilder(5), countBuilder(4)];
    let index = 0;
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : queries[index++]),
    });
    mocks.getAdminSupabase.mockReturnValue({ from: vi.fn(() => costQuery) });

    const response = await GET();
    const body = await response.json();

    expect(body.cost).toEqual({
      usedMicrormb: 3_500_000,
      capUsedMicrormb: 500_000,
      limitMicrormb: -1,
      currency: 'CNY',
    });
    expect(body.usage).toEqual({
      copilot: { used: 7, limit: -1 },
      perspectives: { used: 6, limit: -1 },
      brief_preview: { used: 5, limit: -1 },
    });
    expect(body.byoCalls).toBe(4);
    for (const query of queries.slice(0, 3)) {
      expect(query.eq).toHaveBeenCalledWith('status', 'completed');
    }
    expect(queries[3].in).toHaveBeenCalledWith('status', ['completed', 'failed']);
  });

  it('queries the reservation ledger inside the Beijing calendar-day boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T16:01:00.000Z')); // 00:01 on 29 July in Beijing
    try {
      const profile = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { plan: 'free', role: 'user', plan_expires_at: null }, error: null,
        }),
      };
      const costQuery = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn() };
      costQuery.select.mockReturnValue(costQuery);
      costQuery.eq.mockReturnValue(costQuery);
      costQuery.gte.mockReturnValue(costQuery);
      costQuery.lt.mockResolvedValue({ data: [], error: null });
      const queries = [countBuilder(0), countBuilder(0), countBuilder(0), countBuilder(0)];
      let index = 0;
      mocks.getServerSupabase.mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
        from: vi.fn((table: string) => table === 'profiles' ? profile : queries[index++]),
      });
      mocks.getAdminSupabase.mockReturnValue({ from: vi.fn(() => costQuery) });

      const response = await GET();

      expect(response.status).toBe(200);
      expect(costQuery.gte).toHaveBeenCalledWith('created_at', '2026-07-28T16:00:00.000Z');
      expect(costQuery.lt).toHaveBeenCalledWith('created_at', '2026-07-29T16:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});
