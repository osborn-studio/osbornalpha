import { NextResponse } from 'next/server';
import { getServiceResearchCtx } from '@/lib/research/service';
import { extractSignals } from '@/lib/research/signals';
import { monitorAllTheses } from '@/lib/research/monitor';

export const dynamic = 'force-dynamic';
// extractSignals (one LLM batch) + one monitor roundtrip per active thesis.
export const maxDuration = 300;

/**
 * Vercel Cron — Research OS daily signal extraction + thesis monitor.
 *
 * Schedule (vercel.json): 01:30 UTC = 09:30 CST 北京时间. Runs AFTER the local
 * research-daily.ts has ingested that morning's radar day (radar files are
 * local-only, so this cron does NOT ingest — extract + monitor only).
 *
 * Owner scoping: getServiceResearchCtx() uses the admin client + the
 * RESEARCH_OWNER_USER_ID env (Vercel), so every row is written under that user.
 *
 * Auth: CRON_SECRET Bearer header (same gate as /api/cron/daily-radar); when
 * CRON_SECRET is unset the endpoint is open (dev), matching the sibling crons.
 * ?force=1 bypasses the header for manual verification.
 */
export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const isForce = url.searchParams.get('force') === '1';
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}` && !isForce) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const ctx = getServiceResearchCtx();

    const extraction = await extractSignals(ctx);
    const monitor = await monitorAllTheses(ctx);
    const alerts = monitor.filter((r) => r.event !== null).length;

    return NextResponse.json({
      ok: true,
      signals: {
        source: extraction.llm.source,
        created: extraction.created.length,
        dropped: extraction.dropped.length,
        skipped_sources: extraction.skippedSources,
      },
      monitor: { theses: monitor.length, new_alerts: alerts },
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'research-daily cron failed' },
      { status: 500 },
    );
  }
}
