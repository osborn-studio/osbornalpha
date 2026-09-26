import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { listCards } from '@/lib/research/cards/run';
import { weekOfMonday } from '@/lib/research/cards/run';
import { decideCard, freezeBaseline, revealCards, weeklyStatus } from '@/lib/research/weekly/weekly';
import type { DecisionAction } from '@/lib/research/s4/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** WP-A9 weekend flow. Actor = the signed-in admin, as requireS4Actor's session branch derives it. */
export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const week = new URL(req.url).searchParams.get('week') ?? weekOfMonday();
    return weeklyStatus({ actor: { userId: ctx.userId, kind: 'human' }, readCards: (w) => listCards(ctx, w), weekOf: week });
  });
}
export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const actor = { userId: ctx.userId, kind: 'human' as const };
    const body = await req.json().catch(() => ({}));
    const weekOf = typeof body?.week_of === 'string' ? body.week_of : weekOfMonday();
    const readCards = (w: string) => listCards(ctx, w);
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    if (body?.action === 'freeze') return NextResponse.json(await freezeBaseline({ actor, weekOf, thesis_id: str(body.thesis_id), action: str(body.decision) as DecisionAction, reason: str(body.reason) }), { status: 201 });
    if (body?.action === 'reveal') return revealCards({ actor, readCards, weekOf });
    if (body?.action === 'decide') return NextResponse.json(await decideCard({ actor, readCards, weekOf, card_id: str(body.card_id), action: str(body.decision) as DecisionAction, reason: str(body.reason),
      time_spent_minutes: Number.isSafeInteger(body.time_spent_minutes) ? body.time_spent_minutes : null, observation_id: typeof body.observation_id === 'string' && body.observation_id ? body.observation_id : null }), { status: 201 });
    return NextResponse.json({ error: { code: 'invalid_schema', message: 'action must be freeze, reveal or decide' } }, { status: 400 });
  });
}
