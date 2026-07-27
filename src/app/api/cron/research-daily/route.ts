import { NextResponse } from 'next/server';
import { getServiceResearchCtx } from '@/lib/research/service';
import { extractSignals } from '@/lib/research/signals';
import { monitorAllTheses } from '@/lib/research/monitor';
import { trustedPlatformLlm } from '@/lib/research/memos';
import { authorizedCronRequest } from '@/lib/observability/cron-auth';

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
 * Auth: CRON_SECRET Bearer header (same gate as /api/cron/daily-radar).
 * Missing configuration fails closed; manual runs use the same bearer.
 */
export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Cron unavailable' }, { status: 503 });
  }
  if (!authorizedCronRequest(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const ctx = getServiceResearchCtx();

    const extraction = await extractSignals(ctx, trustedPlatformLlm);
    const monitor = await monitorAllTheses(ctx, trustedPlatformLlm);
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
