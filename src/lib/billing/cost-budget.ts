import {
  calculateCostMicrormb,
  DEFAULT_DAILY_LIMIT_MICRORMB,
  DEFAULT_USD_CNY_MICROS,
  reservationCostMicrormb,
  type NormalizedUsage,
} from './llm-pricing';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, UsageFeature } from '@/lib/supabase/database.types';

type ReserveBudgetArgs = Database['public']['Functions']['reserve_llm_daily_budget']['Args'];
type SettleBudgetArgs = Database['public']['Functions']['settle_llm_budget']['Args'];
type ReleaseBudgetArgs = Database['public']['Functions']['release_llm_budget']['Args'];

/** Production clients can be passed directly; this adapter keeps unit fakes small. */
export interface BudgetRpcAdapter {
  reserve(args: ReserveBudgetArgs): Promise<{ data: unknown; error: unknown }>;
  settle(args: SettleBudgetArgs): Promise<{ data: unknown; error: unknown }>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type TerminalResponse = 'valid' | 'settled' | 'invalid';

function terminalResponse(
  data: unknown,
  reservationId: string,
  expectedStatus: 'settled' | 'released',
  expectedSettledMicrormb?: number,
): TerminalResponse {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) return 'invalid';
  const row = data[0];
  if (row.reservation_id !== reservationId || typeof row.status !== 'string') return 'invalid';

  if (row.status === expectedStatus) {
    if (expectedStatus === 'settled' && row.settled_micrormb !== expectedSettledMicrormb) return 'invalid';
    return 'valid';
  }

  if (
    expectedStatus === 'released'
    && row.status === 'settled'
    && typeof row.settled_micrormb === 'number'
    && Number.isSafeInteger(row.settled_micrormb)
    && row.settled_micrormb >= 0
  ) return 'settled';

  return 'invalid';
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

type ReservationState = 'active' | 'settling' | 'settled' | 'releasing' | 'released';

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
    if (state === 'settling') return settlePromise!;
    if (state === 'released') throw stableError('budget_reservation_released');
    if (state === 'releasing') {
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
        const response = await settleRpc(supabase, args);
        if (!response || response.error) throw stableError('budget_unavailable');
        if (terminalResponse(response.data, reservationId, 'settled', costMicrormb) !== 'valid') {
          throw stableError('budget_unavailable');
        }

        settlement = { costMicrormb, usageEstimated };
        state = 'settled';
        return settlement;
      } catch (error) {
        state = 'active';
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

    state = 'releasing';
    releasePromise = (async () => {
      try {
        const args: ReleaseBudgetArgs = { p_reservation_id: reservationId };
        const response = await releaseRpc(supabase, args);
        if (!response || response.error) throw stableError('budget_unavailable');
        const outcome = terminalResponse(response.data, reservationId, 'released');
        if (outcome === 'settled') throw stableError('budget_invariant_violation');
        if (outcome !== 'valid') throw stableError('budget_unavailable');
        state = 'released';
      } catch (error) {
        state = 'active';
        if (error instanceof Error && error.message === 'budget_invariant_violation') throw error;
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
    response = await reserveRpc(supabase, args);
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
