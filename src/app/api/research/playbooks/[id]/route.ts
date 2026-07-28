import { NextResponse } from 'next/server';
import { requireResearchUser, isUuid } from '@/lib/research/store';
import { getPlaybookRun } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const run = isUuid(id) ? await getPlaybookRun(ctx, id) : null;
    if (!run) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'playbook run not found' } },
        { status: 404 },
      );
    }
    return { run };
  });
}
