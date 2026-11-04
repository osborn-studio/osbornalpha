import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import type { Row } from '@/lib/db/table-client';
import { supabaseTableClient } from '@/lib/db/table-client';
import { parseDqQuery, summarizeDq, within } from '@/lib/dq/dashboard';
import { freshnessOf } from '@/lib/dq/freshness';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const RECENT_BATCHES = 50;
const DAY_MS = 86_400_000;

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const parsed = parseDqQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { dataset, page, pageSize } = parsed.query;

    const client = supabaseTableClient(getAdminSupabase());
    const now = new Date();
    const quarantineMatch: Row = dataset ? { status: 'open', dataset } : { status: 'open' };
    const [batches, freshness, openQuarantineTotal, quarantineRows, failedReconciliationsTotal, reconciliations] =
      await Promise.all([
        client.select('ingest_batches', {}, { orderBy: 'started_at', desc: true, limit: RECENT_BATCHES }),
        freshnessOf(client, now),
        client.count('dq_quarantine', quarantineMatch),
        client.select('dq_quarantine', quarantineMatch, {
          orderBy: 'created_at', desc: true, limit: pageSize, offset: (page - 1) * pageSize,
        }),
        client.count('dq_reconciliations', { passed: false }),
        client.select('dq_reconciliations', { passed: false }, { orderBy: 'created_at', desc: true, limit: 50 }),
      ]);

    const batches24h = within(batches, 'started_at', now, DAY_MS);
    const summary = summarizeDq({
      batches: batches24h.map((b) => ({ dataset: String(b.dataset), status: String(b.status) })),
      freshness: freshness.map((f) => ({ dataset: String(f.dataset), status: f.status, stored_status: f.stored_status })),
      openQuarantineTotal,
      failedReconciliationsTotal,
    });

    return NextResponse.json({
      summary,
      // The 24h tile is derived from the latest RECENT_BATCHES rows; if all of them fall in
      // the window there may be more, and the client shows the count as a lower bound.
      batches24hTruncated: batches.length === RECENT_BATCHES && batches24h.length === RECENT_BATCHES,
      batches,
      freshness,
      quarantine: { rows: quarantineRows, page, pageSize, total: openQuarantineTotal },
      reconciliations,
      refreshedAt: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    }
    if (error instanceof AdminForbidden) {
      return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    }
    console.error('admin dq dashboard failed');
    return NextResponse.json({ error: 'dq dashboard unavailable' }, { status: 500 });
  }
}
