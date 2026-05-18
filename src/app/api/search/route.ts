import { NextResponse } from 'next/server';
import { MOCK_UNIVERSE } from '@/lib/data/mock';
import { searchUniverse } from '@/lib/stocks/search';
import { normalizeWindTicker } from '@/lib/stocks/wind-normalize';
import type { Market } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';
export const revalidate = 60;  // cache 60s per query

interface EastmoneyItem {
  Code: string;
  Name: string;
  PinYin?: string;
  Classify: string;
  SecurityTypeName: string;
  UnifiedCode: string;
  QuoteID: string;
  MktNum: string;
}

interface UniverseRow {
  t: string;       // canonical ticker (e.g. "002624.SZ", "00700.HK", "AAPL")
  n: string;       // name
  py: string;      // pinyin
  m: Market;
}

/**
 * Parse Eastmoney suggest result.
 * QuoteID format: "{marketCode}.{code}" — marketCode:
 *   0   = 深圳 (SZ)
 *   1   = 上海 (SH)
 *   116 = 港股 (HK)
 *   105 = NASDAQ
 *   106 = NYSE
 *   107 = AMEX
 *   90  = 北交所 (BJ)
 */
function parseEastmoney(item: EastmoneyItem): UniverseRow | null {
  const { Code, Name, PinYin, QuoteID } = item;
  if (!QuoteID || !Code || !Name) return null;
  const dotIdx = QuoteID.indexOf('.');
  if (dotIdx < 0) return null;
  const marketCode = QuoteID.slice(0, dotIdx);
  let market: Market | null = null;
  let ticker = Code;
  switch (marketCode) {
    case '0':   market = 'A';  ticker = `${Code}.SZ`; break;
    case '1':   market = 'A';  ticker = `${Code}.SH`; break;
    case '90':  market = 'A';  ticker = `${Code}.BJ`; break;
    case '116': market = 'HK'; ticker = `${Code}.HK`; break;
    case '105': case '106': case '107':
      market = 'US'; ticker = Code; break;
    default: return null;
  }
  return { t: ticker, n: Name, py: PinYin || '', m: market };
}

async function searchEastmoney(query: string): Promise<UniverseRow[]> {
  const url = new URL('https://searchapi.eastmoney.com/api/suggest/get');
  url.searchParams.set('cb', 'cb');
  url.searchParams.set('input', query);
  url.searchParams.set('type', '14');
  url.searchParams.set('count', '15');
  url.searchParams.set('_', String(Date.now()));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      headers: {
        'Referer': 'https://www.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (compatible; StockMonitor/1.0)',
      },
      next: { revalidate: 60 },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new Error(`Eastmoney HTTP ${resp.status}`);
  const text = await resp.text();

  // Strip JSONP wrapper: "cb({...})"
  const match = text.match(/^cb\((.*)\)\s*$/s);
  const jsonStr = match ? match[1] : text;
  const data = JSON.parse(jsonStr);

  const items: EastmoneyItem[] = data?.QuotationCodeTable?.Data || [];
  return items
    .map(parseEastmoney)
    .filter((x): x is UniverseRow => x !== null);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 30);

  if (rawQ.length === 0) {
    return NextResponse.json({ source: 'empty', results: [] });
  }

  // Wind / Sina / Yahoo / Snowball dialect normalization. The Eastmoney
  // suggest API only understands the canonical form (or plain text).
  // `AAPL.O` → `AAPL`, `sh600519` → `600519.SH`, `700.HK` → `00700.HK`.
  const normalized = normalizeWindTicker(rawQ);
  const q = normalized !== rawQ.toUpperCase() ? normalized : rawQ;

  // Try local mock first (instant for the curated 30)
  const localHits = searchUniverse(MOCK_UNIVERSE, q, limit);

  // Always try Eastmoney too — its results take precedence for completeness
  try {
    const emHits = await searchEastmoney(q);
    // Merge: Eastmoney first (broader), local for whatever Eastmoney missed
    const seen = new Set(emHits.map((r) => r.t));
    const merged = [
      ...emHits,
      ...localHits.filter((r) => !seen.has(r.t)),
    ].slice(0, limit);
    return NextResponse.json({ source: 'eastmoney+local', results: merged });
  } catch (err) {
    console.error('Eastmoney search failed:', err);
    // Fall back to local only
    return NextResponse.json({
      source: 'local-fallback',
      results: localHits,
      error: 'Eastmoney unavailable',
    });
  }
}
