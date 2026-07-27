import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST, type DailyBrief } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';
import { sendEmail, isResendConfigured } from '@/lib/data/sources/resend';
import { resolveLlm } from '@/lib/llm/resolve';
import { chatResolved } from '@/lib/data/sources/llm';
import { beginUsageRun, checkQuota, finalizeUsageRun } from '@/lib/billing/quota';
import {
  aggregateMeteredUsage,
  meteredUsageFromError,
  runMeteredLlmCall,
  type MeteredUsage,
} from '@/lib/billing/metered-llm';
import {
  createConcurrencyLimiter,
  createPersonaConcurrencyLimiter,
  PERSONA_CONCURRENCY_HARD_CAP,
} from '@/lib/billing/llm-concurrency';
import { getBudgetConfig } from '@/lib/billing/cost-budget';
import { getRequestLocale, apiMessage, type ApiMessageKey } from '@/lib/i18n/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { PRICING_VERSION } from '@/lib/billing/llm-pricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MANUAL_BRIEF_WATCHLIST = 10;
const MAX_MANUAL_BRIEF_TOP_N = 5;
const MAX_MANUAL_TEXT_LENGTH = 4_000;
const MAX_MANUAL_SUBJECT_LENGTH = 200;
const ALLOWED_CHANNELS = new Set(['telegram', 'email']);
const SAFE_TICKER = /^[A-Za-z0-9.^_-]{1,32}$/;

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

function costMessageKey(code: string): ApiMessageKey {
  switch (code) {
    case 'daily_cost_exhausted': return 'dailyCostExhausted';
    case 'pricing_unavailable': return 'pricingUnavailable';
    case 'budget_invariant_violation':
    case 'usage_audit_invariant': return 'budgetInvariantViolation';
    case 'budget_unavailable':
    case 'usage_audit_unavailable': return 'budgetUnavailable';
    default: return 'budgetUnavailable';
  }
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

async function deliverBrief(
  brief: DailyBrief,
  requestedChannels: string[],
) {
  const channels: Record<string, unknown> = {};
  if (requestedChannels.includes('telegram')) {
    channels.telegram = isTelegramConfigured()
      ? await sendTelegram(brief.markdown, {
          parseMode: 'Markdown',
          disableWebPagePreview: true,
        })
      : { skipped: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
  }
  if (requestedChannels.includes('email')) {
    channels.email = isResendConfigured()
      ? await sendEmail({
          subject: brief.subject || `Sentinel Morning Note · ${brief.date}`,
          html: brief.html || `<pre>${brief.markdown}</pre>`,
          text: brief.markdown,
        })
      : { skipped: 'RESEND_API_KEY / EMAIL_TO not configured' };
  }
  return channels;
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireAdminUser()).id;
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'authentication unavailable' }, { status: 503 });
  }

  const parsedBody: unknown = await req.json().catch(() => null);
  if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  if ('chatId' in body || 'to' in body) {
    return NextResponse.json({ error: 'recipient overrides are not allowed' }, { status: 400 });
  }
  if (
    (body.channels !== undefined && !Array.isArray(body.channels))
    || (Array.isArray(body.channels) && body.channels.some((channel) => typeof channel !== 'string'))
  ) {
    return NextResponse.json({ error: 'invalid channels' }, { status: 400 });
  }
  if (
    (body.text !== undefined && typeof body.text !== 'string')
    || (body.subject !== undefined && typeof body.subject !== 'string')
    || (body.watchlist !== undefined && !Array.isArray(body.watchlist))
    || (body.topN !== undefined && !Number.isFinite(Number(body.topN)))
    || (body.skipLLM !== undefined && typeof body.skipLLM !== 'boolean')
  ) {
    return NextResponse.json({ error: 'invalid manual brief fields' }, { status: 400 });
  }
  const requestedChannels: string[] = Array.isArray(body.channels)
    ? body.channels as string[]
    : ['telegram', 'email'];
  const text = typeof body.text === 'string' ? body.text : undefined;
  const subject = typeof body.subject === 'string' ? body.subject : 'Sentinel · 测试消息';
  if (
    requestedChannels.length > ALLOWED_CHANNELS.size
    || requestedChannels.some((channel) => !ALLOWED_CHANNELS.has(channel))
    || new Set(requestedChannels).size !== requestedChannels.length
  ) {
    return NextResponse.json({ error: 'invalid channels' }, { status: 400 });
  }
  if ((text?.length ?? 0) > MAX_MANUAL_TEXT_LENGTH || subject.length > MAX_MANUAL_SUBJECT_LENGTH) {
    return NextResponse.json({ error: 'manual message too large' }, { status: 400 });
  }

  if (text) {
    const results: Record<string, unknown> = {};
    if (requestedChannels.includes('telegram') && isTelegramConfigured()) {
      results.telegram = await sendTelegram(text, { parseMode: 'Markdown' });
    }
    if (requestedChannels.includes('email') && isResendConfigured()) {
      results.email = await sendEmail({
        subject,
        text,
        html: `<pre style="font-family:monospace;white-space:pre-wrap;font-size:13px">${text.replace(/</g, '&lt;')}</pre>`,
      });
    }
    return NextResponse.json({ mode: 'raw', channels: results });
  }

  if (Array.isArray(body.watchlist) && body.watchlist.length > MAX_MANUAL_BRIEF_WATCHLIST) {
    return NextResponse.json({ error: 'watchlist too large' }, { status: 400 });
  }
  if (
    Array.isArray(body.watchlist)
    && body.watchlist.some(
      (ticker: unknown) => typeof ticker !== 'string' || !SAFE_TICKER.test(ticker.trim()),
    )
  ) {
    return NextResponse.json({ error: 'invalid watchlist' }, { status: 400 });
  }
  const watchlist = Array.isArray(body.watchlist) && body.watchlist.length > 0
    ? body.watchlist
        .filter((ticker: unknown): ticker is string => typeof ticker === 'string')
        .map((ticker: string) => ticker.trim())
        .filter(Boolean)
        .slice(0, MAX_MANUAL_BRIEF_WATCHLIST)
    : DEFAULT_WATCHLIST;
  const requestedTopN = Number.isFinite(Number(body.topN)) ? Math.trunc(Number(body.topN)) : 5;
  const topN = Math.max(1, Math.min(MAX_MANUAL_BRIEF_TOP_N, requestedTopN));
  const skipLLM = body.skipLLM === true;
  let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;

  try {
    if (skipLLM) {
      const brief = await generateDailyBrief(watchlist, { topN, mode: 'skip_llm' });
      const channels = await deliverBrief(brief, requestedChannels);
      return NextResponse.json({
        mode: 'brief',
        channels,
        brief_meta: {
          date: brief.date,
          subject: brief.subject,
          overall_confidence: brief.overall_confidence,
          overall_label: brief.overall_label,
          top_count: brief.top.length,
          has_top_call: !!brief.top_call,
          trade_ideas_count: brief.trade_ideas?.length || 0,
          duration_ms: brief.meta.duration_ms,
        },
      });
    }

    const llm = await resolveLlm();
    if (!llm) return NextResponse.json({ error: 'provider not configured' }, { status: 503 });
    if (llm.source === 'env') {
      try {
        quota = await checkQuota('brief_preview');
      } catch {
        quota = null;
      }
      if (quota && !quota.allowed) {
        const locale = await getRequestLocale();
        return NextResponse.json({
          error: apiMessage(locale, 'quotaExhausted'),
          quota: quotaNotice('quota_exhausted', quota),
        }, { status: 429 });
      }
    }

    const budgetExempt = llm.source === 'env' && quota?.limit === -1;
    const usageAuditKey = crypto.randomUUID();
    const limiter = llm.source === 'env'
      ? createPersonaConcurrencyLimiter({
          provider: llm.provider,
          model: llm.model,
          maxOutputTokens: 400,
        })
      : createConcurrencyLimiter(PERSONA_CONCURRENCY_HARD_CAP);
    const accounting: MeteredUsage[] = [];
    let usageRunBegun = false;
    let usageFinalizationAttempted = false;
    try {
      const budget = getBudgetConfig();
      const byo = llm.source === 'user';
      await beginUsageRun(userId, usageAuditKey, 'brief_preview', {
        provider: llm.provider,
        model: llm.model,
        pricingVersion: byo ? undefined : PRICING_VERSION,
        usdCnyMicros: byo ? undefined : budget.usdCnyMicros,
        byo,
      });
      usageRunBegun = true;
      const llmCall = async (opts: Parameters<typeof chatResolved>[1]) => {
        try {
          const result = await limiter.runWithBudgetRetry(() => runMeteredLlmCall({
            feature: 'brief_preview',
            provider: llm,
            userId,
            budgetExempt,
            maxOutputTokens: opts.max_tokens ?? 400,
            call: () => chatResolved(llm, opts),
          }));
          accounting.push(result.accounting);
          return { ...result.value, provider: llm.provider, model: llm.model };
        } catch (error) {
          const failedUsage = meteredUsageFromError(error);
          if (failedUsage) accounting.push(failedUsage);
          throw error;
        }
      };
      const brief = await generateDailyBrief(watchlist, { topN, mode: 'metered', llmCall });
      usageFinalizationAttempted = true;
      await finalizeAccounting(
        userId,
        usageAuditKey,
        { provider: llm.provider, model: llm.model, byo },
        accounting,
        accounting.some((item) => item.status === 'failed') || (brief.meta.failures ?? 0) > 0,
      );
      const channels = await deliverBrief(brief, requestedChannels);
      return NextResponse.json({
        mode: 'brief',
        channels,
        brief_meta: {
          date: brief.date,
          subject: brief.subject,
          overall_confidence: brief.overall_confidence,
          overall_label: brief.overall_label,
          top_count: brief.top.length,
          has_top_call: !!brief.top_call,
          trade_ideas_count: brief.trade_ideas?.length || 0,
          duration_ms: brief.meta.duration_ms,
        },
      });
    } catch (error) {
      let terminalError = error;
      if (usageRunBegun && !usageFinalizationAttempted) {
        usageFinalizationAttempted = true;
        try {
          await finalizeAccounting(
            userId,
            usageAuditKey,
            { provider: llm.provider, model: llm.model, byo: llm.source === 'user' },
            accounting,
            true,
          );
        } catch (auditError) {
          terminalError = auditError;
        }
      }
      throw terminalError;
    }
  } catch (error) {
    const code = costErrorCode(error);
    if (code) {
      const budget = getBudgetConfig();
      const locale = await getRequestLocale();
      return NextResponse.json({
        source: 'cost_quota',
        error: apiMessage(locale, costMessageKey(code)),
        code,
        errorCode: code,
        ...(code === 'daily_cost_exhausted' ? { quota: quotaNotice('daily_cost_exhausted', quota) } : {}),
        costLimit: {
          dailyMicrormb: budget.dailyLimitMicrormb,
          timezone: 'Asia/Shanghai',
        },
      }, { status: costErrorStatus(code) });
    }
    console.error('manual brief send failed', { code: 'brief_send_failed', user_id: userId });
    return NextResponse.json({ error: 'brief generation failed' }, { status: 500 });
  }
}
