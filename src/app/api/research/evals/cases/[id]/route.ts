import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getEvalCase, listEvalRuns } from '@/lib/research/evals';
import { listSourcesByIds } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Case detail: case + run history + the visible material source rows. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const evalCase = isUuid(params.id) ? await getEvalCase(ctx, params.id) : null;
    if (!evalCase) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'eval case not found' } },
        { status: 404 },
      );
    }
    const [runs, sources] = await Promise.all([
      listEvalRuns(ctx, evalCase.id),
      listSourcesByIds(ctx, evalCase.visible_material),
    ]);
    return { case: evalCase, runs, sources };
  });
}
