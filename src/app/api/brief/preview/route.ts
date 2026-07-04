import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';
import { resolveLlm } from '@/lib/llm/resolve';
import { checkQuota, recordUsage } from '@/lib/billing/quota';
import { getRequestLocale, apiMessage } from '@/lib/i18n/server';

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

  // Quota rules:
  //  - skipLLM=true costs nothing (composition only) → never metered, never
  //    blocked (BriefGlance on /today uses this).
  //  - BYO-key calls run unmetered (user pays their own bill).
  //  - Anonymous callers get NO platform-key budget: this route is public in
  //    middleware, so 'not authenticated' from checkQuota fails CLOSED (401)
  //    — fail-open here would let bare curl burn the platform key unmetered.
  //    Other checkQuota failures (e.g. transient DB) fail open.
  const llm = await resolveLlm();
  const byo = llm?.source === 'user';
  const metered = !skipLLM && !byo;
  let quota: Awaited<ReturnType<typeof checkQuota>> | null = null;
  if (metered) {
    try {
      quota = await checkQuota('brief_preview');
    } catch (e) {
      if ((e as Error).message === 'not authenticated') {
        return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
      }
      quota = null;
    }
  }
  if (quota && !quota.allowed) {
    const locale = await getRequestLocale();
    return NextResponse.json({
      error: apiMessage(locale, 'quotaExhausted'),
      quota: { used: quota.used, limit: quota.limit, plan: quota.plan },
    }, { status: 429 });
  }

  try {
    const brief = await generateDailyBrief(watchlist, { topN, skipLLM });
    if (metered) await recordUsage('brief_preview', { byo });
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
