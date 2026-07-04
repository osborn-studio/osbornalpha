import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { createEvalCase, evalAggregate, listEvalCaseSummaries } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Eval Lab list: case summaries + the aggregate report (六维平均 + failure top10). */
export async function GET() {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    return { cases: listEvalCaseSummaries(db), aggregate: evalAggregate(db) };
  });
}

export async function POST(req: Request) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const evalCase = createEvalCase(db, body);
    return NextResponse.json({ case: evalCase }, { status: 201 });
  });
}
