import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { getMemo, patchMemo, memoToMarkdown, MemoError } from '@/lib/research/memos';
import { dealMemoToMarkdown } from '@/lib/research/deal-memos';
import { listSources } from '@/lib/research/sources';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** GET memo JSON; ?format=markdown returns the ten-section export with disclaimer. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireResearchUser();
    const memo = await getMemo(ctx, id);
    if (!memo) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'memo not found' } },
        { status: 404 },
      );
    }
    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'markdown') {
      const md = memo.memo_type === 'deal'
        ? dealMemoToMarkdown(memo)
        : memoToMarkdown(memo, await listSources(ctx));
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
    const sources = (await listSources(ctx)).filter((s) => citedIds.has(s.id));
    return NextResponse.json({ memo, sources });
  } catch (e) {
    return researchError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const memo = await patchMemo(ctx, id, body);
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
