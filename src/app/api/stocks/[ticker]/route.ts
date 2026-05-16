import { NextResponse } from 'next/server';
import { getStockOrStub } from '@/lib/data/mock';

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const { ticker } = await params;
  const decoded = decodeURIComponent(ticker);
  const stock = getStockOrStub(decoded);
  if (!stock) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ source: 'mock', stock });
  // TODO v0.2: query Supabase (stocks_universe + financial_history) and merge with live API
}
