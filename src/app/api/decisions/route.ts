export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listDecisions, createDecision, listWithdrawnRecommendationIds } from '@/lib/portfolio/store';
import { parseDecisionInput } from '@/lib/portfolio/validate';
import type { DecisionStatus } from '@/lib/supabase/database.types';

const STATUSES: DecisionStatus[] = ['open', 'executed', 'expired', 'cancelled'];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  if (statusParam !== null && !STATUSES.includes(statusParam as DecisionStatus)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join('|')}` }, { status: 400 });
  }
  try {
    const [decisions, withdrawn_recommendation_ids] = await Promise.all([
      listDecisions({
        ticker: url.searchParams.get('ticker') ?? undefined,
        status: (statusParam as DecisionStatus | null) ?? undefined,
      }),
      listWithdrawnRecommendationIds(),
    ]);
    return NextResponse.json({ decisions, withdrawn_recommendation_ids });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  const parsed = parseDecisionInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const decision = await createDecision(parsed.value);
    return NextResponse.json({ decision }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'not authenticated' ? 401 : msg === 'recommendation not found' ? 404 : msg === 'recommendation withdrawn' || msg === 'recommendation ticker mismatch' || msg === 'recommendation market mismatch' ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
