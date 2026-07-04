import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { reviewMemo, MemoError } from '@/lib/research/memos';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Review gate: 422 while any BLOCK axiom fails; otherwise memo → REVIEWED. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    assertEnabled();
    const db = getDb();
    const result = reviewMemo(db, params.id);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: { code: 'AXIOM_BLOCKED', message: 'blocking axiom failures must be resolved before review' },
          results: result.results,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ memo: result.memo, results: result.results });
  } catch (e) {
    if (e instanceof MemoError) {
      return NextResponse.json(
        { error: { code: 'MEMO_ERROR', message: e.message } },
        { status: e.status },
      );
    }
    return researchError(e);
  }
}
