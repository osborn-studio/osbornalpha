import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { generateMemo, MemoError } from '@/lib/research/memos';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// Real LLM roundtrip (DeepSeek) can take a while on long source corpora.
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    if (typeof body.entity_id !== 'string' || !body.entity_id) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'entity_id is required' } },
        { status: 400 },
      );
    }
    const db = getDb();
    const result = await generateMemo(db, {
      entity_id: body.entity_id,
      question: typeof body.question === 'string' ? body.question : undefined,
    });
    if (!result.memo) {
      // Structured LLM failure (no key / provider error) — not a crash.
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: 201 });
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
