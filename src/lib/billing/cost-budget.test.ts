import { describe, expect, it } from 'vitest';
import type { getServerSupabase } from '@/lib/supabase/server';
import {
  getBudgetConfig,
  reserveCostBudget,
  type BudgetRpcAdapter,
} from './cost-budget';

type RpcResponse = { data: unknown; error: unknown };
type Assert<T extends true> = T;
type ServerSupabase = Awaited<ReturnType<typeof getServerSupabase>>;
type _ServerSupabaseCanReserve = Assert<
  ServerSupabase extends Parameters<typeof reserveCostBudget>[0] ? true : false
>;

function fakeSupabase(...responses: RpcResponse[]): BudgetRpcAdapter & { calls: Array<{ fn: string; args: unknown }> } {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const respond = async (fn: string, args: unknown): Promise<RpcResponse> => {
    calls.push({ fn, args });
    return responses.shift() ?? { data: null, error: new Error('unexpected rpc') };
  };
  return {
    calls,
    reserve: (args) => respond('reserve_llm_daily_budget', args),
    markIncurred: (args) => respond('mark_llm_budget_incurred', args),
    settle: (args) => respond('settle_llm_budget', args),
    finalizeIncurred: (args) => respond('finalize_llm_budget_incurred', args),
    release: (args) => respond('release_llm_budget', args),
  };
}

const request = {
  feature: 'copilot' as const,
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  maxInputTokens: 100_000,
  maxOutputTokens: 9_000,
};

const completeUsage = {
  inputTokens: 100_000,
  cacheHitInputTokens: 0,
  cacheMissInputTokens: 100_000,
  outputTokens: 9_000,
  estimated: false,
};

const conservativeMarkArgs = {
  p_reservation_id: 'reservation-1',
  p_input_tokens: 100_000,
  p_cache_hit_input_tokens: 0,
  p_cache_miss_input_tokens: 100_000,
  p_output_tokens: 9_000,
  p_pricing_version: 'deepseek-2026-04-24',
  p_usd_cny_micros: 7_200_000,
  p_usage_estimated: true,
};

function terminalRow(
  reservationId: string,
  status: 'incurred' | 'settled' | 'released',
  settledMicrormb: number | null = status === 'settled' ? 118_944 : null,
) {
  return {
    reservation_id: reservationId,
    user_id: 'user-1',
    feature: 'copilot',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    reserved_micrormb: 118_944,
    settled_micrormb: settledMicrormb,
    status,
    expires_at: '2026-07-28T00:05:00.000Z',
    created_at: '2026-07-28T00:00:00.000Z',
    settled_at: status === 'settled' ? '2026-07-28T00:01:00.000Z' : null,
  };
}

function reservationRow(reservationId = 'reservation-1', allowed = true) {
  return {
    allowed,
    reservation_id: allowed ? reservationId : null,
    used_micrormb: allowed ? 0 : 8_800_000,
    limit_micrormb: 8_800_000,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

  it('limits reservation TTL to the PostgreSQL function range', () => {
    expect(getBudgetConfig({ LLM_RESERVATION_TTL_SECONDS: '86400' }).reservationTtlSeconds).toBe(86400);
    for (const value of ['86401', '2147483648', '9007199254740992']) {
      expect(getBudgetConfig({ LLM_RESERVATION_TTL_SECONDS: value }).reservationTtlSeconds).toBe(300);
    }
  });
});

describe('reserveCostBudget', () => {
  it('reserves the conservative priced amount with exact RPC arguments', async () => {
    const supabase = fakeSupabase({
      data: [reservationRow()],
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
    const supabase = fakeSupabase({ data: [reservationRow('unused', false)], error: null });

    await expect(reserveCostBudget(supabase, 'user-1', request)).rejects.toThrow('daily_cost_exhausted');
  });

  it('fails closed when the reservation RPC fails or returns a malformed allowed row', async () => {
    await expect(reserveCostBudget(fakeSupabase({ data: null, error: new Error('database detail') }), 'user-1', request))
      .rejects.toThrow('budget_unavailable');
    await expect(reserveCostBudget(fakeSupabase({ data: [{ allowed: true, reservation_id: '' }], error: null }), 'user-1', request))
      .rejects.toThrow('budget_unavailable');
  });

  it('requires one complete reservation tuple with consistent limits', async () => {
    const malformedRows = [
      [],
      [reservationRow(), reservationRow('another')],
      [{ ...reservationRow(), used_micrormb: -1 }],
      [{ ...reservationRow(), limit_micrormb: 1 }],
      [{ ...reservationRow(), used_micrormb: 8_800_000 }],
      [{ ...reservationRow(), reservation_id: null }],
    ];

    for (const data of malformedRows) {
      await expect(reserveCostBudget(fakeSupabase({ data, error: null }), 'user-1', request))
        .rejects.toThrow('budget_unavailable');
    }
  });

  it('rejects unknown pricing before making an RPC call', async () => {
    const supabase = fakeSupabase();

    await expect(reserveCostBudget(supabase, 'user-1', { ...request, model: 'unreviewed' }))
      .rejects.toThrow('pricing_unavailable');
    expect(supabase.calls).toEqual([]);
  });

  it('settles a complete actual usage amount', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
      { data: [terminalRow('reservation-1', 'settled')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    await expect(reservation.settle(completeUsage)).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: false });
    expect(supabase.calls[1]).toEqual({
      fn: 'mark_llm_budget_incurred',
      args: conservativeMarkArgs,
    });
    expect(supabase.calls[2]).toEqual({
      fn: 'settle_llm_budget',
      args: {
        p_reservation_id: 'reservation-1',
        p_actual_micrormb: 118_944,
        p_input_tokens: 100_000,
        p_cache_hit_input_tokens: 0,
        p_cache_miss_input_tokens: 100_000,
        p_output_tokens: 9_000,
        p_pricing_version: 'deepseek-2026-04-24',
        p_usd_cny_micros: 7_200_000,
        p_usage_estimated: false,
      },
    });
  });

  it('durably finalizes conservative usage when incurred provider usage is unavailable', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    await reservation.finalizeIncurred();

    expect(supabase.calls[2]).toEqual({
      fn: 'finalize_llm_budget_incurred',
      args: {
        p_reservation_id: 'reservation-1',
        p_input_tokens: 100_000,
        p_cache_hit_input_tokens: 0,
        p_cache_miss_input_tokens: 100_000,
        p_output_tokens: 9_000,
        p_pricing_version: 'deepseek-2026-04-24',
        p_usd_cny_micros: 7_200_000,
        p_usage_estimated: true,
      },
    });
  });

  it('rejects settlement before a successful incurred mark without calling the settle RPC', async () => {
    const supabase = fakeSupabase({ data: [reservationRow()], error: null });
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await expect(reservation.settle(completeUsage)).rejects.toThrow('budget_invariant_violation');
    expect(supabase.calls).toEqual([
      expect.objectContaining({ fn: 'reserve_llm_daily_budget' }),
    ]);
  });

  it('marks incurred at most once and never permits release afterward', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    await reservation.markIncurred();
    await expect(reservation.release()).rejects.toThrow('budget_reservation_incurred');

    expect(supabase.calls).toEqual([
      expect.objectContaining({ fn: 'reserve_llm_daily_budget' }),
      {
        fn: 'mark_llm_budget_incurred',
        args: conservativeMarkArgs,
      },
    ]);
  });

  it('maps mark-incurred RPC failures to budget_unavailable and permits retry before spend', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: null, error: new Error('raw database message') },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await expect(reservation.markIncurred()).rejects.toThrow('budget_unavailable');
    await expect(reservation.markIncurred()).resolves.toBeUndefined();
    expect(supabase.calls).toHaveLength(3);
  });

  it('settles the full reservation when provider usage is estimated or incomplete', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
      { data: [terminalRow('reservation-1', 'settled')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    await expect(reservation.settle({ ...completeUsage, outputTokens: Number.NaN, estimated: true }))
      .resolves.toEqual({ costMicrormb: 118_944, usageEstimated: true });
    expect(supabase.calls[2]?.args).toEqual(expect.objectContaining({
      p_reservation_id: 'reservation-1',
      p_actual_micrormb: 118_944,
      p_input_tokens: 100_000,
      p_cache_hit_input_tokens: 0,
      p_cache_miss_input_tokens: 100_000,
      p_output_tokens: 9_000,
      p_usage_estimated: true,
    }));
  });

  it('retains the reservation for contradictory cache usage even when marked real', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
      { data: [terminalRow('reservation-1', 'settled')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    await expect(reservation.settle({
      ...completeUsage,
      inputTokens: 0,
      cacheHitInputTokens: 1_000,
      cacheMissInputTokens: 0,
      estimated: false,
    })).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: true });
    expect(supabase.calls[2]?.args).toEqual(expect.objectContaining({
      p_reservation_id: 'reservation-1',
      p_actual_micrormb: 118_944,
      p_input_tokens: 100_000,
      p_cache_hit_input_tokens: 0,
      p_cache_miss_input_tokens: 100_000,
      p_output_tokens: 9_000,
      p_usage_estimated: true,
    }));
  });

  it('never sends an actual settlement exceeding the reservation', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    await expect(reservation.settle({ ...completeUsage, outputTokens: 9_001 }))
      .rejects.toThrow('budget_invariant_violation');
    expect(supabase.calls).toHaveLength(2);
  });

  it('settles at most once and returns its first result thereafter', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'incurred')], error: null },
      { data: [terminalRow('reservation-1', 'settled')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    const first = await reservation.settle(completeUsage);
    await expect(reservation.settle({ ...completeUsage, outputTokens: 0 })).resolves.toEqual(first);
    expect(supabase.calls).toHaveLength(3);
  });

  it('releases at most once', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'released')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.release();
    await reservation.release();
    expect(supabase.calls).toHaveLength(2);
    expect(supabase.calls[1]).toEqual({ fn: 'release_llm_budget', args: { p_reservation_id: 'reservation-1' } });
  });

  it('makes terminal cross-calls deterministic', async () => {
    const settled = fakeSupabase(
      { data: [reservationRow('settled-id')], error: null },
      { data: [terminalRow('settled-id', 'incurred')], error: null },
      { data: [terminalRow('settled-id', 'settled')], error: null },
    );
    const settledReservation = await reserveCostBudget(settled, 'user-1', request);
    await settledReservation.markIncurred();
    await settledReservation.settle(completeUsage);
    await expect(settledReservation.release()).resolves.toBeUndefined();
    expect(settled.calls).toHaveLength(3);

    const released = fakeSupabase(
      { data: [reservationRow('released-id')], error: null },
      { data: [terminalRow('released-id', 'released')], error: null },
    );
    const releasedReservation = await reserveCostBudget(released, 'user-1', request);
    await releasedReservation.release();
    await expect(releasedReservation.settle(completeUsage)).rejects.toThrow('budget_reservation_released');
    expect(released.calls).toHaveLength(2);
  });

  it('maps settlement and release RPC failures to budget_unavailable while allowing retry', async () => {
    const settlementFailure = fakeSupabase(
      { data: [reservationRow('settlement-failure')], error: null },
      { data: [terminalRow('settlement-failure', 'incurred')], error: null },
      { data: null, error: new Error('raw database message') },
      { data: [terminalRow('settlement-failure', 'settled')], error: null },
    );
    const settlementReservation = await reserveCostBudget(settlementFailure, 'user-1', request);
    await settlementReservation.markIncurred();
    await expect(settlementReservation.settle(completeUsage)).rejects.toThrow('budget_unavailable');
    await expect(settlementReservation.settle(completeUsage)).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: false });
    expect(settlementFailure.calls).toHaveLength(4);

    const releaseFailure = fakeSupabase(
      { data: [reservationRow('release-failure')], error: null },
      { data: null, error: new Error('raw database message') },
      { data: [terminalRow('release-failure', 'released')], error: null },
    );
    const releaseReservation = await reserveCostBudget(releaseFailure, 'user-1', request);
    await expect(releaseReservation.release()).rejects.toThrow('budget_unavailable');
    await expect(releaseReservation.release()).resolves.toBeUndefined();
    expect(releaseFailure.calls).toHaveLength(3);
  });

  it('rejects malformed settlement responses and permits a later retry', async () => {
    const cases = [
      null,
      [],
      [terminalRow('reservation-1', 'settled'), terminalRow('reservation-1', 'settled')],
      [{ reservation_id: 'reservation-1', status: 'settled', settled_micrormb: null }],
      [terminalRow('other-reservation', 'settled')],
      [terminalRow('reservation-1', 'released')],
      [terminalRow('reservation-1', 'settled', 1)],
      [{ ...terminalRow('reservation-1', 'settled'), user_id: 'other-user' }],
      [{ ...terminalRow('reservation-1', 'settled'), reserved_micrormb: 1 }],
      [{ ...terminalRow('reservation-1', 'settled'), settled_at: null }],
      [{ ...terminalRow('reservation-1', 'settled'), expires_at: 'not-a-timestamp' }],
    ];

    for (const responseData of cases) {
      const supabase = fakeSupabase(
        { data: [reservationRow()], error: null },
        { data: [terminalRow('reservation-1', 'incurred')], error: null },
        { data: responseData, error: null },
        { data: [terminalRow('reservation-1', 'settled')], error: null },
      );
      const reservation = await reserveCostBudget(supabase, 'user-1', request);

      await reservation.markIncurred();
      await expect(reservation.settle(completeUsage)).rejects.toThrow('budget_unavailable');
      await expect(reservation.settle(completeUsage)).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: false });
      expect(supabase.calls).toHaveLength(4);
    }
  });

  it('rejects malformed release responses and permits a later retry', async () => {
    const cases = [
      null,
      [],
      [{ reservation_id: 'reservation-1', settled_micrormb: null }],
      [terminalRow('other-reservation', 'released')],
      [{ reservation_id: 'reservation-1', status: 'reserved', settled_micrormb: null }],
      [{ ...terminalRow('reservation-1', 'released'), settled_micrormb: 1 }],
      [{ ...terminalRow('reservation-1', 'released'), settled_at: '2026-07-28T00:01:00.000Z' }],
      [{ ...terminalRow('reservation-1', 'released'), created_at: 'not-a-timestamp' }],
    ];

    for (const responseData of cases) {
      const supabase = fakeSupabase(
        { data: [reservationRow()], error: null },
        { data: responseData, error: null },
        { data: [terminalRow('reservation-1', 'released')], error: null },
      );
      const reservation = await reserveCostBudget(supabase, 'user-1', request);

      await expect(reservation.release()).rejects.toThrow('budget_unavailable');
      await expect(reservation.release()).resolves.toBeUndefined();
      expect(supabase.calls).toHaveLength(3);
    }
  });

  it('does not mark a reservation released when the database reports it settled', async () => {
    const supabase = fakeSupabase(
      { data: [reservationRow()], error: null },
      { data: [terminalRow('reservation-1', 'settled')], error: null },
    );
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await expect(reservation.release()).rejects.toThrow('budget_invariant_violation');
    await expect(reservation.settle(completeUsage)).rejects.toThrow('budget_invariant_violation');
    expect(supabase.calls).toHaveLength(2);
  });

  it('shares a single in-flight settlement across overlapping callers', async () => {
    const settleGate = deferred<RpcResponse>();
    let settleCalls = 0;
    const supabase: BudgetRpcAdapter = {
      reserve: async () => ({ data: [reservationRow()], error: null }),
      markIncurred: async () => ({ data: [terminalRow('reservation-1', 'incurred')], error: null }),
      settle: async () => {
        settleCalls += 1;
        return settleGate.promise;
      },
      release: async () => ({ data: [terminalRow('reservation-1', 'released')], error: null }),
    };
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    const first = reservation.settle(completeUsage);
    const second = reservation.settle({ ...completeUsage, outputTokens: 0 });
    expect(settleCalls).toBe(1);
    settleGate.resolve({ data: [terminalRow('reservation-1', 'settled')], error: null });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { costMicrormb: 118_944, usageEstimated: false },
      { costMicrormb: 118_944, usageEstimated: false },
    ]);
  });

  it('shares a single in-flight release across overlapping callers', async () => {
    const releaseGate = deferred<RpcResponse>();
    let releaseCalls = 0;
    const supabase: BudgetRpcAdapter = {
      reserve: async () => ({ data: [reservationRow()], error: null }),
      markIncurred: async () => ({ data: [terminalRow('reservation-1', 'incurred')], error: null }),
      settle: async () => ({ data: [terminalRow('reservation-1', 'settled')], error: null }),
      release: async () => {
        releaseCalls += 1;
        return releaseGate.promise;
      },
    };
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    const first = reservation.release();
    const second = reservation.release();
    expect(releaseCalls).toBe(1);
    releaseGate.resolve({ data: [terminalRow('reservation-1', 'released')], error: null });

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it('settles before an overlapping release without dispatching a second transition', async () => {
    const settleGate = deferred<RpcResponse>();
    let settleCalls = 0;
    let releaseCalls = 0;
    const supabase: BudgetRpcAdapter = {
      reserve: async () => ({ data: [reservationRow()], error: null }),
      markIncurred: async () => ({ data: [terminalRow('reservation-1', 'incurred')], error: null }),
      settle: async () => {
        settleCalls += 1;
        return settleGate.promise;
      },
      release: async () => {
        releaseCalls += 1;
        return { data: [terminalRow('reservation-1', 'released')], error: null };
      },
    };
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    const settled = reservation.settle(completeUsage);
    const released = reservation.release();
    expect({ settleCalls, releaseCalls }).toEqual({ settleCalls: 1, releaseCalls: 0 });
    settleGate.resolve({ data: [terminalRow('reservation-1', 'settled')], error: null });

    await expect(settled).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: false });
    await expect(released).resolves.toBeUndefined();
    expect(releaseCalls).toBe(0);
  });

  it('releases a failed in-flight settlement for a later retry', async () => {
    const firstSettle = deferred<RpcResponse>();
    let settleCalls = 0;
    const supabase: BudgetRpcAdapter = {
      reserve: async () => ({ data: [reservationRow()], error: null }),
      markIncurred: async () => ({ data: [terminalRow('reservation-1', 'incurred')], error: null }),
      settle: async () => {
        settleCalls += 1;
        return settleCalls === 1
          ? firstSettle.promise
          : { data: [terminalRow('reservation-1', 'settled')], error: null };
      },
      release: async () => ({ data: [terminalRow('reservation-1', 'released')], error: null }),
    };
    const reservation = await reserveCostBudget(supabase, 'user-1', request);

    await reservation.markIncurred();
    const first = reservation.settle(completeUsage);
    const overlapping = reservation.settle(completeUsage);
    expect(settleCalls).toBe(1);
    firstSettle.resolve({ data: null, error: new Error('database unavailable') });
    await expect(first).rejects.toThrow('budget_unavailable');
    await expect(overlapping).rejects.toThrow('budget_unavailable');

    await expect(reservation.settle(completeUsage)).resolves.toEqual({ costMicrormb: 118_944, usageEstimated: false });
    expect(settleCalls).toBe(2);
  });
});
