import { NextResponse } from 'next/server';
import { getStockOrStub } from '@/lib/data/mock';

interface Ctx { params: Promise<{ ticker: string }> }

export async function GET(_request: Request, { params }: Ctx) {
  const { ticker } = await params;
  const decoded = decodeURIComponent(ticker);
  const stock = getStockOrStub(decoded);
  if (!stock) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ source: 'mock', stock });
  // Disclosure facts for a company are served by /api/companies/[ticker]/overview (company-research spec §6.1);
  // financial_history stays unread (decision C keeps the table, §0.1 item 7).
}
