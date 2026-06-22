import { NextResponse } from 'next/server';
import { computeComposite } from '@/lib/dcf/engine';
import { assembleAssumptions } from '@/lib/dcf/assemble';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Ctx { params: { ticker: string } }

/** POST /api/dcf/[ticker]  body: { overrides?: Partial<DcfAssumptions> } → { assumptions, result, warnings } */
export async function POST(req: Request, { params }: Ctx) {
  const ticker = decodeURIComponent(params.ticker);
  let overrides = {};
  try { overrides = (await req.json())?.overrides ?? {}; } catch { /* empty body ok */ }

  const origin = new URL(req.url).origin;
  let financials: unknown = null;
  try {
    const r = await fetch(`${origin}/api/financials/${encodeURIComponent(ticker)}`, { cache: 'no-store' });
    if (r.ok) financials = await r.json();
  } catch { /* leave null → defaults */ }

  const { assumptions, warnings } = await assembleAssumptions(ticker, financials, overrides);
  const result = computeComposite(assumptions);
  return NextResponse.json({ ticker, assumptions, result, warnings });
}
