import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { createThesis, listTheses } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    return { theses: await listTheses(ctx) };
  });
}

export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const thesis = await createThesis(ctx, body);
    return NextResponse.json({ thesis }, { status: 201 });
  });
}
