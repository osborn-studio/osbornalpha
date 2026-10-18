export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createRecommendation, listRecommendations } from '@/lib/analyst/store';
import { parseRecommendationInput, RECOMMENDATION_SOURCES } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';
import type { RecommendationSource } from '@/lib/supabase/database.types';

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
    return NextResponse.json({ recommendations });
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
