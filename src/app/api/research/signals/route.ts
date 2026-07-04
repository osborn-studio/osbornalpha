import { assertEnabled, getDb } from '@/lib/research/db';
import { listSignals, listPendingSources } from '@/lib/research/signals';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    return {
      signals: listSignals(db),
      pending_source_count: listPendingSources(db, 1000).length,
    };
  });
}
