import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { createPlaybookRun, listPlaybookRuns } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';
import { APPROVAL_STATUSES, type ApprovalStatus } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const status = new URL(req.url).searchParams.get('status');
    const runs = APPROVAL_STATUSES.includes(status as ApprovalStatus)
      ? await listPlaybookRuns(ctx, { status: status as ApprovalStatus })
      : await listPlaybookRuns(ctx);
    return { runs };
  });
}

/** Create a run: axiom BLOCK → 422 AXIOM_BLOCKED and NOTHING is persisted. */
export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const { run, axiom_results } = await createPlaybookRun(ctx, body);
    return NextResponse.json({ run, axiom_results }, { status: 201 });
  });
}
