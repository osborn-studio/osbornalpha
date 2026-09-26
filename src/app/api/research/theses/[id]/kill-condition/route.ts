import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { killConditionRevisionsInQuarter, reviseKillCondition } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** §7.4.4 — revise the wording of one kill condition; the original is kept in kill_condition_revisions. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const thesis = await reviseKillCondition(ctx, id, {
      index: Number(body?.index),
      new_text: typeof body?.new_text === 'string' ? body.new_text : '',
      reason: typeof body?.reason === 'string' ? body.reason : '',
    });
    return NextResponse.json({ thesis, review: killConditionRevisionsInQuarter(thesis) });
  });
}
