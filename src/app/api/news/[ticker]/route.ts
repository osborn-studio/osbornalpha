import { NextResponse } from 'next/server';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { getStockNews } from '@/lib/stocks/external-research';
import { authorizeExternalEvidenceRequest } from '@/lib/auth/external-evidence-auth';
import { persistStockNews } from '@/lib/stocks/research-artifact-repository';
import { consumeExternalEvidenceQuota } from '@/lib/external-evidence/quota';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(request: Request, { params }: Ctx) {
  const auth = await authorizeExternalEvidenceRequest();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ticker: raw } = await params;
  const ticker = normalizeEvidenceTickerParam(raw);
  if (!ticker) return NextResponse.json({ error: 'invalid_ticker' }, { status: 400 });
  if (!await consumeExternalEvidenceQuota(auth.client)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const days = Number(new URL(request.url).searchParams.get('days'));
  try {
    const result = await getStockNews(ticker, Number.isFinite(days) ? days : 14);
    if (auth.client && auth.userId) {
      try {
        await persistStockNews(auth.client, auth.userId, result);
      } catch {
        result.meta.status = result.meta.status === 'unavailable' ? 'unavailable' : 'partial';
        result.meta.warnings = [...new Set([...result.meta.warnings, 'news_persist_failed'])];
      }
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'news_unavailable', ticker, items: [] }, { status: 502 });
  }
}
