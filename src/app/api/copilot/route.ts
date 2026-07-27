import { runCopilotLoop, type CopilotEvent, type OaiMessage } from './loop';
import { toolChat } from '@/lib/llm/openai-compat';
import { anthropicToolChat } from '@/lib/llm/anthropic-compat';
import { resolveLlm, resolvePlatformLlm, type ResolvedLlm } from '@/lib/llm/resolve';
import { TOOLS_BY_NAME, OPENAI_TOOL_DEFS } from '@/lib/agent/tools';
import { JOHN_CAMERON_5STEP } from '@/lib/agent/methods/john-cameron-5step';
import { AGENT_METHODS } from '@/lib/agent/methods/registry';
import { createArtifact } from '@/lib/portfolio/artifacts-store';
import { checkQuota, recordUsage, type QuotaResult } from '@/lib/billing/quota';
import { getBudgetConfig, reserveCostBudget, type CostSettlement } from '@/lib/billing/cost-budget';
import {
  PRICING_VERSION,
  type NormalizedUsage,
} from '@/lib/billing/llm-pricing';
import { getRequestLocale, apiMessage, type ApiMessageKey } from '@/lib/i18n/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  completeAiRun,
  createAiRun,
  failAiRun,
  failStaleAiRuns,
  stableAiErrorCode,
} from '@/lib/copilot/runs';
import { createModelInvoker } from '@/lib/copilot/provider-fallback';
import { normalizeCopilotTicker, resolveCopilotTicker } from '@/lib/copilot/request';
import { searchSecurities } from '@/lib/securities/search';
import {
  MAX_OUTPUT_TOKENS,
  copilotUsageLabels,
  conservativeInputTokenEstimate,
} from '@/lib/copilot/cost-accounting';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

interface RunUsage {
  provider: string;
  model: string;
  inputTokens: number;
  cacheHitInputTokens: number;
  cacheMissInputTokens: number;
  outputTokens: number;
  costMicrormb: number;
  usageEstimated: boolean;
  byo: boolean;
}

function safeSum(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function costMessageKey(code: string): ApiMessageKey | null {
  switch (code) {
    case 'daily_cost_exhausted': return 'dailyCostExhausted';
    case 'pricing_unavailable': return 'pricingUnavailable';
    case 'budget_unavailable': return 'budgetUnavailable';
    case 'budget_invariant_violation': return 'budgetInvariantViolation';
    default: return null;
  }
}

// Auto-archive threshold: skip near-empty runs (e.g. immediate errors).
const MIN_ARCHIVE_CHARS = 200;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { question, methodId } = body;
  const requestedTicker = typeof body.ticker === 'string' && body.ticker.trim() ? body.ticker : null;
  let ticker: string | null = null;
  if (requestedTicker) {
    ticker = normalizeCopilotTicker(requestedTicker);
    if (!ticker) {
      try {
        const searchDb = await getServerSupabase();
        ticker = await resolveCopilotTicker(
          requestedTicker,
          (query, limit) => searchSecurities(searchDb as any, query, limit),
        );
      } catch {
        return new Response('security master unavailable', { status: 503 });
      }
    }
  }
  const method = methodId ? AGENT_METHODS[methodId as string] : undefined;
  // No-ticker discovery methods (e.g. bottleneck-picker / industry-chain) are
  // allowed through when a known methodId pairs with a non-empty question —
  // the loop's task template falls back to the question itself in that case.
  const noTickerAllowed = !!method && typeof question === 'string' && question.trim().length > 0;
  if (requestedTicker && !ticker) return new Response('invalid ticker', { status: 400 });
  if (!ticker && !noTickerAllowed) return new Response('missing ticker', { status: 400 });
  const origin = new URL(req.url).origin;
  const enc = new TextEncoder();
  const resolvedMethod = method ?? JOHN_CAMERON_5STEP;
  const locale = await getRequestLocale();
  // Output-language directive: prompt bodies stay Chinese (method files are
  // not modified — see docs/superpowers/plans/2026-07-03-g1c-dynamic-content.md
  // T2); only the *output* language is steered, via a directive appended to
  // the system prompt at this single call site (shared by both the OpenAI-
  // compat and Anthropic-compat protocol branches below).
  const EN_OUTPUT_DIRECTIVE =
    "\n\nIMPORTANT: The user's interface language is English. Write your ENTIRE analysis, all section content, and the final verdict summary in English. Keep the verdict JSON schema keys unchanged.";
  const systemPrompt = locale === 'en'
    ? resolvedMethod.systemPrompt + EN_OUTPUT_DIRECTIVE
    : resolvedMethod.systemPrompt;

  // Resolve the user's (or env) LLM provider config.
  const llm = await resolveLlm();
  const byo = llm?.source === 'user';
  const platformFallback = byo ? resolvePlatformLlm() : null;

  // Non-BYO calls are subject to the daily platform quota. This route is
  // public in middleware, so 'not authenticated' from checkQuota() fails
  // CLOSED — anonymous callers get no platform-key budget (fail-open would
  // let bare curl burn the platform key unmetered). Other failures
  // (transient DB) fail open: quota is cost protection, not a 500 excuse.
  let quota: QuotaResult | null = null;
  if (!byo) {
    try {
      quota = await checkQuota('copilot');
    } catch (e) {
      if ((e as Error).message === 'not authenticated') {
        return new Response(JSON.stringify({ error: 'not authenticated' }), {
          status: 401, headers: { 'content-type': 'application/json' },
        });
      }
      quota = null;
    }
  }

  const runStartedAt = Date.now();
  let runId: string | null = null;
  let runDb: Awaited<ReturnType<typeof getServerSupabase>> | null = null;
  if (llm && (!quota || quota.allowed)) {
    try {
      runDb = await getServerSupabase();
      const { data: { user } } = await runDb.auth.getUser();
      if (user) {
        try {
          await failStaleAiRuns(runDb as any, user.id, new Date(Date.now() - 10 * 60_000));
        } catch {
          console.warn('stale ai run reconciliation failed', { code: 'storage_unavailable' });
        }
        runId = await createAiRun(runDb as any, {
          userId: user.id,
          ticker: ticker || null,
          methodId: resolvedMethod.id,
          question,
        });
      }
    } catch {
      runDb = null;
      console.warn('ai run create failed', { code: 'storage_unavailable' });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: CopilotEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      // Step scaffold first so the UI can render the method's step placeholders.
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'steps', steps: resolvedMethod.steps })}\n\n`));

      if (!llm) {
        send({ type: 'error', code: 'provider_not_configured', message: apiMessage(locale, 'providerNotConfigured') });
        send({ type: 'done' });
        controller.close();
        return;
      }

      if (quota && !quota.allowed) {
        // Backward-compatible shape: `message` is always present (old clients
        // still render the red-text error), `quota` is additive (new clients
        // detect it and render the QuotaNotice upgrade card instead).
        send({
          type: 'error',
          code: 'quota_exhausted',
          message: apiMessage(locale, 'quotaExhausted'),
          quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
        });
        send({ type: 'done' });
        controller.close();
        return;
      }

      if (runId) send({ type: 'run', run_id: runId });

      // Accumulate token text + verdict for optional post-run archiving.
      let archivedText = '';
      let archivedVerdict: unknown = null;
      let runFailed = false;
      let runErrorCode = 'provider_error';
      let fallbackQuota: QuotaResult | null = null;
      const runUsage = new Map<string, RunUsage>();
      const attemptedModels = new Map<string, Pick<ResolvedLlm, 'source' | 'provider' | 'model'>>();
      const addUsage = (
        provider: ResolvedLlm,
        usage: NormalizedUsage,
        settlement?: CostSettlement,
      ) => {
        const key = `${provider.source}\u0000${provider.provider}\u0000${provider.model}`;
        const current = runUsage.get(key) ?? {
          provider: provider.provider,
          model: provider.model,
          inputTokens: 0,
          cacheHitInputTokens: 0,
          cacheMissInputTokens: 0,
          outputTokens: 0,
          costMicrormb: 0,
          usageEstimated: false,
          byo: provider.source === 'user',
        };
        current.inputTokens = safeSum(current.inputTokens, usage.inputTokens);
        current.cacheHitInputTokens = safeSum(current.cacheHitInputTokens, usage.cacheHitInputTokens);
        current.cacheMissInputTokens = safeSum(current.cacheMissInputTokens, usage.cacheMissInputTokens);
        current.outputTokens = safeSum(current.outputTokens, usage.outputTokens);
        current.costMicrormb = safeSum(current.costMicrormb, settlement?.costMicrormb ?? 0);
        current.usageEstimated ||= usage.estimated || settlement?.usageEstimated === true;
        runUsage.set(key, current);
      };
      const writeUsage = async (status: 'completed' | 'failed') => {
        const usageGroups = [...runUsage.values()];
        const attempted = [...attemptedModels.values()];
        const labels = copilotUsageLabels(
          usageGroups.length > 0
            ? usageGroups
            : attempted.length > 0
              ? attempted
              : [llm],
        );
        const runByo = (attempted.length > 0 ? attempted : [llm])
          .every((provider) => provider.source === 'user');
        const aggregate = usageGroups.reduce<RunUsage>((total, usage) => ({
          provider: labels.provider,
          model: labels.model,
          inputTokens: safeSum(total.inputTokens, usage.inputTokens),
          cacheHitInputTokens: safeSum(total.cacheHitInputTokens, usage.cacheHitInputTokens),
          cacheMissInputTokens: safeSum(total.cacheMissInputTokens, usage.cacheMissInputTokens),
          outputTokens: safeSum(total.outputTokens, usage.outputTokens),
          costMicrormb: safeSum(total.costMicrormb, usage.costMicrormb),
          usageEstimated: total.usageEstimated || usage.usageEstimated,
          byo: runByo,
        }), {
          provider: labels.provider,
          model: labels.model,
          inputTokens: 0,
          cacheHitInputTokens: 0,
          cacheMissInputTokens: 0,
          outputTokens: 0,
          costMicrormb: 0,
          usageEstimated: false,
          byo: runByo,
        });
        const budgetConfig = getBudgetConfig();
        await recordUsage('copilot', {
          ticker: ticker || undefined,
          provider: aggregate.provider,
          model: aggregate.model,
          inputTokens: aggregate.inputTokens,
          cacheHitInputTokens: aggregate.cacheHitInputTokens,
          cacheMissInputTokens: aggregate.cacheMissInputTokens,
          outputTokens: aggregate.outputTokens,
          costMicrormb: aggregate.costMicrormb,
          pricingVersion: aggregate.byo ? undefined : PRICING_VERSION,
          usdCnyMicros: aggregate.byo ? undefined : budgetConfig.usdCnyMicros,
          usageEstimated: aggregate.usageEstimated,
          byo: aggregate.byo,
          status,
        });
      };
      const onEvent = (e: CopilotEvent) => {
        if (e.type === 'token') archivedText += e.text;
        if (e.type === 'verdict') archivedVerdict = e.data;
        if (e.type === 'error') {
          runFailed = true;
          runErrorCode = e.code ?? stableAiErrorCode(e.message);
          if (runErrorCode === 'quota_exhausted' && fallbackQuota) {
            send({
              ...e,
              code: runErrorCode,
              message: apiMessage(locale, 'quotaExhausted'),
              quota: {
                used: fallbackQuota.used,
                limit: fallbackQuota.limit,
                plan: fallbackQuota.plan,
              },
            });
            return;
          }
          const messageKey = costMessageKey(runErrorCode);
          if (messageKey) {
            send({ ...e, code: runErrorCode, message: apiMessage(locale, messageKey) });
            return;
          }
          send({ ...e, code: runErrorCode, message: apiMessage(locale, 'providerFailed') });
          return;
        }
        send(e);
      };

      const callModel = async (provider: ResolvedLlm, messages: OaiMessage[]) => {
        const cfg = {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.model,
          chatPath: provider.chatPath,
        };
        const common = {
          system: systemPrompt,
          messages,
          tools: OPENAI_TOOL_DEFS,
          max_tokens: MAX_OUTPUT_TOKENS,
        };
        let reservation: Awaited<ReturnType<typeof reserveCostBudget>> | null = null;
        if (provider.source === 'env') {
          try {
            const authDb = await getServerSupabase();
            const { data, error } = await authDb.auth.getUser();
            if (error || !data.user) throw new Error('budget_unavailable');
            reservation = await reserveCostBudget(getAdminSupabase(), data.user.id, {
              feature: 'copilot',
              provider: provider.provider,
              model: provider.model,
              estimatedInputTokens: conservativeInputTokenEstimate(systemPrompt, messages),
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            });
          } catch (error) {
            const code = stableAiErrorCode(error);
            if (costMessageKey(code)) throw new Error(code);
            throw new Error('budget_unavailable');
          }
        }

        attemptedModels.set(
          `${provider.source}\u0000${provider.provider}\u0000${provider.model}`,
          { source: provider.source, provider: provider.provider, model: provider.model },
        );
        let r;
        try {
          r = provider.protocol === 'anthropic'
            ? await anthropicToolChat(cfg, common)
            : await toolChat(cfg, {
                ...common,
                // DeepSeek V4 thinking mode requires reasoning_content to be
                // replayed after tool calls and spends the same max_tokens
                // budget on hidden reasoning. This adapter intentionally uses
                // non-thinking mode for deterministic multi-turn tool work.
                thinking: provider.provider === 'deepseek' ? 'disabled' : undefined,
              });
        } catch (error) {
          if (reservation) {
            try {
              await reservation.release();
            } catch (releaseError) {
              throw releaseError;
            }
          }
          throw error;
        }

        if (reservation) {
          const settlement = await reservation.settle(r.usage);
          addUsage(provider, r.usage, settlement);
        } else {
          addUsage(provider, r.usage);
        }
        return {
          content: r.content,
          toolCalls: r.toolCalls,
          finishReason: r.finishReason,
          usage: r.usage,
        };
      };

      const invokeModel = createModelInvoker<ResolvedLlm, [OaiMessage[]], Awaited<ReturnType<typeof callModel>>>({
        primary: llm,
        fallback: platformFallback,
        beforeFallback: async () => {
          try {
            fallbackQuota = await checkQuota('copilot');
          } catch (error) {
            if ((error as Error).message === 'not authenticated') throw error;
            fallbackQuota = null;
          }
          if (fallbackQuota && !fallbackQuota.allowed) throw new Error('quota exhausted');
        },
        onFallback: (error) => {
          console.warn('copilot provider fallback', {
            from: llm.provider,
            to: platformFallback?.provider,
            code: stableAiErrorCode(error),
            method_id: resolvedMethod.id,
          });
          send({
            type: 'notice',
            code: 'provider_fallback',
            message: apiMessage(locale, 'providerFallback'),
          });
        },
        call: callModel,
      });

      try {
        await runCopilotLoop({
          ticker: ticker || undefined, question, maxHops: resolvedMethod.maxHops ?? 12, onEvent,
          model: invokeModel,
          runTool: (name, args) => {
            const tool = TOOLS_BY_NAME[name];
            if (!tool) return Promise.resolve({ error: `unknown tool ${name}` });
            return tool.handler(args, { origin });
          },
        });

        if (!runFailed) await writeUsage('completed');

        if (resolvedMethod.archive && archivedText.length > MIN_ARCHIVE_CHARS) {
          try {
            const label = ticker || question?.slice(0, 40) || resolvedMethod.name;
            await createArtifact({
              skill_id: resolvedMethod.id,
              ticker: ticker || null,
              title: `${label} ${resolvedMethod.name} ${new Date().toISOString().slice(0, 10)}`,
              content_md: archivedText,
              params: { question, verdict: archivedVerdict },
            });
          } catch {
            // Archiving is best-effort — a failure here must not prevent the stream from closing below.
          }
        }
      } catch (error) {
        runFailed = true;
        runErrorCode = stableAiErrorCode(error);
        const messageKey = costMessageKey(runErrorCode);
        send({
          type: 'error',
          code: runErrorCode,
          message: apiMessage(locale, messageKey ?? 'providerFailed'),
        });
      } finally {
        if (runFailed) await writeUsage('failed');
        if (runId && runDb) {
          try {
            const durationMs = Date.now() - runStartedAt;
            if (runFailed) {
              await failAiRun(runDb as any, runId, {
                errorCode: runErrorCode,
                partialContent: archivedText,
                durationMs,
              });
            } else {
              const verdict = archivedVerdict && typeof archivedVerdict === 'object' && !Array.isArray(archivedVerdict)
                ? archivedVerdict as Record<string, unknown>
                : null;
              await completeAiRun(runDb as any, runId, {
                contentMd: archivedText,
                verdict,
                durationMs,
              });
            }
          } catch {
            console.warn('ai run finalize failed', { run_id: runId, code: 'storage_unavailable' });
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}
