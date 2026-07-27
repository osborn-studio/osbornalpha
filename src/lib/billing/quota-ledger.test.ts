import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSupabase: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: mocks.getServerSupabase,
}));

import { checkQuota, recordUsage } from './quota';

function queryBuilder(result: object = { count: 3, error: null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'gte', 'lt', 'maybeSingle']) {
    builder[method] = vi.fn();
  }
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lt.mockResolvedValue(result);
  builder.maybeSingle.mockResolvedValue({
    data: { plan: 'free', role: 'user', plan_expires_at: null },
    error: null,
  });
  return builder;
}

describe('usage ledger count and audit fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts only completed non-BYO events toward quota', async () => {
    const profile = queryBuilder();
    const events = queryBuilder();
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : events),
    });

    await expect(checkQuota('copilot')).resolves.toMatchObject({ used: 3, limit: 20 });

    expect(events.eq).toHaveBeenCalledWith('byo', false);
    expect(events.eq).toHaveBeenCalledWith('status', 'completed');
  });

  it('applies completed-only counting to perspectives so failed audits do not consume its 5-call limit', async () => {
    const profile = queryBuilder();
    const events = queryBuilder({ count: 4, error: null });
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : events),
    });

    await expect(checkQuota('perspectives')).resolves.toMatchObject({
      allowed: true,
      used: 4,
      limit: 5,
    });

    expect(events.eq).toHaveBeenCalledWith('feature', 'perspectives');
    expect(events.eq).toHaveBeenCalledWith('status', 'completed');
  });

  it('persists normalized audit fields and compatible legacy token totals', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn(() => ({ insert })),
    });

    await recordUsage('copilot', {
      ticker: 'NVDA',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 100,
      cacheHitInputTokens: 40,
      cacheMissInputTokens: 60,
      outputTokens: 25,
      costMicrormb: 1234,
      pricingVersion: 'pricing-v1',
      usdCnyMicros: 7_200_000,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      feature: 'copilot',
      ticker: 'NVDA',
      tokens_in: 100,
      tokens_out: 25,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      input_tokens: 100,
      cache_hit_input_tokens: 40,
      cache_miss_input_tokens: 60,
      output_tokens: 25,
      cost_micrormb: 1234,
      pricing_version: 'pricing-v1',
      usd_cny_micros: 7_200_000,
      usage_estimated: true,
      byo: false,
      status: 'failed',
    });
  });
});
