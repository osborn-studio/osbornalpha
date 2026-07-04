import { requireResearchUser } from '@/lib/research/store';
import { rejectPlaybook } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Reject a PENDING run (decision required; only PENDING can be rejected → 422). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    return rejectPlaybook(ctx, params.id, { decision: body.decision });
  });
}
