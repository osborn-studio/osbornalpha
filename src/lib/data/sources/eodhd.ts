/**
 * EODHD (eodhd.com) paid quote source — JP/KR placeholder adapter.
 *
 * ⚠️ 未订阅未实测：this adapter is written against EODHD's PUBLIC docs
 * (https://eodhd.com/financial-apis/live-realtime-stocks-api) but the
 * account is not subscribed yet, so the response shape has NOT been
 * verified against live data. When a paying user justifies the €19.99/mo
 * subscription, set EODHD_API_TOKEN and this adapter goes live — no code
 * changes expected beyond fixing any shape drift found in smoke testing.
 *
 * Code mapping (ours → EODHD): .T → .TSE (Tokyo), .KS → .KO (KOSPI),
 * .KQ → .KQ (KOSDAQ).
 */

import type { Market } from '@/lib/supabase/database.types';
import { classifyMarket, currencyOfMarket } from '@/lib/utils';

export interface EodhdQuote {
  source: 'eodhd';
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;
  amount: number;
  amplitude: number;
  market_cap: number | null;
  market_cap_label: string;
  pe_ttm: number | null;
  pb: number | null;
  turnover: number | null;
  volume_ratio: number | null;
  updated_at: string;
  delayed: boolean;
}

export function isEodhdConfigured(): boolean {
  return !!process.env.EODHD_API_TOKEN;
}

/** Map our ticker convention to EODHD's exchange codes. */
function toEodhdCode(ticker: string): string | null {
  const upper = ticker.toUpperCase();
  const jp = upper.match(/^(.+)\.T$/);
  if (jp) return `${jp[1]}.TSE`;
  const ks = upper.match(/^(.+)\.KS$/);
  if (ks) return `${ks[1]}.KO`;
  const kq = upper.match(/^(.+)\.KQ$/);
  if (kq) return `${kq[1]}.KQ`;
  return null;
}

function safeNum(v: unknown): number | null {
  if (v === undefined || v === null || v === 'NA' || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export async function fetchEodhdQuote(ticker: string, timeoutMs = 4000): Promise<EodhdQuote | null> {
  if (!isEodhdConfigured()) return null;
  const code = toEodhdCode(ticker);
  if (!code) return null;

  const url = `https://eodhd.com/api/real-time/${encodeURIComponent(code)}?api_token=${process.env.EODHD_API_TOKEN}&fmt=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(url, { signal: ctrl.signal, next: { revalidate: 30 } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) return null;

  let data: any;
  try {
    data = await resp.json();
  } catch {
    return null;
  }

  // Documented shape: { code, timestamp, open, high, low, close,
  //   previousClose, change, change_p, volume } — 'NA' for missing fields.
  const price = safeNum(data?.close);
  if (price === null) return null;
  const prev_close = safeNum(data?.previousClose) ?? price;
  const open = safeNum(data?.open) ?? price;
  const high = safeNum(data?.high) ?? price;
  const low = safeNum(data?.low) ?? price;
  const change = safeNum(data?.change) ?? price - prev_close;
  const change_pct = safeNum(data?.change_p) ?? (prev_close > 0 ? (change / prev_close) * 100 : 0);
  const market = classifyMarket(ticker);
  const ts = safeNum(data?.timestamp);

  return {
    source: 'eodhd',
    ticker,
    name: ticker, // real-time endpoint has no name field; universe lookup TBD post-subscription
    market,
    currency: currencyOfMarket(market),
    price, change, change_pct,
    open, high, low, prev_close,
    volume: safeNum(data?.volume) ?? 0,
    amount: 0,
    amplitude: prev_close > 0 ? ((high - low) / prev_close) * 100 : 0,
    market_cap: null,
    market_cap_label: '—',
    pe_ttm: null, pb: null, turnover: null, volume_ratio: null,
    updated_at: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
    delayed: true, // EODHD live quotes are 15-20 min delayed on base plans
  };
}
