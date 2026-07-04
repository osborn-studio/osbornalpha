import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getEntity } from '@/lib/research/entities';
import { listSourcesForEntity } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';
import { readJson, type InvestmentMemo } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

/** Entity profile + related sources + related memos + open questions rollup. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const entity = getEntity(db, params.id);
    if (!entity) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'entity not found' } },
        { status: 404 },
      );
    }
    const sources = listSourcesForEntity(db, entity.id);
    const memoRows = db.prepare(
      `select * from memos
       where exists (select 1 from json_each(memos.company_ids) where value = ?)
          or exists (select 1 from json_each(memos.theme_ids) where value = ?)
       order by created_at desc`,
    ).all(entity.id, entity.id);
    const memos = memoRows.map((row: any) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      confidence: row.confidence,
      created_at: row.created_at,
      open_questions: readJson<string[]>(row.open_questions, []),
    })) as Array<Pick<InvestmentMemo, 'id' | 'title' | 'status' | 'confidence' | 'created_at' | 'open_questions'>>;
    const openQuestions = memos.flatMap((m) => m.open_questions);
    return { entity, sources, memos, open_questions: openQuestions };
  });
}
