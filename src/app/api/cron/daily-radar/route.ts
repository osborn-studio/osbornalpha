import { NextResponse } from 'next/server';
import { buildRadarDigest } from '@/lib/brief/radar-digest';
import { DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';
import { sendEmail, isResendConfigured } from '@/lib/data/sources/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron — daily per-stock radar digest.
 *
 * Schedule (vercel.json):  00:00 UTC = 08:00 CST 北京时间
 * Sibling of /api/cron/daily-brief which runs 30 min later (market-wide
 * morning note). This one is the per-stock radar pushed before the brief
 * so the user sees stock-by-stock action items first thing in the morning.
 *
 * Channels: Telegram + Email (both gated by env vars; either can be off).
 *
 * Manual preview:
 *   GET /api/cron/daily-radar?preview=1
 *   Returns the digest JSON without sending anything.
 *
 * Manual send (e.g. test after env var change):
 *   GET /api/cron/daily-radar?force=1  (with CRON_SECRET if set)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const isPreview = url.searchParams.get('preview') === '1';
  const isForce = url.searchParams.get('force') === '1';

  // Auth gate — only when actually sending. Preview skips auth so the
  // /radar tab or a quick curl with the site cookie can call it.
  if (!isPreview) {
    const auth = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;
    if (secret && auth !== `Bearer ${secret}` && !isForce) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  try {
    const digest = await buildRadarDigest(DEFAULT_WATCHLIST);

    if (isPreview) {
      // Don't send — just return the rendered payload for inspection.
      return NextResponse.json({
        preview: true,
        date: digest.date,
        subject: digest.subject,
        totals: digest.totals,
        order: digest.order,
        errors: digest.errors,
        takes: digest.takes,
        total_llm_cost_usd: digest.total_llm_cost_usd,
        markdown: digest.markdown,
        html: digest.html,
        duration_ms: Date.now() - startedAt,
      });
    }

    const channels: Record<string, any> = {};

    if (isTelegramConfigured()) {
      // Telegram caps at 4096 chars per message. Our digest may exceed
      // it when many stocks fire signals — let sendTelegram handle the
      // chunking via autoSplit.
      channels.telegram = await sendTelegram(digest.markdown, {
        parseMode: 'Markdown',
        disableWebPagePreview: true,
        autoSplit: true,
      });
    } else {
      channels.telegram = { skipped: 'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set' };
    }

    if (isResendConfigured()) {
      channels.email = await sendEmail({
        subject: digest.subject,
        html: digest.html,
        text: digest.markdown,
      });
    } else {
      channels.email = { skipped: 'RESEND_API_KEY/EMAIL_TO not set' };
    }

    return NextResponse.json({
      ok: true,
      date: digest.date,
      subject: digest.subject,
      totals: digest.totals,
      order: digest.order,
      errors: digest.errors,
      duration_ms: Date.now() - startedAt,
      channels,
    });
  } catch (e: any) {
    // Cross-channel alert so we know the cron blew up
    if (isTelegramConfigured()) {
      await sendTelegram(`⚠️ Radar cron failed: ${(e?.message || '').slice(0, 200)}`, {
        parseMode: 'none',
      });
    }
    if (isResendConfigured()) {
      await sendEmail({
        subject: 'Radar cron failed',
        html: `<p>Radar cron failed: <code>${escapeHtml(e?.message || '').slice(0, 500)}</code></p>`,
      });
    }
    return NextResponse.json(
      { error: e?.message || 'cron failed', stack: e?.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
