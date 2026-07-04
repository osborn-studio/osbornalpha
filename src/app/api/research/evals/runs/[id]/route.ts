import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getEvalRun } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const run = getEvalRun(db, params.id);
    if (!run) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'eval run not found' } },
        { status: 404 },
      );
    }
    return { run };
  });
}
