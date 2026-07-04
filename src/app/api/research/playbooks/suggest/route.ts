import { assertEnabled, getDb } from '@/lib/research/db';
import { suggestPlaybookAction } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/**
 * LLM action suggestion for a memo/thesis — returned for human editing,
 * never persisted here (creation is the separate axiom-gated POST).
 */
export async function POST(req: Request) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    return suggestPlaybookAction(db, {
      memo_id: body.memo_id,
      thesis_id: body.thesis_id,
    });
  });
}
