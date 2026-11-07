export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createRecommendation, listRecommendations } from '@/lib/analyst/store';
import { parseRecommendationInput, RECOMMENDATION_SOURCES } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';
import type { RecommendationSource } from '@/lib/supabase/database.types';

// F4: spec §11.2 — every row carries a PrivateJudgmentCard (judgment_card); issuer subjects via issuer_securities ⋈ stocks_universe
import type { RecommendationView } from '@/lib/analyst/store';
import { getServerSupabase } from '@/lib/supabase/server';
import { NO_ISSUERS, loadIssuerIndex, toJudgmentCard, type IssuerLookupClient, type RecommendationCardContext } from '@/lib/judgments/adapters/recommendation';

import { serializeBody } from '@/lib/judgments/route-utils';

/** Issuer lookup failures degrade to security subjects; they never fail the request. */
async function issuerIndexFor(recs: RecommendationView[]): Promise<RecommendationCardContext> {
  if (recs.length === 0) return NO_ISSUERS;
  try {
    return await loadIssuerIndex((await getServerSupabase()) as unknown as IssuerLookupClient, recs);
  } catch (e) {
    console.error('[analyst/recommendations] issuer lookup', e instanceof Error ? e.message : String(e));
    return NO_ISSUERS;
  }
}
// /F4

// GET ?analyst=<uuid>&ticker=<code>&open=1&source=<RecommendationSource> → { recommendations: RecommendationView[] }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const analyst = url.searchParams.get('analyst');
  if (analyst !== null && !isUuid(analyst)) return NextResponse.json({ error: 'analyst must be a uuid' }, { status: 400 });
  const source = url.searchParams.get('source');
  if (source !== null && !RECOMMENDATION_SOURCES.includes(source as RecommendationSource)) return NextResponse.json({ error: `source must be one of ${RECOMMENDATION_SOURCES.join('|')}` }, { status: 400 });
  try {
    const recommendations = await listRecommendations({
      analystId: analyst ?? undefined,
      ticker: url.searchParams.get('ticker') ?? undefined,
      openOnly: url.searchParams.get('open') === '1',
      sourceType: (source as RecommendationSource | null) ?? undefined,
    });
    // F4: additive card; null percent is omitted from the JSON boundary
    const issuers = await issuerIndexFor(recommendations);
    return NextResponse.json({ recommendations: recommendations.map((r) => ({ ...r, judgment_card: serializeBody(toJudgmentCard(r, r.score, issuers)) })) });
    // /F4
  } catch (e) {
    return analystError(e);
  }
}

// POST RecommendationInput → 201 { recommendation }; 404 analyst not found; 409 analyst archived
export async function POST(req: Request) {
  const parsed = parseRecommendationInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const recommendation = await createRecommendation(parsed.value);
    return NextResponse.json({ recommendation }, { status: 201 });
  } catch (e) {
    return analystError(e);
  }
}
