import { requireResearchUser } from '@/lib/research/store';
import { listPendingAlerts } from '@/lib/research/monitor';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Pending (un-adjudicated) monitor alerts across all theses — dashboard card. */
export async function GET() {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    return { alerts: await listPendingAlerts(ctx) };
  });
}
