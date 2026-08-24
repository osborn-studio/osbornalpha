import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';
import { sendEmail, isResendConfigured } from '@/lib/data/sources/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron — daily 08:30 CST (00:30 UTC).
 * Fans out to all configured channels (Telegram + Email).
 */
export async function GET(req: Request) {
  // Validate cron secret
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'cron unavailable' }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const brief = await generateDailyBrief(DEFAULT_WATCHLIST, {
      topN: 5,
      mode: 'trusted_unmetered',
    });

    const channels: Record<string, any> = {};

    if (isTelegramConfigured()) {
      channels.telegram = await sendTelegram(brief.markdown, {
        parseMode: 'Markdown',
        disableWebPagePreview: true,
      });
    } else {
      channels.telegram = { skipped: 'not configured' };
    }

    if (isResendConfigured()) {
      channels.email = await sendEmail({
        subject: brief.subject || `Sentinel Morning Note · ${brief.date}`,
        html: brief.html || `<pre>${brief.markdown}</pre>`,
        text: brief.markdown,
      });
    } else {
      channels.email = { skipped: 'not configured' };
    }

    return NextResponse.json({
      ok: true,
      date: brief.date,
      subject: brief.subject,
      overall_confidence: brief.overall_confidence,
      overall_label: brief.overall_label,
      top: brief.top.map((b) => ({ ticker: b.ticker, name: b.name, consensus: b.consensus })),
      duration_ms: Date.now() - startedAt,
      channels,
    });
  } catch (e: any) {
    console.error('daily brief cron failed', { code: 'cron_failed' });
    // Try to alert via any channel
    if (isTelegramConfigured()) {
      await sendTelegram('⚠️ Sentinel cron failed', { parseMode: 'none' });
    }
    if (isResendConfigured()) {
      await sendEmail({
        subject: 'Sentinel cron failed',
        html: '<p>Sentinel daily brief cron failed.</p>',
      });
    }
    return NextResponse.json(
      { error: 'cron failed' },
      { status: 500 }
    );
  }
}
