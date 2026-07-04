import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getEntity } from '@/lib/research/entities';
import { listSourcesForEntity } from '@/lib/research/sources';
import { listMemosForEntity } from '@/lib/research/memos';
import { withResearch } from '@/lib/research/api';
import type { InvestmentMemo } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

/** Entity profile + related sources + related memos + open questions rollup. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const entity = isUuid(params.id) ? await getEntity(ctx, params.id) : null;
    if (!entity) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'entity not found' } },
        { status: 404 },
      );
    }
    const sources = await listSourcesForEntity(ctx, entity.id);
    const memoRows = await listMemosForEntity(ctx, entity.id);
    const memos = memoRows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      confidence: m.confidence,
      created_at: m.created_at,
      open_questions: m.open_questions,
    })) as Array<Pick<InvestmentMemo, 'id' | 'title' | 'status' | 'confidence' | 'created_at' | 'open_questions'>>;
    const openQuestions = memos.flatMap((m) => m.open_questions);
    return { entity, sources, memos, open_questions: openQuestions };
  });
}
