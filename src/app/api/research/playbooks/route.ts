import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { createPlaybookRun, listPlaybookRuns } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';
import { APPROVAL_STATUSES, type ApprovalStatus } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const status = new URL(req.url).searchParams.get('status');
    const runs = APPROVAL_STATUSES.includes(status as ApprovalStatus)
      ? listPlaybookRuns(db, { status: status as ApprovalStatus })
      : listPlaybookRuns(db);
    return { runs };
  });
}

/** Create a run: axiom BLOCK → 422 AXIOM_BLOCKED and NOTHING is persisted. */
export async function POST(req: Request) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const { run, axiom_results } = createPlaybookRun(db, body);
    return NextResponse.json({ run, axiom_results }, { status: 201 });
  });
}
