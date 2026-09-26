import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { withResearch } from '@/lib/research/api';
import { thesisObservations } from '@/lib/research/weekly/weekly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** S4 observations already registered for a thesis, for linking a collab decision (E4 observation_id). */
export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const thesis = new URL(req.url).searchParams.get('thesis') ?? '';
    if (!/^[0-9a-f-]{36}$/.test(thesis)) return NextResponse.json({ error: { code: 'invalid_schema', message: 'thesis is required' } }, { status: 400 });
    return { observations: await thesisObservations({ actor: { userId: ctx.userId, kind: 'human' }, thesis_id: thesis }) };
  });
}
