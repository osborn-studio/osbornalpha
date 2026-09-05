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

import {
  beginUsageRun,
  checkQuota,
  finalizeUsageRun,
} from './quota';

function queryBuilder(result: object = { count: 3, error: null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'gte', 'lt', 'in', 'maybeSingle']) {
    builder[method] = vi.fn();
  }
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lt.mockResolvedValue(result);
  builder.in.mockResolvedValue(result);
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
    const jobs = queryBuilder({ count: 1, error: null });
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: vi.fn((table: string) => table === 'profiles' ? profile : table === 'usage_events' ? events : jobs),
    });

    await expect(checkQuota('perspectives')).resolves.toMatchObject({
      allowed: false,
      used: 5,
      limit: 5,
    });

    expect(events.eq).toHaveBeenCalledWith('feature', 'perspectives');
    expect(events.eq).toHaveBeenCalledWith('status', 'completed');
    expect(jobs.eq).toHaveBeenCalledWith('llm_source', 'env');
    expect(jobs.in).toHaveBeenCalledWith('status', ['queued', 'running']);
  });

  it('creates a pending usage run with immutable server-derived identity before spend', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ status: 'pending' }], error: null });
    mocks.getAdminSupabase.mockReturnValue({ rpc });

    await beginUsageRun('user-1', '13a8f7e6-39cc-4c56-a79b-8d9c972f5591', 'perspectives', {
      ticker: 'NVDA',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      pricingVersion: 'pricing-v1',
      usdCnyMicros: 7_200_000,
      byo: false,
    });

    expect(rpc).toHaveBeenCalledWith('begin_usage_run', {
      p_idempotency_key: '13a8f7e6-39cc-4c56-a79b-8d9c972f5591',
      p_user_id: 'user-1',
      p_feature: 'perspectives',
      p_ticker: 'NVDA',
      p_provider: 'deepseek',
      p_model: 'deepseek-v4-flash',
      p_pricing_version: 'pricing-v1',
      p_usd_cny_micros: 7_200_000,
      p_byo: false,
    });
  });

  it('retries usage finalization deterministically and succeeds idempotently', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '08006' } })
      .mockResolvedValueOnce({ data: [{ status: 'completed' }], error: null });
    mocks.getAdminSupabase.mockReturnValue({ rpc });

    await finalizeUsageRun(
      'user-1',
      '13a8f7e6-39cc-4c56-a79b-8d9c972f5591',
      'brief_preview',
      {
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        inputTokens: 100,
        cacheHitInputTokens: 40,
        cacheMissInputTokens: 60,
        outputTokens: 25,
        costMicrormb: 1234,
        pricingVersion: 'pricing-v1',
        usdCnyMicros: 7_200_000,
        usageEstimated: false,
        byo: false,
        status: 'completed',
      },
    );

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('finalize_usage_run', expect.objectContaining({
      p_idempotency_key: '13a8f7e6-39cc-4c56-a79b-8d9c972f5591',
      p_user_id: 'user-1',
      p_feature: 'brief_preview',
      p_status: 'completed',
    }));
  });

  it('fails closed after bounded finalization retries and maps conflicts separately', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '08006' } });
    mocks.getAdminSupabase.mockReturnValue({ rpc });
    const meta = {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 0,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 0,
      outputTokens: 0,
      costMicrormb: 0,
      pricingVersion: 'pricing-v1',
      usdCnyMicros: 7_200_000,
      usageEstimated: true,
      byo: false,
      status: 'failed' as const,
    };

    await expect(finalizeUsageRun('user-1', crypto.randomUUID(), 'copilot', meta))
      .rejects.toThrow('usage_audit_unavailable');
    expect(rpc).toHaveBeenCalledTimes(3);

    rpc.mockReset().mockResolvedValue({ data: null, error: { code: '55000' } });
    await expect(finalizeUsageRun('user-1', crypto.randomUUID(), 'copilot', meta))
      .rejects.toThrow('usage_audit_invariant');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
