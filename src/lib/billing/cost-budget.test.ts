import { describe, expect, it } from 'vitest';
import {
  getBudgetConfig,
  reserveCostBudget,
  type BudgetRpcClient,
} from './cost-budget';

type RpcResponse = { data: unknown; error: unknown };

function fakeSupabase(...responses: RpcResponse[]): BudgetRpcClient & { calls: Array<{ fn: string; args: Record<string, unknown> }> } {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return responses.shift() ?? { data: null, error: new Error('unexpected rpc') };
    },
  };
}

const request = {
  feature: 'copilot' as const,
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  estimatedInputTokens: 100_000,
  maxOutputTokens: 9_000,
};

const completeUsage = {
  inputTokens: 100_000,
  cacheHitInputTokens: 0,
  cacheMissInputTokens: 100_000,
  outputTokens: 9_000,
  estimated: false,
};

describe('getBudgetConfig', () => {
  it('uses safe operational defaults', () => {
    expect(getBudgetConfig({})).toEqual({
      dailyLimitMicrormb: 8_800_000,
      usdCnyMicros: 7_200_000,
      reservationTtlSeconds: 300,
    });
  });

  it('accepts positive integer values and rejects malformed, non-positive, and overflowing values', () => {
    expect(getBudgetConfig({
      LLM_DAILY_COST_LIMIT_MICRORMB: '900',
      LLM_USD_CNY_MICROS: '800',
      LLM_RESERVATION_TTL_SECONDS: '60',
    })).toEqual({ dailyLimitMicrormb: 900, usdCnyMicros: 800, reservationTtlSeconds: 60 });

    expect(getBudgetConfig({
      LLM_DAILY_COST_LIMIT_MICRORMB: '0',
      LLM_USD_CNY_MICROS: '-1',
      LLM_RESERVATION_TTL_SECONDS: '9007199254740992',
    })).toEqual({ dailyLimitMicrormb: 8_800_000, usdCnyMicros: 7_200_000, reservationTtlSeconds: 300 });
  });
});

describe('reserveCostBudget', () => {
  it('reserves the conservative priced amount with exact RPC arguments', async () => {
    const supabase = fakeSupabase({
      data: [{ allowed: true, reservation_id: 'reservation-1', used_micrormb: 0, limit_micrormb: 8_800_000 }],
      error: null,
    });

    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    expect(reservation.reservationId).toBe('reservation-1');
    expect(reservation.reservedMicrormb).toBe(118_944);
    expect(supabase.calls).toEqual([{
      fn: 'reserve_llm_daily_budget',
      args: {
        p_user_id: 'user-1',
        p_feature: 'copilot',
        p_provider: 'deepseek',
        p_model: 'deepseek-v4-flash',
        p_requested_micrormb: 118_944,
        p_daily_limit_micrormb: 8_800_000,
        p_ttl_seconds: 300,
      },
    }]);
  });

  it('maps a denied reservation to a stable exhaustion error', async () => {
    const supabase = fakeSupabase({ data: [{ allowed: false }], error: null });

    await expect(reserveCostBudget(supabase, 'user-1', request)).rejects.toThrow('daily_cost_exhausted');
  });

  it('fails closed when the reservation RPC fails or returns a malformed allowed row', async () => {
    await expect(reserveCostBudget(fakeSupabase({ data: null, error: new Error('database detail') }), 'user-1', request))
      .rejects.toThrow('budget_unavailable');
    await expect(reserveCostBudget(fakeSupabase({ data: [{ allowed: true, reservation_id: '' }], error: null }), 'user-1', request))
      .rejects.toThrow('budget_unavailable');
  });

  it('rejects unknown pricing before making an RPC call', async () => {
    const supabase = fakeSupabase();

    await expect(reserveCostBudget(supabase, 'user-1', { ...request, model: 'unreviewed' }))
      .rejects.toThrow('pricing_unavailable');
    expect(supabase.calls).toEqual([]);
  });

  it('settles a complete actual usage amount', async () => {
    const supabase = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'reservation-1' }], error: null },
      { data: [{ state: 'settled' }], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await expect(reservation.settle(completeUsage)).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: false });
    expect(supabase.calls[1]).toEqual({
      fn: 'settle_llm_budget',
      args: { p_reservation_id: 'reservation-1', p_actual_micrormb: 118_944 },
    });
  });

  it('settles the full reservation when provider usage is estimated or incomplete', async () => {
    const supabase = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'reservation-1' }], error: null },
      { data: [{ state: 'settled' }], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await expect(reservation.settle({ ...completeUsage, outputTokens: Number.NaN, estimated: true }))
      .resolves.toEqual({ costMicrormb: 118_944, usageEstimated: true });
    expect(supabase.calls[1]?.args).toEqual({ p_reservation_id: 'reservation-1', p_actual_micrormb: 118_944 });
  });

  it('never sends an actual settlement exceeding the reservation', async () => {
    const supabase = fakeSupabase({ data: [{ allowed: true, reservation_id: 'reservation-1' }], error: null });
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await expect(reservation.settle({ ...completeUsage, outputTokens: 9_001 }))
      .rejects.toThrow('budget_invariant_violation');
    expect(supabase.calls).toHaveLength(1);
  });

  it('settles at most once and returns its first result thereafter', async () => {
    const supabase = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'reservation-1' }], error: null },
      { data: [{ state: 'settled' }], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    const first = await reservation.settle(completeUsage);
    await expect(reservation.settle({ ...completeUsage, outputTokens: 0 })).resolves.toEqual(first);
    expect(supabase.calls).toHaveLength(2);
  });

  it('releases at most once', async () => {
    const supabase = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'reservation-1' }], error: null },
      { data: [{ state: 'released' }], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.release();
    await reservation.release();
    expect(supabase.calls).toHaveLength(2);
    expect(supabase.calls[1]).toEqual({ fn: 'release_llm_budget', args: { p_reservation_id: 'reservation-1' } });
  });

  it('makes terminal cross-calls deterministic', async () => {
    const settled = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'settled-id' }], error: null },
      { data: [{ state: 'settled' }], error: null },
    );
    const settledReservation = await reserveCostBudget(settled, 'user-1', request);
    await settledReservation.settle(completeUsage);
    await expect(settledReservation.release()).resolves.toBeUndefined();
    expect(settled.calls).toHaveLength(2);

    const released = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'released-id' }], error: null },
      { data: [{ state: 'released' }], error: null },
    );
    const releasedReservation = await reserveCostBudget(released, 'user-1', request);
    await releasedReservation.release();
    await expect(releasedReservation.settle(completeUsage)).rejects.toThrow('budget_reservation_released');
    expect(released.calls).toHaveLength(2);
  });

  it('maps settlement and release RPC failures to budget_unavailable without duplicate transitions', async () => {
    const settlementFailure = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'settlement-failure' }], error: null },
      { data: null, error: new Error('raw database message') },
    );
    const settlementReservation = await reserveCostBudget(settlementFailure, 'user-1', request);
    await expect(settlementReservation.settle(completeUsage)).rejects.toThrow('budget_unavailable');
    await expect(settlementReservation.settle(completeUsage)).rejects.toThrow('budget_unavailable');
    expect(settlementFailure.calls).toHaveLength(2);

    const releaseFailure = fakeSupabase(
      { data: [{ allowed: true, reservation_id: 'release-failure' }], error: null },
      { data: null, error: new Error('raw database message') },
    );
    const releaseReservation = await reserveCostBudget(releaseFailure, 'user-1', request);
    await expect(releaseReservation.release()).rejects.toThrow('budget_unavailable');
    await expect(releaseReservation.release()).rejects.toThrow('budget_unavailable');
    expect(releaseFailure.calls).toHaveLength(2);
  });
});
