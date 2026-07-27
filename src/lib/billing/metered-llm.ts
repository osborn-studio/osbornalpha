import { getAdminSupabase } from '@/lib/supabase/admin';
import type { UsageFeature } from '@/lib/supabase/database.types';
import {
  getBudgetConfig,
  isCompleteRealUsage,
  reserveCostBudget,
} from './cost-budget';
import {
  calculateCostMicrormb,
  maxInputTokensFor,
  PRICING_VERSION,
  reservationCostMicrormb,
  type NormalizedUsage,
} from './llm-pricing';

export interface MeteredLlmProvider {
  source: 'user' | 'env';
  provider: string;
  model: string;
}

export interface MeteredUsage {
  status: 'completed' | 'failed';
  provider: string;
  model: string;
  usage: NormalizedUsage;
  costMicrormb: number;
  usageEstimated: boolean;
  byo: boolean;
}

export interface MeteredCallResult<T> {
  value: T;
  accounting: MeteredUsage;
}

interface RunMeteredLlmCallArgs<T extends { usage: NormalizedUsage }> {
  feature: UsageFeature;
  provider: MeteredLlmProvider;
  /** Must be read from the authenticated server session, never request input. */
  userId?: string;
  /** Admins skip the cap RPC but still require reviewed pricing and audit cost. */
  budgetExempt: boolean;
  maxOutputTokens: number;
  call(): Promise<T>;
}

const usageByError = new WeakMap<object, MeteredUsage>();

function attachUsage(error: unknown, usage: MeteredUsage): void {
  if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
    usageByError.set(error as object, usage);
  }
}

export function meteredUsageFromError(error: unknown): MeteredUsage | undefined {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return undefined;
  return usageByError.get(error as object);
}

function conservativeUsage(maxInputTokens: number, maxOutputTokens: number): NormalizedUsage {
  return {
    inputTokens: maxInputTokens,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: maxInputTokens,
    outputTokens: maxOutputTokens,
    estimated: true,
  };
}

function platformUsage(
  status: MeteredUsage['status'],
  provider: MeteredLlmProvider,
  usage: NormalizedUsage,
  costMicrormb: number,
  usageEstimated: boolean,
): MeteredUsage {
  return {
    status,
    provider: provider.provider,
    model: provider.model,
    usage,
    costMicrormb,
    usageEstimated,
    byo: false,
  };
}

/**
 * Durable accounting boundary for exactly one provider network call.
 *
 * Platform calls preflight reviewed pricing and, unless admin-exempt, reserve
 * and mark durable spend before entering `call`. Once incurred, this helper
 * never releases a reservation.
 */
export async function runMeteredLlmCall<T extends { usage: NormalizedUsage }>(
  args: RunMeteredLlmCallArgs<T>,
): Promise<MeteredCallResult<T>> {
  const { provider } = args;

  if (provider.source === 'user') {
    try {
      const value = await args.call();
      return {
        value,
        accounting: {
          status: 'completed',
          provider: provider.provider,
          model: provider.model,
          usage: value.usage,
          costMicrormb: 0,
          usageEstimated: value.usage.estimated,
          byo: true,
        },
      };
    } catch (error) {
      attachUsage(error, {
        status: 'failed',
        provider: provider.provider,
        model: provider.model,
        usage: {
          inputTokens: 0,
          cacheHitInputTokens: 0,
          cacheMissInputTokens: 0,
          outputTokens: 0,
          estimated: true,
        },
        costMicrormb: 0,
        usageEstimated: true,
        byo: true,
      });
      throw error;
    }
  }

  // Pricing review is deliberately before both the cap RPC and the provider.
  const config = getBudgetConfig();
  const maxInputTokens = maxInputTokensFor(provider.provider, provider.model);
  const maxCostMicrormb = reservationCostMicrormb(
    provider.provider,
    provider.model,
    maxInputTokens,
    args.maxOutputTokens,
    config.usdCnyMicros,
  );
  const conservative = conservativeUsage(maxInputTokens, args.maxOutputTokens);

  let reservation: Awaited<ReturnType<typeof reserveCostBudget>> | null = null;
  if (!args.budgetExempt) {
    if (!args.userId) throw new Error('budget_unavailable');
    reservation = await reserveCostBudget(getAdminSupabase(), args.userId, {
      feature: args.feature,
      provider: provider.provider,
      model: provider.model,
      maxInputTokens,
      maxOutputTokens: args.maxOutputTokens,
    });
    await reservation.markIncurred();
  }

  let value: T;
  try {
    value = await args.call();
  } catch (error) {
    attachUsage(error, platformUsage(
      'failed',
      provider,
      conservative,
      reservation?.reservedMicrormb ?? maxCostMicrormb,
      true,
    ));
    throw error;
  }

  if (!reservation) {
    const complete = isCompleteRealUsage(value.usage);
    const auditedUsage = complete ? value.usage : conservative;
    return {
      value,
      accounting: platformUsage(
        'completed',
        provider,
        auditedUsage,
        complete
          ? calculateCostMicrormb(
              provider.provider,
              provider.model,
              value.usage,
              config.usdCnyMicros,
            )
          : maxCostMicrormb,
        !complete,
      ),
    };
  }

  try {
    const settlement = await reservation.settle(value.usage);
    const auditedUsage = settlement.usageEstimated ? conservative : value.usage;
    return {
      value,
      accounting: platformUsage(
        'completed',
        provider,
        auditedUsage,
        settlement.costMicrormb,
        settlement.usageEstimated || value.usage.estimated,
      ),
    };
  } catch (error) {
    // Provider spend is already durable. A settlement error must not release
    // or erase it; audit the full reservation until reconciliation succeeds.
    attachUsage(error, platformUsage(
      'failed',
      provider,
      isCompleteRealUsage(value.usage) ? value.usage : conservative,
      reservation.reservedMicrormb,
      true,
    ));
    throw error;
  }
}

function safeAdd(left: number, right: number): { value: number; saturated: boolean } {
  if (
    !Number.isSafeInteger(left)
    || left < 0
    || !Number.isSafeInteger(right)
    || right < 0
    || left > Number.MAX_SAFE_INTEGER - right
  ) {
    return { value: Number.MAX_SAFE_INTEGER, saturated: true };
  }
  return { value: left + right, saturated: false };
}

export interface MeteredUsageAggregate extends MeteredUsage {
  pricingVersion?: string;
  usdCnyMicros?: number;
}

export function aggregateMeteredUsage(usages: MeteredUsage[]): MeteredUsageAggregate {
  let aggregateUsage: NormalizedUsage = {
    inputTokens: 0,
    cacheHitInputTokens: 0,
    cacheMissInputTokens: 0,
    outputTokens: 0,
    estimated: false,
  };
  let costMicrormb = 0;
  let saturated = false;

  for (const item of usages) {
    const input = safeAdd(aggregateUsage.inputTokens, item.usage.inputTokens);
    const cacheHit = safeAdd(aggregateUsage.cacheHitInputTokens, item.usage.cacheHitInputTokens);
    const cacheMiss = safeAdd(aggregateUsage.cacheMissInputTokens, item.usage.cacheMissInputTokens);
    const output = safeAdd(aggregateUsage.outputTokens, item.usage.outputTokens);
    const cost = safeAdd(costMicrormb, item.costMicrormb);
    saturated ||= input.saturated || cacheHit.saturated || cacheMiss.saturated
      || output.saturated || cost.saturated;
    aggregateUsage = {
      inputTokens: input.value,
      cacheHitInputTokens: cacheHit.value,
      cacheMissInputTokens: cacheMiss.value,
      outputTokens: output.value,
      estimated: aggregateUsage.estimated || item.usage.estimated || item.usageEstimated,
    };
    costMicrormb = cost.value;
  }

  const providers = [...new Set(usages.map((item) => item.provider))];
  const models = [...new Set(usages.map((item) => item.model))];
  const byo = usages.length > 0 && usages.every((item) => item.byo);
  const config = getBudgetConfig();

  return {
    status: usages.some((item) => item.status === 'failed') ? 'failed' : 'completed',
    provider: providers.length === 1 ? providers[0] : providers.length > 1 ? 'mixed' : 'unknown',
    model: models.length === 1 ? models[0] : models.length > 1 ? models.join('+') : 'unknown',
    usage: {
      ...aggregateUsage,
      estimated: aggregateUsage.estimated || saturated,
    },
    costMicrormb,
    usageEstimated: aggregateUsage.estimated || saturated,
    byo,
    pricingVersion: byo ? undefined : PRICING_VERSION,
    usdCnyMicros: byo ? undefined : config.usdCnyMicros,
  };
}
