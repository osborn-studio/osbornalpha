import { NextResponse } from 'next/server';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { legacySearchGET } from '@/lib/securities/legacy-search';
import { inferCoreMarket, normalizeSecurityTicker } from '@/lib/securities/normalize';
import { searchSecurities } from '@/lib/securities/search';
import { serverIsSupabaseConfigured, getServerSupabase } from '@/lib/supabase/server';
import { classifyAssetType } from '@/lib/stocks/asset-type';
import { searchUniverse } from '@/lib/stocks/search';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

function normalizeQuery(query: string): string {
  const market = inferCoreMarket(query);
  return market ? (normalizeSecurityTicker(query, market) ?? query) : query;
}

function developerFallback(query: string, limit: number) {
  return searchUniverse(MOCK_UNIVERSE, query, limit).map((row) => ({
    ...row,
    asset_type: classifyAssetType({ ticker: row.t, name: row.n }),
    exchange: null,
    list_status: 'listed',
    match_kind: 'developer_fallback',
    verification_status: 'development',
    selectable: true,
  }));
}

export async function GET(request: Request) {
  if (process.env.SECURITY_MASTER_SEARCH_ENABLED === 'false') return legacySearchGET(request);

  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get('q') ?? '').trim();
  if (!rawQuery) return NextResponse.json({ source: 'empty', results: [] });
  if (rawQuery.length > 80) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }

  const rawLimit = Number(searchParams.get('limit') ?? '10');
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 30) {
    return NextResponse.json({ error: 'invalid_limit' }, { status: 400 });
  }
  const query = normalizeQuery(rawQuery);

  if (!serverIsSupabaseConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ source: 'developer-fallback', results: developerFallback(query, rawLimit) });
    }
    return NextResponse.json({ error: 'security_master_unavailable' }, { status: 503 });
  }

  try {
    const client = await getServerSupabase();
    const results = await searchSecurities(client as any, query, rawLimit);
    return NextResponse.json({ source: 'security-master', results });
  } catch {
    return NextResponse.json({ error: 'security_master_unavailable' }, { status: 503 });
  }
}
