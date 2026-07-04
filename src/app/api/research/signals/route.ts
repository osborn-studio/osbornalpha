import { requireResearchUser } from '@/lib/research/store';
import { listSignals, listPendingSources } from '@/lib/research/signals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const [signals, pending] = await Promise.all([
      listSignals(ctx),
      listPendingSources(ctx, 1000),
    ]);
    return {
      signals,
      pending_source_count: pending.length,
    };
  });
}
