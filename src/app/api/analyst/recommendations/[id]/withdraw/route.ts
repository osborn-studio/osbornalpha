export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withdrawRecommendation } from '@/lib/analyst/store';
import { parseWithdrawInput } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

interface Ctx { params: Promise<{ id: string }> }

// POST { reason? } → { recommendation }; 404 recommendation not found; 409 recommendation withdrawn
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });
  const parsed = parseWithdrawInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const recommendation = await withdrawRecommendation(id, parsed.value.reason);
    return NextResponse.json({ recommendation });
  } catch (e) {
    return analystError(e);
  }
}
