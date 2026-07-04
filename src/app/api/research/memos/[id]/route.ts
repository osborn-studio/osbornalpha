import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getMemo, patchMemo, memoToMarkdown, MemoError } from '@/lib/research/memos';
import { researchError } from '@/lib/research/api';
import { readJson, type SourceDocument } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

function loadAllSources(db: ReturnType<typeof getDb>): SourceDocument[] {
  return db.prepare(`select * from source_documents`).all()
    .map((r: any) => ({ ...r, entity_ids: readJson<string[]>(r.entity_ids, []) }));
}

/** GET memo JSON; ?format=markdown returns the ten-section export with disclaimer. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    assertEnabled();
    const db = getDb();
    const memo = getMemo(db, params.id);
    if (!memo) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'memo not found' } },
        { status: 404 },
      );
    }
    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'markdown') {
      const md = memoToMarkdown(memo, loadAllSources(db));
      return new NextResponse(md, {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': `attachment; filename="memo-${memo.id}.md"`,
        },
      });
    }
    // Citation sidebar needs the cited source excerpts alongside the memo.
    const citedIds = new Set<string>();
    for (const ev of [...memo.supporting_evidence, ...memo.counter_arguments]) {
      for (const id of ev.source_document_ids) citedIds.add(id);
    }
    const sources = loadAllSources(db).filter((s) => citedIds.has(s.id));
    return NextResponse.json({ memo, sources });
  } catch (e) {
    return researchError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const memo = patchMemo(db, params.id, body);
    return NextResponse.json({ memo });
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
