import { NextResponse } from 'next/server';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { getStockNews } from '@/lib/stocks/external-research';
import { authorizeExternalEvidenceRequest } from '@/lib/auth/external-evidence-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await authorizeExternalEvidenceRequest();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ticker: raw } = await params;
  const ticker = normalizeEvidenceTickerParam(raw);
  if (!ticker) return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
  const days = Number(new URL(request.url).searchParams.get('days'));
  try {
    return NextResponse.json(await getStockNews(ticker, Number.isFinite(days) ? days : 14));
  } catch {
    return NextResponse.json({ error: 'news_unavailable', ticker, items: [] }, { status: 502 });
  }
}
