import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { adjudicateAlert, type AdjudicationAction } from '@/lib/research/monitor';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/**
 * Human adjudication of a pending monitor alert — the ONLY path from alert
 * to thesis status (WATCH / CONFIRM_AT_RISK / CLOSE reuse the T3 guards).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const result = await adjudicateAlert(
      ctx,
      id,
      eventId,
      body.action as AdjudicationAction,
      typeof body.reason === 'string' ? body.reason : '',
    );
    return NextResponse.json(result);
  });
}
