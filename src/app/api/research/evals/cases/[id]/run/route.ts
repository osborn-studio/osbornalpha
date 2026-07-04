import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { runEval } from '@/lib/research/evals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// Two sequential real LLM roundtrips (gen + judge) — allow the full window.
export const maxDuration = 300;

/** ▶️ 运行评测: gen + judge double call. LLM failure → 502 structured, no half-run. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    assertEnabled();
    const db = getDb();
    const result = await runEval(db, params.id);
    if (!result.run) {
      // Structured LLM failure (no key / provider error) — not a crash.
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: 201 });
  });
}
