import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { ingestSource, listSources } from '@/lib/research/sources';
import { withResearch } from '@/lib/research/api';
import type { SourceType } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const url = new URL(req.url);
    const type = (url.searchParams.get('type') || undefined) as SourceType | undefined;
    return { sources: await listSources(ctx, { type }) };
  });
}

export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const result = await ingestSource(ctx, body);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  });
}
