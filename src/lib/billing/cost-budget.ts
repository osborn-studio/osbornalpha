import {
  calculateCostMicrormb,
  DEFAULT_DAILY_LIMIT_MICRORMB,
  DEFAULT_USD_CNY_MICROS,
  PRICING_VERSION,
  reservationCostMicrormb,
  type NormalizedUsage,
} from './llm-pricing';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UsageFeature } from '@/lib/supabase/database.types';

type ReserveBudgetArgs = Database['public']['Functions']['reserve_llm_daily_budget']['Args'];
type MarkIncurredArgs = Database['public']['Functions']['mark_llm_budget_incurred']['Args'];
type SettleBudgetArgs = Database['public']['Functions']['settle_llm_budget']['Args'];
type FinalizeIncurredArgs = Database['public']['Functions']['finalize_llm_budget_incurred']['Args'];
type ReleaseBudgetArgs = Database['public']['Functions']['release_llm_budget']['Args'];

/** Production clients can be passed directly; this adapter keeps unit fakes small. */
export interface BudgetRpcAdapter {
  reserve(args: ReserveBudgetArgs): Promise<{ data: unknown; error: unknown }>;
  markIncurred(args: MarkIncurredArgs): Promise<{ data: unknown; error: unknown }>;
  settle(args: SettleBudgetArgs): Promise<{ data: unknown; error: unknown }>;
  finalizeIncurred?(args: FinalizeIncurredArgs): Promise<{ data: unknown; error: unknown }>;
  release(args: ReleaseBudgetArgs): Promise<{ data: unknown; error: unknown }>;
}

type BudgetDatabase = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: [];
    }>;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Database['public']['Functions'];
  };
};

type BudgetSupabaseClient = Pick<SupabaseClient<BudgetDatabase>, 'rpc'>;
export type BudgetRpcClient = BudgetSupabaseClient | BudgetRpcAdapter;

function reserveRpc(client: BudgetRpcClient, args: ReserveBudgetArgs) {
  return 'reserve' in client
    ? client.reserve(args)
    : client.rpc<'reserve_llm_daily_budget', ReserveBudgetArgs>('reserve_llm_daily_budget', args);
}

function settleRpc(client: BudgetRpcClient, args: SettleBudgetArgs) {
  return 'settle' in client
    ? client.settle(args)
    : client.rpc<'settle_llm_budget', SettleBudgetArgs>('settle_llm_budget', args);
}

function finalizeIncurredRpc(client: BudgetRpcClient, args: FinalizeIncurredArgs) {
  return 'finalizeIncurred' in client && typeof client.finalizeIncurred === 'function'
    ? client.finalizeIncurred(args)
    : (client as BudgetSupabaseClient).rpc<
        'finalize_llm_budget_incurred',
        FinalizeIncurredArgs
      >('finalize_llm_budget_incurred', args);
}

function markIncurredRpc(client: BudgetRpcClient, args: MarkIncurredArgs) {
  return 'markIncurred' in client
    ? client.markIncurred(args)
    : client.rpc<'mark_llm_budget_incurred', MarkIncurredArgs>('mark_llm_budget_incurred', args);
}

function releaseRpc(client: BudgetRpcClient, args: ReleaseBudgetArgs) {
  return 'release' in client
    ? client.release(args)
    : client.rpc<'release_llm_budget', ReleaseBudgetArgs>('release_llm_budget', args);
}

export interface BudgetConfig {
  dailyLimitMicrormb: number;
  usdCnyMicros: number;
  reservationTtlSeconds: number;
}

export interface CostBudgetRequest {
  feature: UsageFeature;
  provider: string;
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export interface CostSettlement {
  costMicrormb: number;
  usageEstimated: boolean;
}

export interface CostReservation {
  reservationId: string;
  reservedMicrormb: number;
  markIncurred(): Promise<void>;
  finalizeIncurred(): Promise<void>;
  settle(usage: NormalizedUsage): Promise<CostSettlement>;
  release(): Promise<void>;
}

const DEFAULT_RESERVATION_TTL_SECONDS = 300;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_RESERVATION_TTL_SECONDS = 86_400;

function positiveInteger(value: string | undefined, fallback: number, maximum = MAX_SAFE_INTEGER): number {
  if (!value || !/^0*[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function getBudgetConfig(env: Record<string, string | undefined> = process.env): BudgetConfig {
  return {
    dailyLimitMicrormb: positiveInteger(env.LLM_DAILY_COST_LIMIT_MICRORMB, DEFAULT_DAILY_LIMIT_MICRORMB),
    usdCnyMicros: positiveInteger(env.LLM_USD_CNY_MICROS, DEFAULT_USD_CNY_MICROS),
    reservationTtlSeconds: positiveInteger(
      env.LLM_RESERVATION_TTL_SECONDS,
      DEFAULT_RESERVATION_TTL_SECONDS,
      MAX_RESERVATION_TTL_SECONDS,
    ),
  };
}

function stableError(code: 'budget_unavailable' | 'daily_cost_exhausted' | 'budget_invariant_violation' | 'budget_reservation_released' | 'budget_reservation_incurred'): Error {
  return new Error(code);
}

function reservationIdFrom(
  data: unknown,
  requestedMicrormb: number,
  dailyLimitMicrormb: number,
): { allowed: boolean; reservationId?: string } | undefined {
  if (!Array.isArray(data) || data.length !== 1) return undefined;
  const row = data[0];
  if (!isRecord(row) || typeof row.allowed !== 'boolean') return undefined;
  if (
    typeof row.used_micrormb !== 'number'
    || !Number.isSafeInteger(row.used_micrormb)
    || row.used_micrormb < 0
    || row.limit_micrormb !== dailyLimitMicrormb
  ) return undefined;

  const hasCapacity = requestedMicrormb <= dailyLimitMicrormb - row.used_micrormb;
  if (row.allowed) {
    if (typeof row.reservation_id !== 'string' || row.reservation_id.trim().length === 0 || !hasCapacity) return undefined;
    return { allowed: true, reservationId: row.reservation_id };
  }

  return row.reservation_id === null && !hasCapacity ? { allowed: false } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type TerminalResponse = 'valid' | 'settled' | 'incurred' | 'invalid';

interface ExpectedReservation {
  reservationId: string;
  userId: string;
  feature: UsageFeature;
  provider: string;
  model: string;
  reservedMicrormb: number;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function terminalResponse(
  data: unknown,
  expected: ExpectedReservation,
  expectedStatus: 'incurred' | 'settled' | 'released',
  expectedSettledMicrormb?: number,
): TerminalResponse {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return 'invalid';
  const row = data[0];
  const createdAtMs = timestampMs(row.created_at);
  const expiresAtMs = timestampMs(row.expires_at);
  if (
    row.reservation_id !== expected.reservationId
    || row.user_id !== expected.userId
    || row.feature !== expected.feature
    || row.provider !== expected.provider
    || row.model !== expected.model
    || row.reserved_micrormb !== expected.reservedMicrormb
    || createdAtMs === undefined
    || expiresAtMs === undefined
    || expiresAtMs <= createdAtMs
  ) return 'invalid';

  if (row.status === 'released') {
    if (row.settled_micrormb !== null || row.settled_at !== null) return 'invalid';
    return expectedStatus === 'released' ? 'valid' : 'invalid';
  }

  if (row.status === 'incurred') {
    if (row.settled_micrormb !== null || row.settled_at !== null) return 'invalid';
    return expectedStatus === 'incurred' ? 'valid' : 'incurred';
  }

  if (row.status === 'settled') {
    const settledAtMs = timestampMs(row.settled_at);
    if (
      typeof row.settled_micrormb !== 'number'
      || !Number.isSafeInteger(row.settled_micrormb)
      || row.settled_micrormb < 0
      || settledAtMs === undefined
      || settledAtMs < createdAtMs
      || (expectedSettledMicrormb !== undefined && row.settled_micrormb !== expectedSettledMicrormb)
    ) return 'invalid';
    return expectedStatus === 'settled' ? 'valid' : 'settled';
  }

  return 'invalid';
}

export function isCompleteRealUsage(usage: NormalizedUsage): boolean {
  if (usage.estimated !== false) return false;
  const values = [
    usage.inputTokens,
    usage.cacheHitInputTokens,
    usage.cacheMissInputTokens,
    usage.outputTokens,
  ];
  return values.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE_INTEGER)
    && usage.cacheHitInputTokens + usage.cacheMissInputTokens === usage.inputTokens;
}

type ReservationState =
  | 'active'
  | 'marking'
  | 'incurred'
  | 'finalizing'
  | 'settling'
  | 'settled'
  | 'releasing'
  | 'released';

function managedReservation(
  supabase: BudgetRpcClient,
  reservationId: string,
  userId: string,
  reservedMicrormb: number,
  request: CostBudgetRequest,
  usdCnyMicros: number,
): CostReservation {
  const expectedReservation: ExpectedReservation = {
    reservationId,
    userId,
    feature: request.feature,
    provider: request.provider,
    model: request.model,
    reservedMicrormb,
  };
  let state: ReservationState = 'active';
  let settlement: CostSettlement | undefined;
  let markPromise: Promise<void> | undefined;
  let finalizePromise: Promise<void> | undefined;
  let settlePromise: Promise<CostSettlement> | undefined;
  let releasePromise: Promise<void> | undefined;

  const markIncurred = async (): Promise<void> => {
    if (state === 'incurred' || state === 'settled') return;
    if (state === 'marking') return markPromise!;
    if (state === 'released' || state === 'releasing') {
      throw stableError('budget_reservation_released');
    }
    if (state === 'settling') {
      await settlePromise!;
      return;
    }

    state = 'marking';
    markPromise = (async () => {
      try {
        const response = await markIncurredRpc(supabase, { p_reservation_id: reservationId });
        if (!response || response.error) throw stableError('budget_unavailable');
        if (terminalResponse(response.data, expectedReservation, 'incurred') !== 'valid') {
          throw stableError('budget_unavailable');
        }
        state = 'incurred';
      } catch {
        state = 'active';
        throw stableError('budget_unavailable');
      }
    })();
    return markPromise;
  };

  const conservativeUsage: NormalizedUsage = {
    inputTokens: request.maxInputTokens,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: request.maxInputTokens,
    outputTokens: request.maxOutputTokens,
    estimated: true,
  };

  const usageArgs = (
    usage: NormalizedUsage,
    usageEstimated: boolean,
  ): Omit<SettleBudgetArgs, 'p_reservation_id' | 'p_actual_micrormb'> => ({
    p_input_tokens: usage.inputTokens,
    p_cache_hit_input_tokens: usage.cacheHitInputTokens,
    p_cache_miss_input_tokens: usage.cacheMissInputTokens,
    p_output_tokens: usage.outputTokens,
    p_pricing_version: PRICING_VERSION,
    p_usd_cny_micros: usdCnyMicros,
    p_usage_estimated: usageEstimated,
  });

  const finalizeIncurred = async (): Promise<void> => {
    if (state === 'settled') return;
    if (state === 'finalizing') return finalizePromise!;
    if (state === 'marking') await markPromise!;
    if (state !== 'incurred') throw stableError('budget_invariant_violation');

    state = 'finalizing';
    finalizePromise = (async () => {
      try {
        const args: FinalizeIncurredArgs = {
          p_reservation_id: reservationId,
          ...usageArgs(conservativeUsage, true),
        };
        const response = await finalizeIncurredRpc(supabase, args);
        if (!response || response.error) throw stableError('budget_unavailable');
        if (terminalResponse(response.data, expectedReservation, 'incurred') !== 'valid') {
          throw stableError('budget_unavailable');
        }
        state = 'incurred';
      } catch (error) {
        state = 'incurred';
        if (
          error instanceof Error
          && error.message === 'budget_invariant_violation'
        ) throw error;
        throw stableError('budget_unavailable');
      }
    })();
    return finalizePromise;
  };

  const settle = async (usage: NormalizedUsage): Promise<CostSettlement> => {
    if (state === 'settled') return settlement!;
    if (state === 'settling') return settlePromise!;
    if (state === 'released') throw stableError('budget_reservation_released');
    if (state === 'releasing') {
      await releasePromise!;
      throw stableError('budget_reservation_released');
    }
    if (state === 'marking') await markPromise!;
    if (state === 'finalizing') await finalizePromise!;
    if (state !== 'incurred') throw stableError('budget_invariant_violation');

    const stateBeforeSettlement = state;
    state = 'settling';
    settlePromise = (async () => {
      try {
        const usageEstimated = !isCompleteRealUsage(usage);
        const auditedUsage = usageEstimated ? conservativeUsage : usage;
        const costMicrormb = usageEstimated
          ? reservedMicrormb
          : calculateCostMicrormb(request.provider, request.model, usage, usdCnyMicros);

        if (costMicrormb > reservedMicrormb) throw stableError('budget_invariant_violation');

        const args: SettleBudgetArgs = {
          p_reservation_id: reservationId,
          p_actual_micrormb: costMicrormb,
          ...usageArgs(auditedUsage, usageEstimated),
        };
        const response = await settleRpc(supabase, args);
        if (!response || response.error) throw stableError('budget_unavailable');
        if (terminalResponse(response.data, expectedReservation, 'settled', costMicrormb) !== 'valid') {
          throw stableError('budget_unavailable');
        }

        settlement = { costMicrormb, usageEstimated };
        state = 'settled';
        return settlement;
      } catch (error) {
        state = stateBeforeSettlement === 'incurred' ? 'incurred' : 'active';
        if (error instanceof Error && error.message === 'budget_invariant_violation') throw error;
        if (error instanceof Error && error.message === 'pricing_unavailable') throw error;
        throw stableError('budget_unavailable');
      }
    })();
    return settlePromise;
  };

  const release = async (): Promise<void> => {
    if (state === 'settled' || state === 'released') return;
    if (state === 'releasing') return releasePromise!;
    if (state === 'settling') {
      await settlePromise!;
      return;
    }
    if (state === 'marking') {
      await markPromise!;
    }
    if (state === 'finalizing') {
      await finalizePromise!;
    }
    if (state === 'incurred') throw stableError('budget_reservation_incurred');

    state = 'releasing';
    releasePromise = (async () => {
      try {
        const args: ReleaseBudgetArgs = { p_reservation_id: reservationId };
        const response = await releaseRpc(supabase, args);
        if (!response || response.error) throw stableError('budget_unavailable');
        const outcome = terminalResponse(response.data, expectedReservation, 'released');
        if (outcome === 'settled') throw stableError('budget_invariant_violation');
        if (outcome === 'incurred') throw stableError('budget_reservation_incurred');
        if (outcome !== 'valid') throw stableError('budget_unavailable');
        state = 'released';
      } catch (error) {
        if (error instanceof Error && error.message === 'budget_reservation_incurred') {
          state = 'incurred';
          throw error;
        }
        state = 'active';
        if (
          error instanceof Error
          && error.message === 'budget_invariant_violation'
        ) throw error;
        throw stableError('budget_unavailable');
      }
    })();
    return releasePromise;
  };

  return {
    reservationId,
    reservedMicrormb,
    markIncurred,
    finalizeIncurred,
    settle,
    release,
  };
}

export async function reserveCostBudget(
  supabase: BudgetRpcClient,
  userId: string,
  request: CostBudgetRequest,
): Promise<CostReservation> {
  const config = getBudgetConfig();
  const reservedMicrormb = reservationCostMicrormb(
    request.provider,
    request.model,
    request.maxInputTokens,
    request.maxOutputTokens,
    config.usdCnyMicros,
  );

  const args: ReserveBudgetArgs = {
    p_user_id: userId,
    p_feature: request.feature,
    p_provider: request.provider,
    p_model: request.model,
    p_requested_micrormb: reservedMicrormb,
    p_daily_limit_micrormb: config.dailyLimitMicrormb,
    p_ttl_seconds: config.reservationTtlSeconds,
  };

  let response: { data: unknown; error: unknown };
  try {
    response = await reserveRpc(supabase, args);
  } catch {
    throw stableError('budget_unavailable');
  }
  if (!response || response.error) throw stableError('budget_unavailable');

  const outcome = reservationIdFrom(response.data, reservedMicrormb, config.dailyLimitMicrormb);
  if (!outcome) throw stableError('budget_unavailable');
  if (!outcome.allowed) throw stableError('daily_cost_exhausted');
  if (!outcome.reservationId) throw stableError('budget_unavailable');

  return managedReservation(supabase, outcome.reservationId, userId, reservedMicrormb, request, config.usdCnyMicros);
}
