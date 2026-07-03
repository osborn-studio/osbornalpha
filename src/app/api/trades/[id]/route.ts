export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { deleteTrade } from '@/lib/portfolio/store';

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
      return NextResponse.json(
        { error: '删除该笔买入会导致后续卖出超过持仓，请先删除相关卖出记录' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
