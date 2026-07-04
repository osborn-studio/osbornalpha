import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getThesis } from '@/lib/research/theses';
import { monitorThesis } from '@/lib/research/monitor';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// Real LLM roundtrip (DeepSeek) over the monitor window can take a while.
export const maxDuration = 120;

/** Run the monitor for one thesis. Alerts are PENDING — status never changes here. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireResearchUser();
    const thesis = isUuid(params.id) ? await getThesis(ctx, params.id) : null;
    if (!thesis) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'thesis not found' } },
        { status: 404 },
      );
    }
    const result = await monitorThesis(ctx, thesis);
    if (result.llm.source === 'no-key' || result.llm.source === 'error') {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result, { status: result.event ? 201 : 200 });
  } catch (e) {
    return researchError(e);
  }
}
