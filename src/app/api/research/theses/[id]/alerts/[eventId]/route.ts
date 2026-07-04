import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { adjudicateAlert, type AdjudicationAction } from '@/lib/research/monitor';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/**
 * Human adjudication of a pending monitor alert — the ONLY path from alert
 * to thesis status (WATCH / CONFIRM_AT_RISK / CLOSE reuse the T3 guards).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; eventId: string } },
) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const result = adjudicateAlert(
      db,
      params.id,
      params.eventId,
      body.action as AdjudicationAction,
      typeof body.reason === 'string' ? body.reason : '',
    );
    return NextResponse.json(result);
  });
}
