export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { deleteTrade } from '@/lib/portfolio/store';
import { getRequestLocale, apiMessage } from '@/lib/i18n/server';

interface Ctx { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteTrade(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'not authenticated') return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === 'trade not found') return NextResponse.json({ error: msg }, { status: 404 });
    if (/oversell/i.test(msg)) {
      const locale = await getRequestLocale();
      return NextResponse.json(
        { error: apiMessage(locale, 'oversellBlocked') },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
