import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getPlaybookRun } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const run = getPlaybookRun(db, params.id);
    if (!run) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'playbook run not found' } },
        { status: 404 },
      );
    }
    return { run };
  });
}
