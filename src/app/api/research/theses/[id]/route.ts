import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { getThesis, listThesisEvents } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Thesis detail + event timeline (STATUS_CHANGE + monitor alerts). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    const thesis = getThesis(db, params.id);
    if (!thesis) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'thesis not found' } },
        { status: 404 },
      );
    }
    return { thesis, events: listThesisEvents(db, thesis.id) };
  });
}
