import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { createThesis, listTheses } from '@/lib/research/theses';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    return { theses: listTheses(db) };
  });
}

export async function POST(req: Request) {
  return withResearch(async () => {
    assertEnabled();
    const body = await req.json().catch(() => ({}));
    const db = getDb();
    const thesis = createThesis(db, body);
    return NextResponse.json({ thesis }, { status: 201 });
  });
}
