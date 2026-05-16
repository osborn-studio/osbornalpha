import { NextResponse } from 'next/server';
import { generateDailyBrief, DEFAULT_WATCHLIST } from '@/lib/brief/composer';

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

  try {
    const brief = await generateDailyBrief(watchlist, { topN, skipLLM });
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
