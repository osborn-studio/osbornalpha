import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { checkQuota, recordUsage, recordUsageForUser } from './quota';

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

  it('writes trusted aggregate usage through the idempotent service-role RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.getAdminSupabase.mockReturnValue({ rpc });

    await recordUsageForUser(
      'user-1',
      '13a8f7e6-39cc-4c56-a79b-8d9c972f5591',
      'brief_preview',
      {
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
      },
    );

    expect(rpc).toHaveBeenCalledWith('record_usage_event', {
      p_idempotency_key: '13a8f7e6-39cc-4c56-a79b-8d9c972f5591',
      p_user_id: 'user-1',
      p_feature: 'brief_preview',
      p_ticker: 'NVDA',
      p_provider: 'deepseek',
      p_model: 'deepseek-v4-flash',
      p_input_tokens: 100,
      p_cache_hit_input_tokens: 40,
      p_cache_miss_input_tokens: 60,
      p_output_tokens: 25,
      p_cost_micrormb: 1234,
      p_pricing_version: 'pricing-v1',
      p_usd_cny_micros: 7_200_000,
      p_usage_estimated: true,
      p_byo: false,
      p_status: 'failed',
    });
  });
});
