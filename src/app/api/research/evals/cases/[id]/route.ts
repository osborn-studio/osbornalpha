import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getEvalCase, listEvalRuns } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';
import { readJson, type SourceDocument } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

/** Case detail: case + run history + the visible material source rows. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const evalCase = getEvalCase(db, params.id);
    if (!evalCase) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'eval case not found' } },
        { status: 404 },
      );
    }
    const stmt = db.prepare(`select * from source_documents where id = ?`);
    const sources: SourceDocument[] = [];
    for (const id of evalCase.visible_material) {
      const row = stmt.get(id);
      if (row) sources.push({ ...row, entity_ids: readJson<string[]>(row.entity_ids, []) });
    }
    return { case: evalCase, runs: listEvalRuns(db, evalCase.id), sources };
  });
}
