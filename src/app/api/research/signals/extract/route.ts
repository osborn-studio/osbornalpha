import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { extractSignals } from '@/lib/research/signals';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// Real LLM roundtrip (DeepSeek) over a 20-source batch can take a while.
export const maxDuration = 120;

export async function POST() {
  try {
    const ctx = await requireResearchUser();
    const result = await extractSignals(ctx);
    if (result.llm.source === 'no-key' || result.llm.source === 'error') {
      // Structured LLM failure — not a crash (Phase 1 convention).
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: result.created.length > 0 ? 201 : 200 });
  } catch (e) {
    return researchError(e);
  }
}
