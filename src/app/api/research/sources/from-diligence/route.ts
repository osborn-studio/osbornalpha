import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { ingestDiligence } from '@/lib/research/diligence';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

// POST /api/research/sources/from-diligence
// Store a company-diligence brief as a versioned Research OS source.
// Admin-gated (requireResearchUser → 403 for non-admin). Body:
// { ticker, canonical_name?, one_line?, unverified?[], markdown, tool_refs?[], provenance? }
export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const result = await ingestDiligence(ctx, body);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  });
}
