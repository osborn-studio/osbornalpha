import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { resolveLlm } from '@/lib/llm/resolve';
import { beginUsageRun, checkQuota, finalizeUsageRun } from '@/lib/billing/quota';
import { getRequestLocale, apiMessage } from '@/lib/i18n/server';
import { chatResolved } from '@/lib/data/sources/llm';
import { getServerSupabase } from '@/lib/supabase/server';
import {
  aggregateMeteredUsage,
  meteredUsageFromError,
  runMeteredLlmCall,
  type MeteredUsage,
} from '@/lib/billing/metered-llm';
import { getBudgetConfig } from '@/lib/billing/cost-budget';
import {
  createConcurrencyLimiter,
  createPersonaConcurrencyLimiter,
  PERSONA_CONCURRENCY_HARD_CAP,
} from '@/lib/billing/llm-concurrency';
import { PRICING_VERSION } from '@/lib/billing/llm-pricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COST_ERROR_CODES = new Set([
  'daily_cost_exhausted',
  'pricing_unavailable',
  'budget_unavailable',
  'budget_invariant_violation',
  'usage_audit_unavailable',
  'usage_audit_invariant',
]);

function costErrorCode(error: unknown): string | null {
  const code = error instanceof Error ? error.message : String(error);
  return COST_ERROR_CODES.has(code) ? code : null;
}

function costErrorStatus(code: string): number {
  if (code === 'daily_cost_exhausted') return 429;
  if (code === 'budget_unavailable' || code === 'usage_audit_unavailable') return 503;
  return 500;
}

function briefResponse(
  brief: Awaited<ReturnType<typeof generateDailyBrief>>,
  format: string,
): Response {
  if (format === 'markdown' || format === 'md') {
    return new NextResponse(brief.markdown, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }
  return NextResponse.json(brief);
}

async function finalizeAccounting(
  userId: string,
  idempotencyKey: string,
  initial: { provider: string; model: string; byo: boolean },
  accounting: MeteredUsage[],
  failed: boolean,
): Promise<void> {
  const aggregate = accounting.length > 0 ? aggregateMeteredUsage(accounting) : null;
  const budget = getBudgetConfig();
  await finalizeUsageRun(userId, idempotencyKey, 'brief_preview', {
    provider: aggregate?.provider ?? initial.provider,
    model: aggregate?.model ?? initial.model,
    inputTokens: aggregate?.usage.inputTokens ?? 0,
    cacheHitInputTokens: aggregate?.usage.cacheHitInputTokens ?? 0,
    cacheMissInputTokens: aggregate?.usage.cacheMissInputTokens ?? 0,
    outputTokens: aggregate?.usage.outputTokens ?? 0,
    costMicrormb: aggregate?.costMicrormb ?? 0,
    pricingVersion: aggregate?.pricingVersion ?? (initial.byo ? undefined : PRICING_VERSION),
    usdCnyMicros: aggregate?.usdCnyMicros ?? (initial.byo ? undefined : budget.usdCnyMicros),
    usageEstimated: aggregate?.usageEstimated ?? true,
    byo: aggregate?.byo ?? initial.byo,
    status: failed ? 'failed' : 'completed',
  });
}

/**
 * GET /api/brief/preview
 *   - ?watchlist=A,B,C  custom watchlist (default = DEFAULT_WATCHLIST)
 *   - ?topN=5
 *   - ?skipLLM=true     skip 9-persona generation (faster, no cost)
 *   - ?format=json|markdown
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const watchlistParam = url.searchParams.get('watchlist');
  const topN = parseInt(url.searchParams.get('topN') || '5', 10);
  const skipLLM = url.searchParams.get('skipLLM') === 'true';
  const format = url.searchParams.get('format') || 'json';

  const watchlist = watchlistParam
    ? watchlistParam.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  // Deterministic composition is explicitly outside both count and cost
  // accounting and does not need to resolve provider/auth state.
  if (skipLLM) {
    try {
      return briefResponse(
        await generateDailyBrief(watchlist, { topN, mode: 'skip_llm' }),
        format,
      );
    } catch {
      console.error('brief preview failed', { code: 'brief_generation_failed' });
      return NextResponse.json({ error: 'brief generation failed' }, { status: 500 });
    }
  }

  // Quota rules:
  //  - skipLLM=true costs nothing (composition only) → never metered, never
  //    blocked (BriefGlance on /today uses this).
  //  - BYO-key calls run unmetered (user pays their own bill).
  //  - Anonymous callers get NO platform-key budget: this route is public in
  //    middleware, so 'not authenticated' from checkQuota fails CLOSED (401)
  //    — fail-open here would let bare curl burn the platform key unmetered.
  //    Other checkQuota failures (e.g. transient DB) fail open.
  const llm = await resolveLlm();
  if (!llm) {
    return NextResponse.json({ error: 'provider not configured' }, { status: 503 });
  }
  const byo = llm?.source === 'user';
  const metered = !byo;
  let userId: string;
  try {
    const authDb = await getServerSupabase();
    const { data, error } = await authDb.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    }
    userId = data.user.id;
  } catch {
    const locale = await getRequestLocale();
    const budget = getBudgetConfig();
    return NextResponse.json({
      source: 'cost_quota',
      error: apiMessage(locale, 'budgetUnavailable'),
      errorCode: 'budget_unavailable',
      costLimit: {
        dailyMicrormb: budget.dailyLimitMicrormb,
        timezone: 'Asia/Shanghai',
      },
    }, { status: 503 });
  }
  let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;
  if (metered) {
    try {
      quota = await checkQuota('brief_preview');
    } catch (e) {
      if ((e as Error).message === 'not authenticated') {
        return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
      }
      quota = null;
    }
  }
  if (quota && !quota.allowed) {
    const locale = await getRequestLocale();
    return NextResponse.json({
      error: apiMessage(locale, 'quotaExhausted'),
      quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
    }, { status: 429 });
  }

  const budgetExempt = !!llm && llm.source === 'env' && quota?.limit === -1;
  const usageAuditKey = crypto.randomUUID();
  const accounting: MeteredUsage[] = [];
  let usageRunBegun = false;
  let usageFinalizationAttempted = false;
  try {
    const limiter = llm?.source === 'env'
      ? createPersonaConcurrencyLimiter({
          provider: llm.provider,
          model: llm.model,
          maxOutputTokens: 400,
        })
      : createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP);
    const budget = getBudgetConfig();
    await beginUsageRun(userId, usageAuditKey, 'brief_preview', {
      provider: llm.provider,
      model: llm.model,
      pricingVersion: byo ? undefined : PRICING_VERSION,
      usdCnyMicros: byo ? undefined : budget.usdCnyMicros,
      byo,
    });
    usageRunBegun = true;
    const llmCall = llm
      ? async (opts: Parameters<typeof chatResolved>[1]) => {
          try {
            const meteredCall = await limiter.runWithBudgetRetry(() => runMeteredLlmCall({
              feature: 'brief_preview',
              provider: llm,
              userId,
              budgetExempt,
              maxOutputTokens: opts.max_tokens ?? 400,
              call: () => chatResolved(llm, opts),
            }));
            accounting.push(meteredCall.accounting);
            return {
              ...meteredCall.value,
              provider: llm.provider,
              model: llm.model,
            };
          } catch (error) {
            const failedUsage = meteredUsageFromError(error);
            if (failedUsage) accounting.push(failedUsage);
            throw error;
          }
        }
      : undefined;
    const brief = await generateDailyBrief(watchlist, {
      topN,
      mode: 'metered',
      llmCall: llmCall!,
    });
    usageFinalizationAttempted = true;
    await finalizeAccounting(
      userId,
      usageAuditKey,
      { provider: llm.provider, model: llm.model, byo },
      accounting,
      accounting.some((item) => item.status === 'failed') || (brief.meta.failures ?? 0) > 0,
    );
    return briefResponse(brief, format);
  } catch (e: any) {
    if (usageRunBegun && !usageFinalizationAttempted) {
      usageFinalizationAttempted = true;
      try {
        await finalizeAccounting(
          userId,
          usageAuditKey,
          { provider: llm.provider, model: llm.model, byo },
          accounting,
          true,
        );
      } catch (auditError) {
        e = auditError;
      }
    }
    const code = costErrorCode(e);
    if (code) {
      const locale = await getRequestLocale();
      const budget = getBudgetConfig();
      const messageKey = code === 'daily_cost_exhausted'
        ? 'dailyCostExhausted'
        : code === 'pricing_unavailable'
          ? 'pricingUnavailable'
          : code === 'budget_invariant_violation' || code === 'usage_audit_invariant'
            ? 'budgetInvariantViolation'
            : 'budgetUnavailable';
      return NextResponse.json({
        source: 'cost_quota',
        error: apiMessage(locale, messageKey),
        errorCode: code,
        costLimit: {
          dailyMicrormb: budget.dailyLimitMicrormb,
          timezone: 'Asia/Shanghai',
        },
      }, { status: costErrorStatus(code) });
    }
    console.error('brief preview failed', { code: 'brief_generation_failed' });
    return NextResponse.json(
      { error: 'brief generation failed' },
      { status: 500 }
    );
  }
}
