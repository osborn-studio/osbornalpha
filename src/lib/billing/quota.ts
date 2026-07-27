// Usage quota engine (replaces the entitlements.ts stub). Daily limits reset
// at Asia/Shanghai midnight; admin role is
// unlimited. BYO-key calls (source==='user' in ResolvedLlm) are recorded for
// audit but never counted against quota and never block the caller.
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { UsageFeature } from '@/lib/supabase/database.types';
import { effectivePlan } from '@/lib/billing/plan';

export type QuotaFeature = UsageFeature;

type MeteredPlan = 'free' | 'pro';

const PLAN_LIMITS: Record<MeteredPlan, Record<QuotaFeature, number>> = {
  free: {
    copilot: 20,
    perspectives: 5,
    brief_preview: 2,
  },
  pro: {
    copilot: 100,
    perspectives: 50,
    brief_preview: 20,
  },
};

// Asia/Shanghai has no DST and is a fixed UTC+8 offset — no need for a
// timezone library, plain millisecond arithmetic is exact and testable.
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// The [start, end) UTC instants bounding the Asia/Shanghai calendar day that
// `now` falls in, expressed as ISO strings for direct use in gte/lt filters.
export function dayWindowUtc8(now: Date): { startIso: string; endIso: string } {
  const shanghaiMs = now.getTime() + SHANGHAI_OFFSET_MS;
  const startOfShanghaiDayMs = Math.floor(shanghaiMs / DAY_MS) * DAY_MS;
  const startUtcMs = startOfShanghaiDayMs - SHANGHAI_OFFSET_MS;
  const endUtcMs = startUtcMs + DAY_MS;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

// admin role is a full exemption regardless of plan; anything other than pro
// (including free / null / unrecognized plan strings) falls back to free.
export function limitFor(feature: QuotaFeature, plan: string | null, role: string | null): number {
  if (role === 'admin') return -1;
  const meteredPlan: MeteredPlan = plan === 'pro' ? 'pro' : 'free';
  return PLAN_LIMITS[meteredPlan][feature];
}

async function requireUser() {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('not authenticated');
  return { supabase, userId: data.user.id };
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
}

export async function checkQuota(feature: QuotaFeature): Promise<QuotaResult> {
  const { supabase, userId } = await requireUser();
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('plan, role, plan_expires_at')
    .eq('id', userId)
    .maybeSingle<{ plan: string | null; role: string | null; plan_expires_at: string | null }>();
  if (profErr) throw new Error(profErr.message);

  const plan = effectivePlan(prof?.plan ?? null, prof?.plan_expires_at ?? null, new Date());
  const limit = limitFor(feature, plan, prof?.role ?? null);
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1, plan };
  }

  const { startIso, endIso } = dayWindowUtc8(new Date());
  const { count, error: countErr } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .eq('byo', false)
    .eq('status', 'completed')
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (countErr) throw new Error(countErr.message);

  const used = count ?? 0;
  return { allowed: used < limit, used, limit, plan };
}

export interface RecordUsageMeta {
  ticker?: string;
  tokensIn?: number;
  tokensOut?: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  cacheHitInputTokens?: number;
  cacheMissInputTokens?: number;
  outputTokens?: number;
  costMicrormb?: number;
  pricingVersion?: string;
  usdCnyMicros?: number;
  usageEstimated?: boolean;
  byo: boolean;
  status?: 'completed' | 'failed';
}

const LEGACY_INTEGER_MAX = 2_147_483_647;

function boundedInteger(value: number | undefined, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.trunc(value)), maximum);
}

// Accounting failures must never block the caller — record-keeping is
// best-effort; swallow errors with a warning instead of throwing.
export async function recordUsage(feature: QuotaFeature, meta: RecordUsageMeta): Promise<void> {
  try {
    const { supabase, userId } = await requireUser();
    const inputTokens = boundedInteger(meta.inputTokens ?? meta.tokensIn);
    const outputTokens = boundedInteger(meta.outputTokens ?? meta.tokensOut);
    const runProvider = meta.provider ?? 'unknown';
    const runModel = meta.model ?? 'unknown';
    const { error } = await (supabase as any).from('usage_events').insert({
      user_id: userId,
      feature,
      ticker: meta.ticker ?? null,
      tokens_in: boundedInteger(inputTokens, LEGACY_INTEGER_MAX),
      tokens_out: boundedInteger(outputTokens, LEGACY_INTEGER_MAX),
      provider: meta.provider ?? null,
      model: meta.model ?? null,
      input_tokens: inputTokens,
      cache_hit_input_tokens: boundedInteger(meta.cacheHitInputTokens),
      cache_miss_input_tokens: boundedInteger(meta.cacheMissInputTokens ?? inputTokens),
      output_tokens: outputTokens,
      cost_micrormb: boundedInteger(meta.costMicrormb),
      pricing_version: meta.pricingVersion ?? null,
      usd_cny_micros: meta.usdCnyMicros === undefined
        ? null
        : boundedInteger(meta.usdCnyMicros),
      usage_estimated: meta.usageEstimated ?? false,
      byo: meta.byo,
      status: meta.status ?? 'completed',
      run_provider: runProvider,
      run_model: runModel,
      run_pricing_version: meta.pricingVersion ?? null,
      run_usd_cny_micros: meta.usdCnyMicros === undefined
        ? null
        : boundedInteger(meta.usdCnyMicros),
      run_byo: meta.byo,
      finalized_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn('recordUsage failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Writes a server-authenticated aggregate event through the service-role RPC.
 * The caller must derive `userId` from the server session and retain the same
 * idempotency key when retrying the same logical event.
 */
export async function recordUsageForUser(
  userId: string,
  idempotencyKey: string,
  feature: QuotaFeature,
  meta: RecordUsageMeta,
): Promise<void> {
  try {
    const inputTokens = boundedInteger(meta.inputTokens ?? meta.tokensIn);
    const cacheHitInputTokens = boundedInteger(meta.cacheHitInputTokens);
    const cacheMissInputTokens = meta.cacheMissInputTokens === undefined
      ? Math.max(0, inputTokens - cacheHitInputTokens)
      : boundedInteger(meta.cacheMissInputTokens);
    const outputTokens = boundedInteger(meta.outputTokens ?? meta.tokensOut);
    const { error } = await (getAdminSupabase() as any).rpc('record_usage_event', {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId,
      p_feature: feature,
      p_ticker: meta.ticker ?? null,
      p_provider: meta.provider ?? null,
      p_model: meta.model ?? null,
      p_input_tokens: inputTokens,
      p_cache_hit_input_tokens: cacheHitInputTokens,
      p_cache_miss_input_tokens: cacheMissInputTokens,
      p_output_tokens: outputTokens,
      p_cost_micrormb: boundedInteger(meta.costMicrormb),
      p_pricing_version: meta.pricingVersion ?? null,
      p_usd_cny_micros: meta.usdCnyMicros === undefined
        ? null
        : boundedInteger(meta.usdCnyMicros),
      p_usage_estimated: meta.usageEstimated ?? false,
      p_byo: meta.byo,
      p_status: meta.status ?? 'completed',
    });
    if (error) throw new Error('usage_audit_rpc_failed');
  } catch {
    console.warn('recordUsageForUser failed', { code: 'usage_audit_failed' });
  }
}

export interface BeginUsageRunMeta {
  ticker?: string;
  provider: string;
  model: string;
  pricingVersion?: string;
  usdCnyMicros?: number;
  byo: boolean;
}

function usageRunError(error: unknown): Error {
  const code = (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
  ) ? error.code : '';
  return new Error(code === '55000' ? 'usage_audit_invariant' : 'usage_audit_unavailable');
}

export async function beginUsageRun(
  userId: string,
  idempotencyKey: string,
  feature: QuotaFeature,
  meta: BeginUsageRunMeta,
): Promise<void> {
  let response: { data: unknown; error: unknown };
  try {
    response = await (getAdminSupabase() as any).rpc('begin_usage_run', {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId,
      p_feature: feature,
      p_ticker: meta.ticker ?? null,
      p_provider: meta.provider,
      p_model: meta.model,
      p_pricing_version: meta.pricingVersion ?? null,
      p_usd_cny_micros: meta.usdCnyMicros ?? null,
      p_byo: meta.byo,
    });
  } catch (error) {
    throw usageRunError(error);
  }
  if (!response || response.error) throw usageRunError(response?.error);
}

export async function finalizeUsageRun(
  userId: string,
  idempotencyKey: string,
  feature: QuotaFeature,
  meta: RecordUsageMeta,
): Promise<void> {
  const inputTokens = boundedInteger(meta.inputTokens ?? meta.tokensIn);
  const cacheHitInputTokens = boundedInteger(meta.cacheHitInputTokens);
  const cacheMissInputTokens = meta.cacheMissInputTokens === undefined
    ? Math.max(0, inputTokens - cacheHitInputTokens)
    : boundedInteger(meta.cacheMissInputTokens);
  const outputTokens = boundedInteger(meta.outputTokens ?? meta.tokensOut);
  const args = {
    p_idempotency_key: idempotencyKey,
    p_user_id: userId,
    p_feature: feature,
    p_ticker: meta.ticker ?? null,
    p_provider: meta.provider ?? 'unknown',
    p_model: meta.model ?? 'unknown',
    p_input_tokens: inputTokens,
    p_cache_hit_input_tokens: cacheHitInputTokens,
    p_cache_miss_input_tokens: cacheMissInputTokens,
    p_output_tokens: outputTokens,
    p_cost_micrormb: boundedInteger(meta.costMicrormb),
    p_pricing_version: meta.pricingVersion ?? null,
    p_usd_cny_micros: meta.usdCnyMicros === undefined
      ? null
      : boundedInteger(meta.usdCnyMicros),
    p_usage_estimated: meta.usageEstimated ?? false,
    p_byo: meta.byo,
    p_status: meta.status ?? 'completed',
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await (getAdminSupabase() as any).rpc('finalize_usage_run', args);
      if (response && !response.error) return;
      lastError = response?.error;
      if (usageRunError(lastError).message === 'usage_audit_invariant') {
        throw usageRunError(lastError);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'usage_audit_invariant') throw error;
      lastError = error;
      if (usageRunError(error).message === 'usage_audit_invariant') {
        throw usageRunError(error);
      }
    }
  }
  throw usageRunError(lastError);
}
