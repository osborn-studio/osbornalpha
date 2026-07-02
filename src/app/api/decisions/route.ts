export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listDecisions, createDecision } from '@/lib/portfolio/store';
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
    const decisions = await listDecisions({
      ticker: url.searchParams.get('ticker') ?? undefined,
      status: (statusParam as DecisionStatus | null) ?? undefined,
    });
    return NextResponse.json({ decisions });
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
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
