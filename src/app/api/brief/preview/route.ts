import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { resolveLlm } from '@/lib/llm/resolve';
import { checkQuota, recordUsage } from '@/lib/billing/quota';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/brief/preview
 *   - ?watchlist=A,B,C  custom watchlist (default = DEFAULT_WATCHLIST)
 *   - ?topN=5
 *   - ?skipLLM=true     skip 9-persona generation (faster, no cost)
 *   - ?format=json|markdown
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const watchlistParam = url.searchParams.get('watchlist');
  const topN = parseInt(url.searchParams.get('topN') || '5', 10);
  const skipLLM = url.searchParams.get('skipLLM') === 'true';
  const format = url.searchParams.get('format') || 'json';

  const watchlist = watchlistParam
    ? watchlistParam.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_WATCHLIST;

  // BYO-key calls run unmetered; the shared platform key is subject to the
  // daily quota. Same fail-open rationale as the other two routes: this
  // route has no separate auth gate, so an auth failure from checkQuota()
  // degrades to "unmetered" rather than 500ing (e.g. BriefGlance's anonymous
  // ?skipLLM=true preview call on /today should never break).
  const llm = await resolveLlm();
  const byo = llm?.source === 'user';
  let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;
  if (!byo) {
    try {
      quota = await checkQuota('brief_preview');
    } catch {
      quota = null;
    }
  }
  if (quota && !quota.allowed) {
    return NextResponse.json({
      error: '今日平台额度已用完',
      quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
    }, { status: 429 });
  }

  try {
    const brief = await generateDailyBrief(watchlist, { topN, skipLLM });
    await recordUsage('brief_preview', { byo });
    if (format === 'markdown' || format === 'md') {
      return new NextResponse(brief.markdown, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }
    return NextResponse.json(brief);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'brief generation failed', stack: e?.stack?.slice(0, 500) },
      { status: 500 }
    );
  }
}
