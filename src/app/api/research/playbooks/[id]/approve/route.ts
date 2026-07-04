import { requireResearchUser } from '@/lib/research/store';
import { approvePlaybook } from '@/lib/research/playbooks';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/**
 * Approve a PENDING run (decision required, 422 otherwise). Executes ONLY the
 * restricted plan effects (CLOSE_THESIS via the thesis transition guard); an
 * execution failure leaves the run APPROVED with execution_error in audit_log.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    return approvePlaybook(ctx, params.id, {
      decision: body.decision,
      review_at: typeof body.review_at === 'string' ? body.review_at : undefined,
    });
  });
}
