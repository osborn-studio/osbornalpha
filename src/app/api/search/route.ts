import { NextResponse } from 'next/server';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { searchUniverse } from '@/lib/stocks/search';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import type { StockUniverse } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10), 50);

  if (serverIsSupabaseConfigured() && q.length > 0) {
    try {
      const sb = await getServerSupabase();
      const { data, error } = await sb
        .from('stocks_universe')
        .select('ticker, name, pinyin, market')
        .or(`ticker.ilike.%${q}%,name.ilike.%${q}%,pinyin.ilike.%${q}%`)
        .limit(limit);
      if (!error && data && data.length > 0) {
        const rows = data as Pick<StockUniverse, 'ticker' | 'name' | 'pinyin' | 'market'>[];
        return NextResponse.json({
          source: 'supabase',
          results: rows.map((r) => ({ t: r.ticker, n: r.name, py: r.pinyin || '', m: r.market })),
        });
      }
    } catch {}
  }

  return NextResponse.json({
    source: 'mock',
    results: searchUniverse(MOCK_UNIVERSE, q, limit),
  });
}
