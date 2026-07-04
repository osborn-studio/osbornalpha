import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getSource } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const source = getSource(db, params.id);
    if (!source) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'source not found' } },
        { status: 404 },
      );
    }
    return { source };
  });
}
