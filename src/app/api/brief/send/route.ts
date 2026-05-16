import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/brief/send  — manual trigger to generate + push to Telegram.
 * Body (optional): { watchlist, topN, skipLLM, chatId, text }
 *
 * If `text` is provided, skip generation and just send the provided text
 * (used by the settings page test button).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const chatId: string | undefined = body.chatId;
  const text: string | undefined = body.text;

  if (text) {
    if (!isTelegramConfigured() && !chatId) {
      return NextResponse.json({ error: 'Telegram not configured' }, { status: 503 });
    }
    const r = await sendTelegram(text, { chatId, parseMode: 'Markdown' });
    return NextResponse.json(r);
  }

  // Generate then send
  const watchlist = Array.isArray(body.watchlist) && body.watchlist.length > 0
    ? body.watchlist
    : DEFAULT_WATCHLIST;
  const brief = await generateDailyBrief(watchlist, {
    topN: body.topN ?? 5,
    skipLLM: !!body.skipLLM,
  });

  if (!isTelegramConfigured() && !chatId) {
    return NextResponse.json({
      sent: false,
      reason: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured',
      brief_preview: brief.markdown.slice(0, 500),
    });
  }

  const send = await sendTelegram(brief.markdown, {
    chatId,
    parseMode: 'Markdown',
    disableWebPagePreview: true,
  });

  return NextResponse.json({
    sent: send.ok,
    chunks_sent: send.chunks_sent,
    error: send.error,
    brief_meta: {
      date: brief.date,
      overall_confidence: brief.overall_confidence,
      overall_label: brief.overall_label,
      top_count: brief.top.length,
      duration_ms: brief.meta.duration_ms,
    },
  });
}
