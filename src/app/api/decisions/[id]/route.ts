export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { updateDecisionStatus } from '@/lib/portfolio/store';
import type { DecisionStatus } from '@/lib/supabase/database.types';

const STATUSES: DecisionStatus[] = ['open', 'executed', 'expired', 'cancelled'];

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!STATUSES.includes(body.status as DecisionStatus)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join('|')}` }, { status: 400 });
  }
  try {
    await updateDecisionStatus(id, body.status as DecisionStatus);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
