import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { ingestSource, listSources } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';
import type { SourceType } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return withResearch(() => {
    assertEnabled();
    const url = new URL(req.url);
    const type = (url.searchParams.get('type') || undefined) as SourceType | undefined;
    const db = getDb();
    return { sources: listSources(db, { type }) };
  });
}

export async function POST(req: Request) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const result = ingestSource(db, body);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  });
}
