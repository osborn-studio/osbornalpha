import { NextResponse } from 'next/server';
import { buildRadar } from '@/lib/brief/radar';
import { getRequestLocale } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export const revalidate = 1800;  // 30 min

interface Ctx { params: Promise<{ ticker: string }> }

/**
 * GET /api/radar/[ticker]
 *
 * Per-stock morning note in Anthropic equity-research format. Combines:
 *   quote (4-source cascade) + Tushare daily_basic + fina_indicator
 *   + flows (hk_hold + limit_list_d + anns_d) + signal math
 *
 * No LLM call — instant + zero token cost. The composition rules are
 * encoded in `src/lib/brief/radar.ts` and mirror the prose format
 * defined in `skills/stock-daily-radar/SKILL.md`.
 *
 * Response: { ticker, name, radar_level, headline, sections, triggers, markdown, ... }
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);

  try {
    const locale = await getRequestLocale();
    const payload = await buildRadar(ticker, locale);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'radar build failed', ticker },
      { status: 502 }
    );
  }
}
