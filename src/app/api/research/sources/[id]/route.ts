import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getSource } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const source = isUuid(id) ? await getSource(ctx, id) : null;
    if (!source) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'source not found' } },
        { status: 404 },
      );
    }
    return { source };
  });
}
