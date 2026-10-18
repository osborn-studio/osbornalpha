export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createProfile, listProfiles, loadBookRowsByAnalyst } from '@/lib/analyst/store';
import { buildBook } from '@/lib/analyst/book';
import { parseProfileInput } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';

// GET → { profiles: Array<AnalystProfile & { summary: BookSummary }> }
export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get('archived') === '1';
  try {
    const [profiles, rowsByAnalyst] = await Promise.all([listProfiles({ includeArchived }), loadBookRowsByAnalyst()]);
    const out = profiles.map((p) => ({ ...p, summary: buildBook(rowsByAnalyst.get(p.id) ?? []).summary }));
    return NextResponse.json({ profiles: out });
  } catch (e) {
    return analystError(e);
  }
}

// POST { display_name, kind?, note? } → 201 { profile }; 409 analyst name taken
export async function POST(req: Request) {
  const parsed = parseProfileInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const profile = await createProfile(parsed.value);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (e) {
    return analystError(e);
  }
}
