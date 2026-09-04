import { NextResponse } from 'next/server';
import { chatResolved, extractJson } from '@/lib/data/sources/llm';
import { PERSONAS, buildUserMessage, type PerspectiveResult } from '@/lib/data/personas';
import { resolveLlm } from '@/lib/llm/resolve';
import { beginUsageRun, checkQuota, finalizeUsageRun } from '@/lib/billing/quota';
import { getRequestLocale, apiMessage } from '@/lib/i18n/server';
import { sanitizeAiList, sanitizeAiText } from '@/lib/llm/sanitize';
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
import { normalizeEvidenceTickerParam, resolvePerspectiveCitations } from '@/lib/external-evidence';
import { persistStockPerspectives } from '@/lib/stocks/research-artifact-repository';
import { consumeExternalEvidenceQuota } from '@/lib/external-evidence/quota';
import type { PerspectiveProvenance } from '@/lib/stocks/research-types';
import { loadPerspectiveContext } from '@/lib/stocks/perspective-context';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;
export const maxDuration = 60;  // Vercel function timeout

interface Ctx { params: Promise<{ ticker: string }> }

const MAX_PERSONA_OUTPUT_TOKENS = 400;
// Bump when persona instructions or the injected context contract changes.
const PERSPECTIVE_PROMPT_VERSION = 'watchlist-perspectives-2026-09-04.v1';
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

function quotaNotice(
  reason: 'quota_exhausted' | 'daily_cost_exhausted',
  quota: Awaited<ReturnType<typeof checkQuota>> | null,
) {
  const budget = getBudgetConfig();
  return reason === 'quota_exhausted'
    ? { used: quota?.used ?? 0, limit: quota?.limit ?? 0, plan: quota?.plan ?? 'free', reason }
    : { used: 0, limit: 0, plan: quota?.plan ?? 'free', reason, costLimitMicrormb: budget.dailyLimitMicrormb };
}

async function finalizeAccounting(
  userId: string,
  idempotencyKey: string,
  ticker: string,
  initial: { provider: string; model: string; byo: boolean },
  accounting: MeteredUsage[],
  status: 'completed' | 'failed',
): Promise<void> {
  const aggregate = accounting.length > 0 ? aggregateMeteredUsage(accounting) : null;
  const budget = getBudgetConfig();
  await finalizeUsageRun(userId, idempotencyKey, 'perspectives', {
    ticker,
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
    status,
  });
}

export async function GET(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = normalizeEvidenceTickerParam(raw);
  if (!ticker) {
    return NextResponse.json({ error: 'invalid_ticker', perspectives: [] }, { status: 400 });
  }
  const url = new URL(req.url);
  const personaFilter = url.searchParams.get('personas')?.split(',').filter(Boolean);

  const llm = await resolveLlm();
  if (!llm) {
    return NextResponse.json({
      source: 'no-key',
      ticker,
      error: 'No LLM provider configured — set DEEPSEEK_API_KEY (preferred) or ANTHROPIC_API_KEY in Vercel env vars',
      perspectives: [],
    }, { status: 200 });
  }

  // BYO-key calls (user's own provider config) run unmetered; the shared
  // platform key is subject to the daily quota. This route is public in
  // middleware, so 'not authenticated' fails CLOSED (401) — anonymous callers
  // get no platform-key budget. Other checkQuota failures fail open.
  const byo = llm.source === 'user';
  let userId: string;
  let userDb: Awaited<ReturnType<typeof getServerSupabase>>;
  try {
    userDb = await getServerSupabase();
    const { data, error } = await userDb.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    }
    userId = data.user.id;
  } catch {
    const locale = await getRequestLocale();
    const budget = getBudgetConfig();
    return NextResponse.json({
      source: 'cost_quota',
      ticker,
      error: apiMessage(locale, 'budgetUnavailable'),
      errorCode: 'budget_unavailable',
      perspectives: [],
      costLimit: {
        dailyMicrormb: budget.dailyLimitMicrormb,
        timezone: 'Asia/Shanghai',
      },
    }, { status: 503 });
  }
  let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;
  if (!byo) {
    try {
      quota = await checkQuota('perspectives');
    } catch (e) {
      if ((e as Error).message === 'not authenticated') {
        return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
      }
      quota = null;
    }
  }
  if (quota && !quota.allowed) {
    // Field names mirror the no-key degradation shape above so the client
    // can share one "no perspectives, here's why" rendering path.
    const locale = await getRequestLocale();
    return NextResponse.json({
      source: 'quota',
      ticker,
      error: apiMessage(locale, 'quotaExhausted'),
      perspectives: [],
      quota: quotaNotice('quota_exhausted', quota),
    }, { status: 200 });
  }

  try {
    if (!await consumeExternalEvidenceQuota(userDb)) {
      const locale = await getRequestLocale();
      return NextResponse.json({
        source: 'external_evidence_quota',
        ticker,
        error: apiMessage(locale, 'quotaExhausted'),
        errorCode: 'external_evidence_rate_limited',
        perspectives: [],
        retryAfterSeconds: 3600,
      }, { status: 429, headers: { 'retry-after': '3600' } });
    }
  } catch {
    return NextResponse.json({
      source: 'external_evidence_quota',
      ticker,
      error: 'External evidence quota is temporarily unavailable',
      errorCode: 'external_evidence_quota_unavailable',
      perspectives: [],
    }, { status: 503 });
  }

  const budgetExempt = !byo && quota?.limit === -1;
  // 1. Gather normalized context through the shared market, financial, and evidence services.
  const contextBundle = await loadPerspectiveContext(ticker).catch(() => null);
  if (!contextBundle) {
    return NextResponse.json(
      { source: 'context_unavailable', ticker, error: 'Cannot build stock context', perspectives: [] },
      { status: 502 }
    );
  }
  const { context: ctx, evidence } = contextBundle;

  // 2. Run all 9 personas in parallel through the unified LLM facade
  const enabled = personaFilter && personaFilter.length > 0
    ? PERSONAS.filter((p) => personaFilter.includes(p.id))
    : PERSONAS;

  const userMessage = buildUserMessage(ctx);
  const startedAt = Date.now();
  const accounting: MeteredUsage[] = [];
  const usageAuditKey = crypto.randomUUID();
  let limiter: ReturnType<typeof createConcurrencyLimiter>;
  try {
    limiter = llm.source === 'env'
      ? createPersonaConcurrencyLimiter({
          provider: llm.provider,
          model: llm.model,
          maxOutputTokens: MAX_PERSONA_OUTPUT_TOKENS,
        })
      : createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP);
  } catch (error) {
    const code = costErrorCode(error);
    if (!code) throw error;
    const locale = await getRequestLocale();
    const budget = getBudgetConfig();
    return NextResponse.json({
      source: 'cost_quota',
      ticker,
      error: apiMessage(locale, code === 'pricing_unavailable' ? 'pricingUnavailable' : 'budgetUnavailable'),
      errorCode: code,
      perspectives: [],
      costLimit: {
        dailyMicrormb: budget.dailyLimitMicrormb,
        timezone: 'Asia/Shanghai',
      },
    }, { status: costErrorStatus(code) });
  }

  try {
    const budget = getBudgetConfig();
    await beginUsageRun(userId, usageAuditKey, 'perspectives', {
      ticker,
      provider: llm.provider,
      model: llm.model,
      pricingVersion: byo ? undefined : PRICING_VERSION,
      usdCnyMicros: byo ? undefined : budget.usdCnyMicros,
      byo,
    });
  } catch (error) {
    const code = costErrorCode(error) ?? 'usage_audit_unavailable';
    const locale = await getRequestLocale();
    const budget = getBudgetConfig();
    return NextResponse.json({
      source: 'cost_quota',
      ticker,
      error: apiMessage(
        locale,
        code === 'usage_audit_invariant' ? 'budgetInvariantViolation' : 'budgetUnavailable',
      ),
      errorCode: code,
      perspectives: [],
      costLimit: {
        dailyMicrormb: budget.dailyLimitMicrormb,
        timezone: 'Asia/Shanghai',
      },
    }, { status: costErrorStatus(code) });
  }

  const settled = await Promise.allSettled(
    enabled.map(async (p): Promise<PerspectiveResult | null> => {
      let resp;
      try {
        const metered = await limiter.runWithBudgetRetry(() => runMeteredLlmCall({
          feature: 'perspectives',
          provider: llm,
          userId,
          budgetExempt,
          maxOutputTokens: MAX_PERSONA_OUTPUT_TOKENS,
          call: () => chatResolved(llm, {
            system: p.prompt,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: MAX_PERSONA_OUTPUT_TOKENS,
            temperature: 0.7,
            timeoutMs: 30_000,
            responseJson: true,
          }),
        }));
        accounting.push(metered.accounting);
        resp = metered.value;
      } catch (error) {
        const failedUsage = meteredUsageFromError(error);
        if (failedUsage) accounting.push(failedUsage);
        throw error;
      }

      const parsed = extractJson(resp.content);
      if (!parsed) return null;

      const stance = (['bullish', 'neutral', 'bearish'] as const).includes(parsed.stance)
        ? parsed.stance
        : 'neutral';
      const confidence = Math.max(0, Math.min(10, Number(parsed.confidence) || 5));
      const summary = sanitizeAiText(String(parsed.summary || '')).slice(0, 300);
      const rawDataCites = Array.isArray(parsed.data_cites) ? parsed.data_cites : parsed.cites;
      const cites = sanitizeAiList(Array.isArray(rawDataCites) ? rawDataCites.slice(0, 6).map(String) : []);
      const citations = resolvePerspectiveCitations(parsed.citation_ids, evidence.results);

      return {
        persona: p.id,
        name: p.name,
        stance,
        confidence,
        summary,
        cites,
        citations,
      };
    })
  );

  const perspectives = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((p): p is PerspectiveResult => p !== null);

  const failures = settled
    .map((s, i) => (s.status === 'rejected'
      ? {
          persona: enabled[i].id,
          code: costErrorCode(s.reason) ?? 'provider_error',
        }
      : null))
    .filter(Boolean);

  let rejectedCostError = settled
    .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
    .map((item) => costErrorCode(item.reason))
    .find((code): code is string => code !== null);
  const auditStatus = failures.length > 0 || perspectives.length !== enabled.length
    ? 'failed'
    : 'completed';
  try {
    await finalizeAccounting(
      userId,
      usageAuditKey,
      ticker,
      { provider: llm.provider, model: llm.model, byo },
      accounting,
      auditStatus,
    );
  } catch (error) {
    rejectedCostError = costErrorCode(error) ?? 'usage_audit_unavailable';
  }

  if (rejectedCostError) {
    const locale = await getRequestLocale();
    const budget = getBudgetConfig();
    const messageKey = rejectedCostError === 'daily_cost_exhausted'
      ? 'dailyCostExhausted'
      : rejectedCostError === 'pricing_unavailable'
        ? 'pricingUnavailable'
        : rejectedCostError === 'budget_invariant_violation'
          || rejectedCostError === 'usage_audit_invariant'
          ? 'budgetInvariantViolation'
          : 'budgetUnavailable';
    return NextResponse.json({
      source: 'cost_quota',
      ticker,
      error: apiMessage(locale, messageKey),
      errorCode: rejectedCostError,
      perspectives: [],
      ...(rejectedCostError === 'daily_cost_exhausted' ? { quota: quotaNotice('daily_cost_exhausted', quota) } : {}),
      costLimit: {
        dailyMicrormb: budget.dailyLimitMicrormb,
        timezone: 'Asia/Shanghai',
      },
    }, { status: costErrorStatus(rejectedCostError) });
  }

  const aggregate = accounting.length > 0 ? aggregateMeteredUsage(accounting) : null;
  const budgetConfig = getBudgetConfig();
  const generatedAt = new Date().toISOString();
  const perspectiveProvenance: PerspectiveProvenance = {
    modelVersion: llm.model,
    promptVersion: PERSPECTIVE_PROMPT_VERSION,
    // An unavailable/error snapshot may still carry an internal UUID for
    // tracing, but it is not an auditable evidence request. Keep that ID out
    // of user-facing provenance so the UI cannot imply citations exist.
    evidenceRequestId: evidence.status === 'complete' || evidence.status === 'partial'
      ? evidence.requestId
      : null,
    evidenceFetchedAt: evidence.status === 'complete' || evidence.status === 'partial'
      ? evidence.fetchedAt
      : null,
    evidenceResultCount: evidence.results.length,
    evidenceCoverageRatio: perspectives.length > 0
      ? perspectives.filter((item) => item.citations && item.citations.length > 0).length / perspectives.length
      : 0,
  };
  const persistenceWarnings: string[] = [];
  try {
    await persistStockPerspectives(userDb, userId, {
      ticker,
      generationId: usageAuditKey,
      source: `${llm.provider}:${llm.model}`,
      createdAt: generatedAt,
      provenance: perspectiveProvenance,
      perspectives,
    });
  } catch {
    persistenceWarnings.push('perspectives_persist_failed');
  }

  return NextResponse.json({
    source: [llm.provider, ...contextBundle.sources].join('+'),
    ticker,
    context: ctx,
    perspectives,
    meta: {
      generated_at: generatedAt,
      duration_ms: Date.now() - startedAt,
      provider: llm.provider,
      model: llm.model,
      prompt_version: PERSPECTIVE_PROMPT_VERSION,
      personas_attempted: enabled.length,
      personas_succeeded: perspectives.length,
      tokens: {
        input: aggregate?.usage.inputTokens ?? 0,
        output: aggregate?.usage.outputTokens ?? 0,
      },
      cost_micrormb: aggregate?.costMicrormb ?? 0,
      est_cost_usd: Number(
        ((aggregate?.costMicrormb ?? 0) / budgetConfig.usdCnyMicros).toFixed(5),
      ),
      failures: failures.length > 0 ? failures.slice(0, 3) : undefined,
      warnings: persistenceWarnings,
      evidence: {
        request_id: evidence.requestId,
        status: evidence.status,
        provider: evidence.provider,
        result_count: evidence.results.length,
        fetched_at: evidence.fetchedAt,
        warnings: evidence.warnings,
        coverage_ratio: perspectiveProvenance.evidenceCoverageRatio,
      },
      financial: {
        source: contextBundle.financial.source,
        status: contextBundle.financial.availability,
        as_of: contextBundle.financial.asOf,
        warnings: contextBundle.financial.warnings,
      },
      provenance: perspectiveProvenance,
    },
  });
}
