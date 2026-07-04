import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { transitionThesis } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';
import type { ThesisStatus } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

/** Guarded status transition — illegal edges → 422 via ThesisError. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const thesis = transitionThesis(
      db,
      params.id,
      body.to as ThesisStatus,
      typeof body.reason === 'string' ? body.reason : '',
    );
    return NextResponse.json({ thesis });
  });
}
