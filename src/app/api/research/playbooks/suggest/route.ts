import { requireResearchUser } from '@/lib/research/store';
import { suggestPlaybookAction } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/**
 * LLM action suggestion for a memo/thesis — returned for human editing,
 * never persisted here (creation is the separate axiom-gated POST).
 */
export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    return suggestPlaybookAction(ctx, {
      memo_id: body.memo_id,
      thesis_id: body.thesis_id,
    });
  });
}
