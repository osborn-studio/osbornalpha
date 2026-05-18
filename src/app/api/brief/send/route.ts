import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';
import { sendEmail, isResendConfigured } from '@/lib/data/sources/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/brief/send  — manual trigger.
 * Body (optional):
 *   {
 *     watchlist?: string[],
 *     topN?: number,
 *     skipLLM?: boolean,
 *     channels?: ('telegram' | 'email')[],  // default: all available
 *     chatId?: string,                       // Telegram override
 *     to?: string | string[],                // Email override
 *     text?: string,                         // bypass composer; just send raw text
 *   }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const requestedChannels: string[] = Array.isArray(body.channels) && body.channels.length > 0
    ? body.channels
    : ['telegram', 'email'];

  const text: string | undefined = body.text;
  const subject: string = body.subject || 'Sentinel · 测试消息';

  // ─── Raw text mode (test ping) ──────────────────────────────
  if (text) {
    const results: Record<string, any> = {};
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

  // ─── Generate then send ─────────────────────────────────────
  const watchlist = Array.isArray(body.watchlist) && body.watchlist.length > 0
    ? body.watchlist
    : DEFAULT_WATCHLIST;
  const brief = await generateDailyBrief(watchlist, {
    topN: body.topN ?? 5,
    skipLLM: !!body.skipLLM,
  });

  const channels: Record<string, any> = {};

  // Telegram
  if (requestedChannels.includes('telegram')) {
    if (isTelegramConfigured() || body.chatId) {
      channels.telegram = await sendTelegram(brief.markdown, {
        chatId: body.chatId,
        parseMode: 'Markdown',
        disableWebPagePreview: true,
      });
    } else {
      channels.telegram = { skipped: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured' };
    }
  }

  // Email
  if (requestedChannels.includes('email')) {
    if (isResendConfigured() || body.to) {
      channels.email = await sendEmail({
        to: body.to,
        subject: brief.subject || `Sentinel Morning Note · ${brief.date}`,
        html: brief.html || `<pre>${brief.markdown}</pre>`,
        text: brief.markdown,
      });
    } else {
      channels.email = { skipped: 'RESEND_API_KEY / EMAIL_TO not configured' };
    }
  }

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
