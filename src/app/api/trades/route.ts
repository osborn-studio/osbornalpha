export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listTrades, createTrade } from '@/lib/portfolio/store';
import { parseTradeInput } from '@/lib/portfolio/validate';

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const trades = await listTrades(url.searchParams.get('ticker') ?? undefined);
    return NextResponse.json({ trades });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  const parsed = parseTradeInput(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const trade = await createTrade(parsed.value);
    return NextResponse.json({ trade }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'not authenticated') return NextResponse.json({ error: msg }, { status: 401 });
    if (/oversell/i.test(msg)) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
