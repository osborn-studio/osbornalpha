import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { supersedeThesis } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/**
 * §7.4.3 — create a NEW thesis that supersedes an INVALIDATED/CLOSED one.
 * Body = CreateThesisInput (+ optional `reason`). Nothing is inherited.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const { reason, ...input } = body ?? {};
    const result = await supersedeThesis(ctx, id, input, typeof reason === 'string' ? reason : '');
    return NextResponse.json(result, { status: 201 });
  });
}
