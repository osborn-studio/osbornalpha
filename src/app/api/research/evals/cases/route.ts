import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { createEvalCase, evalAggregate, listEvalCaseSummaries } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Eval Lab list: case summaries + the aggregate report (六维平均 + failure top10). */
export async function GET() {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const [cases, aggregate] = await Promise.all([
      listEvalCaseSummaries(ctx),
      evalAggregate(ctx),
    ]);
    return { cases, aggregate };
  });
}

export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const evalCase = await createEvalCase(ctx, body);
    return NextResponse.json({ case: evalCase }, { status: 201 });
  });
}
