import { assertEnabled, getDb } from '@/lib/research/db';
import { rejectPlaybook } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Reject a PENDING run (decision required; only PENDING can be rejected → 422). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    return rejectPlaybook(db, params.id, { decision: body.decision });
  });
}
