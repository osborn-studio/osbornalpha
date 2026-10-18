export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createRecommendation, listRecommendations } from '@/lib/analyst/store';
import { parseRecommendationInput } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

// GET ?analyst=<uuid>&ticker=<code>&open=1 → { recommendations: RecommendationView[] }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const analyst = url.searchParams.get('analyst');
  if (analyst !== null && !isUuid(analyst)) return NextResponse.json({ error: 'analyst must be a uuid' }, { status: 400 });
  try {
    const recommendations = await listRecommendations({
      analystId: analyst ?? undefined,
      ticker: url.searchParams.get('ticker') ?? undefined,
      openOnly: url.searchParams.get('open') === '1',
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
