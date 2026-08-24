import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { generateDealMemo, DealMemoError } from '@/lib/research/deal-memos';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// Real LLM roundtrip (DeepSeek) can take a while on long source corpora.
export const maxDuration = 120;

/**
 * POST /api/research/memos/generate-deal (admin only).
 * Body: { target, deal_context?, entity_id? }. Generation stores a DRAFT even
 * when the deal gate is incomplete (deal memo is an AI 初稿) — the gate result
 * is returned for the UI to surface; we do NOT 422 on an incomplete draft.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    if (typeof body.target !== 'string' || !body.target.trim()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'target is required' } },
        { status: 400 },
      );
    }
    const result = await generateDealMemo(ctx, {
      target: body.target,
      deal_context: typeof body.deal_context === 'string' ? body.deal_context : undefined,
      entity_id: typeof body.entity_id === 'string' && body.entity_id ? body.entity_id : undefined,
    });
    if (result.error) {
      // Structured LLM failure (no key / provider error) — not a crash.
      return NextResponse.json(result, { status: 502 });
    }
    // 201 even when gate.ok === false: an incomplete draft is still persisted.
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DealMemoError) {
      return NextResponse.json(
        { error: { code: 'MEMO_ERROR', message: e.message } },
        { status: e.status },
      );
    }
    return researchError(e);
  }
}
