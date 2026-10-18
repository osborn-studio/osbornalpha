export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { patchProfile } from '@/lib/analyst/store';
import { parseProfilePatch } from '@/lib/analyst/validate';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });
  const parsed = parseProfilePatch(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const profile = await patchProfile(id, parsed.value);
    return NextResponse.json({ profile });
  } catch (e) {
    return analystError(e);
  }
}
