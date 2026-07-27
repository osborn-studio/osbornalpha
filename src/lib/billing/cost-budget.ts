import {
  calculateCostMicrormb,
  DEFAULT_DAILY_LIMIT_MICRORMB,
  DEFAULT_USD_CNY_MICROS,
  reservationCostMicrormb,
  type NormalizedUsage,
} from './llm-pricing';
import type { Database, UsageFeature } from '@/lib/supabase/database.types';

type ReserveBudgetArgs = Database['public']['Functions']['reserve_llm_daily_budget']['Args'];
type SettleBudgetArgs = Database['public']['Functions']['settle_llm_budget']['Args'];
type ReleaseBudgetArgs = Database['public']['Functions']['release_llm_budget']['Args'];

export interface BudgetRpcClient {
  rpc(functionName: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
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
  estimatedInputTokens: number;
  maxOutputTokens: number;
}

export interface CostSettlement {
  costMicrormb: number;
  usageEstimated: boolean;
}

export interface CostReservation {
  reservationId: string;
  reservedMicrormb: number;
  settle(usage: NormalizedUsage): Promise<CostSettlement>;
  release(): Promise<void>;
}

const DEFAULT_RESERVATION_TTL_SECONDS = 300;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value || !/^0*[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getBudgetConfig(env: Record<string, string | undefined> = process.env): BudgetConfig {
  return {
    dailyLimitMicrormb: positiveInteger(env.LLM_DAILY_COST_LIMIT_MICRORMB, DEFAULT_DAILY_LIMIT_MICRORMB),
    usdCnyMicros: positiveInteger(env.LLM_USD_CNY_MICROS, DEFAULT_USD_CNY_MICROS),
    reservationTtlSeconds: positiveInteger(env.LLM_RESERVATION_TTL_SECONDS, DEFAULT_RESERVATION_TTL_SECONDS),
  };
}

function stableError(code: 'budget_unavailable' | 'daily_cost_exhausted' | 'budget_invariant_violation' | 'budget_reservation_released'): Error {
  return new Error(code);
}

function reservationIdFrom(data: unknown): { allowed: boolean; reservationId?: string } | undefined {
  if (!Array.isArray(data) || data.length === 0) return undefined;
  const row = data[0];
  if (typeof row !== 'object' || row === null || !('allowed' in row) || typeof row.allowed !== 'boolean') return undefined;
  if (!row.allowed) return { allowed: false };
  const id = 'reservation_id' in row ? row.reservation_id : undefined;
  return typeof id === 'string' && id.trim().length > 0 ? { allowed: true, reservationId: id } : { allowed: true };
}

function isCompleteRealUsage(usage: NormalizedUsage): boolean {
  if (usage.estimated !== false) return false;
  return [
    usage.inputTokens,
    usage.cacheHitInputTokens,
    usage.cacheMissInputTokens,
    usage.outputTokens,
  ].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_SAFE_INTEGER);
}

type ReservationState = 'active' | 'settling' | 'settled' | 'settle_failed' | 'releasing' | 'released' | 'release_failed';

function managedReservation(
  supabase: BudgetRpcClient,
  reservationId: string,
  reservedMicrormb: number,
  request: CostBudgetRequest,
  usdCnyMicros: number,
): CostReservation {
  let state: ReservationState = 'active';
  let settlement: CostSettlement | undefined;
  let settlePromise: Promise<CostSettlement> | undefined;
  let releasePromise: Promise<void> | undefined;

  const settle = async (usage: NormalizedUsage): Promise<CostSettlement> => {
    if (state === 'settled') return settlement!;
    if (state === 'settling' || state === 'settle_failed') return settlePromise!;
    if (state === 'released') throw stableError('budget_reservation_released');
    if (state === 'releasing' || state === 'release_failed') {
      await releasePromise!;
      throw stableError('budget_reservation_released');
    }

    state = 'settling';
    settlePromise = (async () => {
      try {
        const usageEstimated = !isCompleteRealUsage(usage);
        const costMicrormb = usageEstimated
          ? reservedMicrormb
          : calculateCostMicrormb(request.provider, request.model, usage, usdCnyMicros);

        if (costMicrormb > reservedMicrormb) throw stableError('budget_invariant_violation');

        const args: SettleBudgetArgs = {
          p_reservation_id: reservationId,
          p_actual_micrormb: costMicrormb,
        };
        const response = await supabase.rpc('settle_llm_budget', args);
        if (response.error) throw stableError('budget_unavailable');

        settlement = { costMicrormb, usageEstimated };
        state = 'settled';
        return settlement;
      } catch (error) {
        state = 'settle_failed';
        if (error instanceof Error && error.message === 'budget_invariant_violation') throw error;
        if (error instanceof Error && error.message === 'pricing_unavailable') throw error;
        throw stableError('budget_unavailable');
      }
    })();
    return settlePromise;
  };

  const release = async (): Promise<void> => {
    if (state === 'settled' || state === 'released') return;
    if (state === 'releasing' || state === 'release_failed') return releasePromise!;
    if (state === 'settling' || state === 'settle_failed') {
      await settlePromise!;
      return;
    }

    state = 'releasing';
    releasePromise = (async () => {
      try {
        const args: ReleaseBudgetArgs = { p_reservation_id: reservationId };
        const response = await supabase.rpc('release_llm_budget', args);
        if (response.error) throw stableError('budget_unavailable');
        state = 'released';
      } catch {
        state = 'release_failed';
        throw stableError('budget_unavailable');
      }
    })();
    return releasePromise;
  };

  return { reservationId, reservedMicrormb, settle, release };
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
    request.estimatedInputTokens,
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
    response = await supabase.rpc('reserve_llm_daily_budget', args);
  } catch {
    throw stableError('budget_unavailable');
  }
  if (!response || response.error) throw stableError('budget_unavailable');

  const outcome = reservationIdFrom(response.data);
  if (!outcome) throw stableError('budget_unavailable');
  if (!outcome.allowed) throw stableError('daily_cost_exhausted');
  if (!outcome.reservationId) throw stableError('budget_unavailable');

  return managedReservation(supabase, outcome.reservationId, reservedMicrormb, request, config.usdCnyMicros);
}
