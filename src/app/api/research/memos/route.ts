import { requireResearchUser } from '@/lib/research/store';
import { listMemos } from '@/lib/research/memos';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    return { memos: await listMemos(ctx) };
  });
}
