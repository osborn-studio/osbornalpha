import { NextResponse } from 'next/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { validateSelectableSecuritiesWithClient } from '@/lib/watchlist/security-validation';

export const dynamic = 'force-dynamic';

function parseTickers(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const tickers = value
    .filter((ticker): ticker is string => typeof ticker === 'string')
    .map((ticker) => ticker.trim())
    .filter(Boolean);
  return tickers.length === value.length ? tickers : null;
}

/** Validates a pasted watchlist before it is persisted in local or server storage. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const tickers = parseTickers(body && typeof body === 'object' ? (body as { tickers?: unknown }).tickers : undefined);
  if (!tickers) return NextResponse.json({ error: 'invalid_tickers' }, { status: 400 });
  if (!serverIsSupabaseConfigured()) {
    return NextResponse.json({ error: 'security_master_unavailable' }, { status: 503 });
  }

  try {
    const client = await getServerSupabase();
    const validation = await validateSelectableSecuritiesWithClient(client as any, tickers);
    return NextResponse.json({ accepted: validation.canonicalTickers, rejected: validation.rejected });
  } catch {
    return NextResponse.json({ error: 'security_master_unavailable' }, { status: 503 });
  }
}
