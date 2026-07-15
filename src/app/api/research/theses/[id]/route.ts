import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getThesis, listThesisEvents } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Thesis detail + event timeline (STATUS_CHANGE + monitor alerts). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const thesis = isUuid(id) ? await getThesis(ctx, id) : null;
    if (!thesis) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'thesis not found' } },
        { status: 404 },
      );
    }
    return { thesis, events: await listThesisEvents(ctx, thesis.id) };
  });
}
