import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getEvalRun } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const run = isUuid(params.id) ? await getEvalRun(ctx, params.id) : null;
    if (!run) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'eval run not found' } },
        { status: 404 },
      );
    }
    return { run };
  });
}
