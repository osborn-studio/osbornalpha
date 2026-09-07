import { chatResolved, extractJson } from '@/lib/data/sources/llm';
import {
  PERSONAS,
  buildUserMessage,
  perspectiveStructuredDataCites,
  type PerspectiveResult,
} from '@/lib/data/personas';
import type { ResolvedLlm } from '@/lib/llm/resolve';
import { beginUsageRun, finalizeUsageRun, type QuotaResult } from '@/lib/billing/quota';
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
import { persistStockPerspectives, type ResearchArtifactClient } from './research-artifact-repository';
import type { PerspectiveProvenance } from './research-types';
import { loadPerspectiveContext } from './perspective-context';
import { selectPerspectivePersonas } from './perspective-router';
import { normalizePerspectiveModelOutput } from './perspective-output';
import {
  perspectiveAnalysisRequirementMet,
  resolvePerspectiveAnalysis,
  type PerspectiveAnalysisRequestMode,
  type PerspectiveAnalysisResolution,
} from './perspective-analysis';

const MAX_PERSONA_OUTPUT_TOKENS = 400;
export const PERSPECTIVE_PROMPT_VERSION = 'watchlist-perspectives-2026-09-05.v4';
const COST_ERROR_CODES = new Set([
  'daily_cost_exhausted',
  'pricing_unavailable',
  'budget_unavailable',
  'budget_invariant_violation',
  'usage_audit_unavailable',
  'usage_audit_invariant',
]);

export type PerspectiveGenerationStage = 'context' | 'model' | 'persistence' | 'complete';

export class PerspectiveGenerationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly source: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'PerspectiveGenerationError';
  }
}

export interface GenerateStockPerspectivesInput {
  ticker: string;
  userId: string;
  db: ResearchArtifactClient;
  llm: ResolvedLlm;
  personaIds: string[] | null;
  analysisMode: PerspectiveAnalysisRequestMode;
  includeExternalEvidence: boolean;
  analysisWarnings?: string[];
  quota?: QuotaResult | null;
  usageIdempotencyKey?: string;
  signal?: AbortSignal;
  onProgress?: (stage: PerspectiveGenerationStage, progress: number) => Promise<void> | void;
  isCancelled?: () => Promise<boolean> | boolean;
}

function costErrorCode(error: unknown): string | null {
  const code = error instanceof Error ? error.message : String(error);
  return COST_ERROR_CODES.has(code) ? code : null;
}

function perspectiveFailureCode(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  return code === 'evidence_citation_required' || code === 'invalid_model_output'
    || code === 'non_compliant_model_output'
    ? code
    : costErrorCode(error) ?? 'provider_error';
}

export function perspectiveCostErrorStatus(code: string): number {
  if (code === 'daily_cost_exhausted') return 429;
  if (code === 'budget_unavailable' || code === 'usage_audit_unavailable') return 503;
  return 500;
}

function quotaNotice(
  reason: 'quota_exhausted' | 'daily_cost_exhausted',
  quota: QuotaResult | null,
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

function analysisMeta(
  resolution: PerspectiveAnalysisResolution,
  context: { market_as_of?: string | null; financial_as_of?: string | null },
) {
  return {
    requested_mode: resolution.requestedMode,
    resolved_mode: resolution.resolvedMode,
    evidence_required: resolution.evidenceRequired,
    evidence_available: resolution.evidenceAvailable,
    evidence_status: resolution.evidenceStatus,
    data_as_of: {
      market: context.market_as_of ?? null,
      financial: context.financial_as_of ?? null,
    },
    warnings: resolution.warnings,
  };
}

async function progress(
  input: GenerateStockPerspectivesInput,
  stage: PerspectiveGenerationStage,
  value: number,
) {
  await input.onProgress?.(stage, value);
}

async function assertNotCancelled(input: GenerateStockPerspectivesInput) {
  if (await input.isCancelled?.()) {
    throw new PerspectiveGenerationError('perspective_job_cancelled', 409, 'job');
  }
}

export async function generateStockPerspectives(
  input: GenerateStockPerspectivesInput,
): Promise<Record<string, unknown>> {
  const {
    ticker, userId, db, llm, personaIds, analysisMode, includeExternalEvidence,
    analysisWarnings = [], quota = null,
  } = input;
  const byo = llm.source === 'user';
  const budgetExempt = !byo && quota?.limit === -1;
  const startedAt = Date.now();

  await assertNotCancelled(input);
  await progress(input, 'context', 15);
  let contextBundle: Awaited<ReturnType<typeof loadPerspectiveContext>>;
  try {
    contextBundle = await loadPerspectiveContext(ticker, {
      includeExternalEvidence,
      evidenceSkipWarning: analysisWarnings[0] ?? 'external_evidence_not_requested',
      signal: input.signal,
    });
  } catch {
    await assertNotCancelled(input);
    contextBundle = null;
  }
  if (!contextBundle) {
    throw new PerspectiveGenerationError('perspective_context_unavailable', 502, 'context_unavailable');
  }
  const { context: ctx, evidence } = contextBundle;
  const analysis = resolvePerspectiveAnalysis(analysisMode, evidence, analysisWarnings);
  if (!perspectiveAnalysisRequirementMet(analysis)) {
    throw new PerspectiveGenerationError('external_evidence_required', 424, 'external_evidence_required', {
      meta: {
        analysis: analysisMeta(analysis, ctx),
        evidence: {
          status: evidence.status,
          provider: evidence.provider,
          result_count: evidence.results.length,
          fetched_at: evidence.fetchedAt,
          warnings: evidence.warnings,
        },
      },
    });
  }

  const enabled = selectPerspectivePersonas(PERSONAS, ctx, personaIds);
  const userMessage = buildUserMessage(ctx, { analysisMode: analysis.resolvedMode });
  const accounting: MeteredUsage[] = [];
  const usageAuditKey = input.usageIdempotencyKey ?? crypto.randomUUID();
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
    const budget = getBudgetConfig();
    throw new PerspectiveGenerationError(code, perspectiveCostErrorStatus(code), 'cost_quota', {
      costLimit: { dailyMicrormb: budget.dailyLimitMicrormb, timezone: 'Asia/Shanghai' },
    });
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
    const budget = getBudgetConfig();
    throw new PerspectiveGenerationError(code, perspectiveCostErrorStatus(code), 'cost_quota', {
      costLimit: { dailyMicrormb: budget.dailyLimitMicrormb, timezone: 'Asia/Shanghai' },
    });
  }

  await assertNotCancelled(input);
  await progress(input, 'model', 35);
  const settled = await Promise.allSettled(
    enabled.map(async (persona): Promise<PerspectiveResult | null> => {
      let response;
      try {
        const metered = await limiter.runWithBudgetRetry(() => runMeteredLlmCall({
          feature: 'perspectives',
          provider: llm,
          userId,
          budgetExempt,
          maxOutputTokens: MAX_PERSONA_OUTPUT_TOKENS,
          call: () => chatResolved(llm, {
            system: persona.prompt,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: MAX_PERSONA_OUTPUT_TOKENS,
            temperature: 0.7,
            timeoutMs: 30_000,
            responseJson: true,
            signal: input.signal,
          }),
        }));
        accounting.push(metered.accounting);
        response = metered.value;
      } catch (error) {
        const failedUsage = meteredUsageFromError(error);
        if (failedUsage) accounting.push(failedUsage);
        throw error;
      }

      const parsed = extractJson(response.content);
      if (!parsed) throw new Error('invalid_model_output');
      return normalizePerspectiveModelOutput({
        value: parsed,
        persona,
        evidence: evidence.results,
        analysisMode: analysis.resolvedMode,
        allowedDataCites: perspectiveStructuredDataCites(ctx),
      });
    }),
  );

  const perspectives = settled
    .map((result) => result.status === 'fulfilled' ? result.value : null)
    .filter((perspective): perspective is PerspectiveResult => perspective !== null);
  const failures = settled.flatMap((result, index) => result.status === 'rejected'
    ? [{ persona: enabled[index].id, code: perspectiveFailureCode(result.reason) }]
    : []);
  let rejectedCostError = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => costErrorCode(result.reason))
    .find((code): code is string => code !== null);
  const auditStatus = failures.length > 0 || perspectives.length !== enabled.length ? 'failed' : 'completed';
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
    const budget = getBudgetConfig();
    throw new PerspectiveGenerationError(
      rejectedCostError,
      perspectiveCostErrorStatus(rejectedCostError),
      'cost_quota',
      {
        ...(rejectedCostError === 'daily_cost_exhausted'
          ? { quota: quotaNotice('daily_cost_exhausted', quota) }
          : {}),
        costLimit: { dailyMicrormb: budget.dailyLimitMicrormb, timezone: 'Asia/Shanghai' },
      },
    );
  }

  await assertNotCancelled(input);
  await progress(input, 'persistence', 85);
  const aggregate = accounting.length > 0 ? aggregateMeteredUsage(accounting) : null;
  const budgetConfig = getBudgetConfig();
  const generatedAt = new Date().toISOString();
  const provenance: PerspectiveProvenance = {
    modelVersion: llm.model,
    promptVersion: PERSPECTIVE_PROMPT_VERSION,
    requestedAnalysisMode: analysis.requestedMode,
    resolvedAnalysisMode: analysis.resolvedMode,
    evidenceStatus: analysis.evidenceStatus,
    evidenceRequestId: analysis.evidenceAvailable ? evidence.requestId : null,
    evidenceFetchedAt: analysis.evidenceAvailable ? evidence.fetchedAt : null,
    evidenceResultCount: evidence.results.length,
    evidenceCoverageRatio: perspectives.length > 0
      ? perspectives.filter((item) => item.citations && item.citations.length > 0).length / perspectives.length
      : 0,
  };
  const persistenceWarnings: string[] = [];
  let persistedPerspectives: Awaited<ReturnType<typeof persistStockPerspectives>> = [];
  try {
    persistedPerspectives = await persistStockPerspectives(db, userId, {
      ticker,
      generationId: usageAuditKey,
      source: `${llm.provider}:${llm.model}`,
      createdAt: generatedAt,
      provenance,
      referencePrice: ctx.price,
      perspectives,
    }) ?? [];
  } catch {
    persistenceWarnings.push('perspectives_persist_failed');
  }
  const persistedIdByPersona = new Map(persistedPerspectives.map((item) => [item.persona, item.id]));
  await progress(input, 'complete', 100);

  return {
    source: [llm.provider, ...contextBundle.sources].join('+'),
    ticker,
    context: ctx,
    perspectives: perspectives.map((item) => ({
      ...item,
      ...(persistedIdByPersona.get(item.persona) ? { id: persistedIdByPersona.get(item.persona) } : {}),
    })),
    meta: {
      generation_id: usageAuditKey,
      generated_at: generatedAt,
      duration_ms: Date.now() - startedAt,
      provider: llm.provider,
      model: llm.model,
      prompt_version: PERSPECTIVE_PROMPT_VERSION,
      personas_attempted: enabled.length,
      personas_succeeded: perspectives.length,
      persona_routing: personaIds ? 'explicit' : 'importance',
      tokens: { input: aggregate?.usage.inputTokens ?? 0, output: aggregate?.usage.outputTokens ?? 0 },
      cost_micrormb: aggregate?.costMicrormb ?? 0,
      est_cost_usd: Number(((aggregate?.costMicrormb ?? 0) / budgetConfig.usdCnyMicros).toFixed(5)),
      failures: failures.length > 0 ? failures.slice(0, 3) : undefined,
      warnings: persistenceWarnings,
      analysis: analysisMeta(analysis, ctx),
      evidence: {
        request_id: provenance.evidenceRequestId,
        status: evidence.status,
        provider: evidence.provider,
        result_count: evidence.results.length,
        fetched_at: evidence.fetchedAt,
        warnings: evidence.warnings,
        coverage_ratio: provenance.evidenceCoverageRatio,
      },
      financial: {
        source: contextBundle.financial.source,
        status: contextBundle.financial.availability,
        as_of: contextBundle.financial.asOf,
        warnings: contextBundle.financial.warnings,
      },
      provenance,
    },
  };
}
