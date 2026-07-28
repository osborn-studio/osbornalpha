import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { transitionThesis } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';
import type { ThesisStatus } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

/** Guarded status transition — illegal edges → 422 via ThesisError. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const thesis = await transitionThesis(
      ctx,
      id,
      body.to as ThesisStatus,
      typeof body.reason === 'string' ? body.reason : '',
    );
    return NextResponse.json({ thesis });
  });
}
