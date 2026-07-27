import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST, type DailyBrief } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';
import { sendEmail, isResendConfigured } from '@/lib/data/sources/resend';
import { getServerSupabase } from '@/lib/supabase/server';
import { resolveLlm } from '@/lib/llm/resolve';
import { chatResolved } from '@/lib/data/sources/llm';
import { checkQuota, recordUsageForUser } from '@/lib/billing/quota';
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
import { getRequestLocale, apiMessage } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MANUAL_BRIEF_WATCHLIST = 10;
const MAX_MANUAL_BRIEF_TOP_N = 5;

const COST_ERROR_CODES = new Set([
  'daily_cost_exhausted',
  'pricing_unavailable',
  'budget_unavailable',
  'budget_invariant_violation',
]);

function costErrorCode(error: unknown): string | null {
  const code = error instanceof Error ? error.message : String(error);
  return COST_ERROR_CODES.has(code) ? code : null;
}

function costErrorStatus(code: string): number {
  if (code === 'daily_cost_exhausted') return 429;
  if (code === 'budget_unavailable') return 503;
  return 500;
}

async function recordAccounting(
  userId: string,
  idempotencyKey: string,
  accounting: MeteredUsage[],
  failed: boolean,
): Promise<void> {
  if (accounting.length === 0) return;
  const aggregate = aggregateMeteredUsage(accounting);
  await recordUsageForUser(userId, idempotencyKey, 'brief_preview', {
    provider: aggregate.provider,
    model: aggregate.model,
    inputTokens: aggregate.usage.inputTokens,
    cacheHitInputTokens: aggregate.usage.cacheHitInputTokens,
    cacheMissInputTokens: aggregate.usage.cacheMissInputTokens,
    outputTokens: aggregate.usage.outputTokens,
    costMicrormb: aggregate.costMicrormb,
    pricingVersion: aggregate.pricingVersion,
    usdCnyMicros: aggregate.usdCnyMicros,
    usageEstimated: aggregate.usageEstimated,
    byo: aggregate.byo,
    status: failed ? 'failed' : 'completed',
  });
}

async function deliverBrief(
  brief: DailyBrief,
  requestedChannels: string[],
  overrides: { chatId?: string; to?: string | string[] },
) {
  const channels: Record<string, unknown> = {};
  if (requestedChannels.includes('telegram')) {
    channels.telegram = isTelegramConfigured() || overrides.chatId
      ? await sendTelegram(brief.markdown, {
          chatId: overrides.chatId,
          parseMode: 'Markdown',
          disableWebPagePreview: true,
        })
      : { skipped: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
  }
  if (requestedChannels.includes('email')) {
    channels.email = isResendConfigured() || overrides.to
      ? await sendEmail({
          to: overrides.to,
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
    const authDb = await getServerSupabase();
    const { data, error } = await authDb.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    userId = data.user.id;
  } catch {
    return NextResponse.json({ error: 'authentication unavailable' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedChannels: string[] = Array.isArray(body.channels) && body.channels.length > 0
    ? body.channels.filter((channel: unknown): channel is string => typeof channel === 'string')
    : ['telegram', 'email'];
  const text = typeof body.text === 'string' ? body.text : undefined;
  const subject = typeof body.subject === 'string' ? body.subject : 'Sentinel · 测试消息';

  if (text) {
    const results: Record<string, unknown> = {};
    if (requestedChannels.includes('telegram') && (isTelegramConfigured() || body.chatId)) {
      results.telegram = await sendTelegram(text, { chatId: body.chatId, parseMode: 'Markdown' });
    }
    if (requestedChannels.includes('email') && (isResendConfigured() || body.to)) {
      results.email = await sendEmail({
        to: body.to,
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

  try {
    if (skipLLM) {
      const brief = await generateDailyBrief(watchlist, { topN, mode: 'skip_llm' });
      const channels = await deliverBrief(brief, requestedChannels, { chatId: body.chatId, to: body.to });
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
    let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;
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
          quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
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
    try {
      const llmCall = async (opts: Parameters<typeof chatResolved>[1]) => {
        try {
          const result = await limiter.run(() => runMeteredLlmCall({
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
      await recordAccounting(
        userId,
        usageAuditKey,
        accounting,
        accounting.some((item) => item.status === 'failed') || (brief.meta.failures ?? 0) > 0,
      );
      const channels = await deliverBrief(brief, requestedChannels, { chatId: body.chatId, to: body.to });
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
      await recordAccounting(userId, usageAuditKey, accounting, true);
      throw error;
    }
  } catch (error) {
    const code = costErrorCode(error);
    if (code) {
      const budget = getBudgetConfig();
      return NextResponse.json({
        source: 'cost_quota',
        error: code,
        errorCode: code,
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
