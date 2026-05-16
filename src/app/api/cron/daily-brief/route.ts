import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { sendTelegram, isTelegramConfigured } from '@/lib/data/sources/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron — daily 08:30 CST (00:30 UTC).
 *
 * Vercel automatically sets the header `Authorization: Bearer ${CRON_SECRET}`
 * when calling cron endpoints. Validate to prevent abuse.
 */
export async function GET(req: Request) {
  // Validate cron secret (Vercel sends this header automatically)
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const brief = await generateDailyBrief(DEFAULT_WATCHLIST, { topN: 5 });

    let tgResult = null;
    if (isTelegramConfigured()) {
      tgResult = await sendTelegram(brief.markdown, {
        parseMode: 'Markdown',
        disableWebPagePreview: true,
      });
    }

    return NextResponse.json({
      ok: true,
      date: brief.date,
      overall_confidence: brief.overall_confidence,
      overall_label: brief.overall_label,
      top: brief.top.map((b) => ({ ticker: b.ticker, name: b.name, consensus: b.consensus })),
      duration_ms: Date.now() - startedAt,
      telegram: tgResult,
    });
  } catch (e: any) {
    // Try to send error notification too
    if (isTelegramConfigured()) {
      await sendTelegram(`⚠️ Sentinel cron failed: ${e?.message?.slice(0, 200)}`, { parseMode: 'none' });
    }
    return NextResponse.json(
      { error: e?.message || 'cron failed', stack: e?.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
