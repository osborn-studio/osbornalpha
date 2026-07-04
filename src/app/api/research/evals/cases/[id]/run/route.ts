import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { runEval } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// Two sequential real LLM roundtrips (gen + judge) — allow the full window.
export const maxDuration = 300;

/** ▶️ 运行评测: gen + judge double call. LLM failure → 502 structured, no half-run. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const result = await runEval(ctx, params.id);
    if (!result.run) {
      // Structured LLM failure (no key / provider error) — not a crash.
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: 201 });
  });
}
