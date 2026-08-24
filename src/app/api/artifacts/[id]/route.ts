export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getArtifact } from '@/lib/portfolio/artifacts-store';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const artifact = await getArtifact(id);
    if (!artifact) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ artifact });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
