import { assertEnabled, getDb } from '@/lib/research/db';
import { listPendingAlerts } from '@/lib/research/monitor';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** Pending (un-adjudicated) monitor alerts across all theses — dashboard card. */
export async function GET() {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    return { alerts: listPendingAlerts(db) };
  });
}
