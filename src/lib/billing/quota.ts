// Usage quota engine (replaces the entitlements.ts stub). Free-tier daily
// limits reset at Asia/Shanghai midnight; pro = free x10; admin role is
// unlimited. BYO-key calls (source==='user' in ResolvedLlm) are recorded for
// audit but never counted against quota and never block the caller.
import { getServerSupabase } from '@/lib/supabase/server';
import type { UsageFeature } from '@/lib/supabase/database.types';

export type QuotaFeature = UsageFeature;

const BASE_LIMITS: Record<QuotaFeature, number> = {
  copilot: 3,
  perspectives: 5,
  brief_preview: 2,
};

const PRO_MULTIPLIER = 10;

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

// admin role is a full exemption regardless of plan; pro multiplies the base
// free limit by 10; anything else (free / null / unrecognized plan strings)
// falls back to the base free limit.
export function limitFor(feature: QuotaFeature, plan: string | null, role: string | null): number {
  if (role === 'admin') return -1;
  const base = BASE_LIMITS[feature];
  if (plan === 'pro') return base * PRO_MULTIPLIER;
  return base;
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
    .select('plan, role')
    .eq('id', userId)
    .maybeSingle<{ plan: string | null; role: string | null }>();
  if (profErr) throw new Error(profErr.message);

  const plan = prof?.plan ?? 'free';
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
  byo: boolean;
}

// Accounting failures must never block the caller — record-keeping is
// best-effort; swallow errors with a warning instead of throwing.
export async function recordUsage(feature: QuotaFeature, meta: RecordUsageMeta): Promise<void> {
  try {
    const { supabase, userId } = await requireUser();
    const { error } = await (supabase as any).from('usage_events').insert({
      user_id: userId,
      feature,
      ticker: meta.ticker ?? null,
      tokens_in: meta.tokensIn ?? 0,
      tokens_out: meta.tokensOut ?? 0,
      byo: meta.byo,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn('recordUsage failed:', err instanceof Error ? err.message : err);
  }
}
