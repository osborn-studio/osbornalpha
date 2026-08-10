/**
 * Eastmoney (东方财富) free quote + kline API client.
 *
 * Endpoints used:
 *   GET https://push2delay.eastmoney.com/api/qt/stock/get   — single-stock snapshot
 *   GET https://push2his.eastmoney.com/api/qt/stock/kline/get — historical K-line
 *
 * No auth required. Production access from Vercel works; rate limits are
 * generous (single-shot per stock per refresh). Add caching on top.
 */

import type { Market } from '@/lib/supabase/database.types';

// ─── Ticker → Eastmoney secid ───
// secid format: "{marketCode}.{code}" where:
//   0   = 深圳 (SZ / BJ)
//   1   = 上海 (SH)
//   116 = 港股 (HK)
//   105 = NASDAQ
//   106 = NYSE
//   107 = AMEX
//   1.000001 / 1.000300 = 上证指数 / 沪深300 etc

const US_FALLBACK_PREFIXES = ['105', '106', '107'];

export interface ParsedTicker {
  secid: string;
  market: Market;
  /** Decimal divisor for price fields (100 for A-share, 1000 for HK/US) */
  scale: number;
}

export function tickerToSecid(ticker: string): ParsedTicker | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase().trim();

  // A-share (6 digits + .SH/.SZ/.BJ)
  const a = upper.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  if (a) {
    const code = a[1];
    const suf = a[2];
    const prefix = suf === 'SH' ? '1' : '0';
    return { secid: `${prefix}.${code}`, market: 'A', scale: 100 };
  }

  // HK (5 digits + .HK)
  const hk = upper.match(/^(\d{5})\.HK$/);
  if (hk) return { secid: `116.${hk[1]}`, market: 'HK', scale: 1000 };

  // US (no suffix) — try NASDAQ first; route will fall back to NYSE if 404
  if (/^[A-Z\.]{1,10}$/.test(upper)) {
    return { secid: `105.${upper}`, market: 'US', scale: 1000 };
  }

  return null;
}

// ─── Quote response shape ───
export interface EastmoneyQuote {
  source: 'eastmoney';
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
  volume: number;       // 手 for A-share, shares for HK/US
  amount: number;       // 元 / HKD / USD
  amplitude: number;    // %
  market_cap: number | null;
  market_cap_label: string;
  pe_ttm: number | null;
  pb: number | null;
  turnover: number | null;     // 换手率 %
  volume_ratio: number | null; // 量比
  updated_at: string;
  delayed: boolean;
}

const QUOTE_FIELDS = 'f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f86,f117,f152,f162,f167,f168,f169,f170';

async function fetchJsonp(url: string, timeoutMs = 5000, externalSignal?: AbortSignal): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([ctrl.signal, externalSignal]) : ctrl.signal;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        'Referer': 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (compatible; StockMonitor/1.0)',
      },
      signal,
      redirect: 'follow',
      cache: externalSignal ? 'no-store' : undefined,
      next: externalSignal ? undefined : { revalidate: 30 },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new Error(`Eastmoney HTTP ${resp.status}`);
  const text = await resp.text();
  // Strip JSONP wrapper if present
  const match = text.match(/^[a-zA-Z_$][\w$]*\((.*)\);?\s*$/s);
  const jsonStr = match ? match[1] : text;
  return JSON.parse(jsonStr);
}

function safeNum(v: any): number | null {
  if (v === undefined || v === null || v === '-' || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function formatMarketCap(yuan: number | null, market: Market): string {
  if (yuan === null || yuan === 0) return '—';
  const symbol = market === 'A' ? '¥' : market === 'HK' ? 'HK$' : '$';
  if (yuan >= 1e12) return `${symbol}${(yuan / 1e12).toFixed(2)}万亿`;
  if (yuan >= 1e8)  return `${symbol}${(yuan / 1e8).toFixed(0)}亿`;
  if (yuan >= 1e4)  return `${symbol}${(yuan / 1e4).toFixed(0)}万`;
  return `${symbol}${yuan.toFixed(0)}`;
}

function parseQuoteData(data: any, market: Market, scale: number, ticker: string): EastmoneyQuote | null {
  if (!data || data.f43 === undefined) return null;

  const price = safeNum(data.f43);
  if (price === null) return null;

  const pricep = price / scale;
  const high = safeNum(data.f44) !== null ? safeNum(data.f44)! / scale : pricep;
  const low = safeNum(data.f45) !== null ? safeNum(data.f45)! / scale : pricep;
  const open = safeNum(data.f46) !== null ? safeNum(data.f46)! / scale : pricep;
  const prev = safeNum(data.f60) !== null ? safeNum(data.f60)! / scale : pricep;
  const change = safeNum(data.f169) !== null ? safeNum(data.f169)! / scale : pricep - prev;
  const change_pct = safeNum(data.f170) !== null ? safeNum(data.f170)! / 100 : ((pricep - prev) / prev) * 100;
  const amplitude = prev > 0 ? ((high - low) / prev) * 100 : 0;
  const market_cap = safeNum(data.f117);
  const pe = safeNum(data.f162);
  const pb = safeNum(data.f167);
  const turnover = safeNum(data.f168);
  const ts = safeNum(data.f86);

  return {
    source: 'eastmoney',
    ticker,
    name: data.f58 || ticker,
    market,
    currency: market === 'A' ? '¥' : market === 'HK' ? 'HK$' : '$',
    price: pricep,
    change,
    change_pct,
    open, high, low, prev_close: prev,
    volume: safeNum(data.f47) || 0,
    amount: safeNum(data.f48) || 0,
    amplitude: Number(amplitude.toFixed(2)),
    market_cap,
    market_cap_label: formatMarketCap(market_cap, market),
    pe_ttm: pe !== null ? pe / 100 : null,
    pb: pb !== null ? pb / 100 : null,
    turnover: turnover !== null ? turnover / 100 : null,
    volume_ratio: safeNum(data.f50) !== null ? safeNum(data.f50)! / 100 : null,
    updated_at: ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
    delayed: true,  // we hit push2delay endpoint
  };
}

export async function fetchEastmoneyQuote(ticker: string, signal?: AbortSignal): Promise<EastmoneyQuote | null> {
  const parsed = tickerToSecid(ticker);
  if (!parsed) return null;

  const tryFetch = async (secid: string): Promise<EastmoneyQuote | null> => {
    const url = `https://push2delay.eastmoney.com/api/qt/stock/get?invt=2&fltt=1&cb=cb&secid=${secid}&fields=${QUOTE_FIELDS}`;
    try {
      const json = await fetchJsonp(url, 5000, signal);
      if (json && json.data) {
        return parseQuoteData(json.data, parsed.market, parsed.scale, ticker);
      }
    } catch (e) {
      // swallow & let caller decide
    }
    return null;
  };

  let quote = await tryFetch(parsed.secid);
  // US fallback: NASDAQ → NYSE → AMEX
  if (!quote && parsed.market === 'US') {
    const code = parsed.secid.slice(parsed.secid.indexOf('.') + 1);
    for (const prefix of US_FALLBACK_PREFIXES.slice(1)) {
      quote = await tryFetch(`${prefix}.${code}`);
      if (quote) break;
    }
  }
  return quote;
}

// ─── K-line ───
export interface KlineBar { time: string; open: number; high: number; low: number; close: number; volume: number }

export type KlineInterval = '1' | 'D' | 'W' | 'M';

export async function fetchEastmoneyKline(
  ticker: string,
  period: KlineInterval = 'D',
  limit = 120
): Promise<{ source: 'eastmoney'; bars: KlineBar[] } | null> {
  const parsed = tickerToSecid(ticker);
  if (!parsed) return null;

  // Eastmoney uses 1 for one-minute bars and 101/102/103 for daily/weekly/monthly.
  const klt = period === '1' ? '1' : period === 'D' ? '101' : period === 'W' ? '102' : '103';
  const tryFetch = async (secid: string): Promise<KlineBar[]> => {
    const url =
      `https://push2his.eastmoney.com/api/qt/stock/kline/get?cb=cb` +
      `&secid=${secid}&klt=${klt}&fqt=1` +    // fqt=1 前复权
      `&lmt=${limit}&end=20500101` +
      `&fields1=f1,f2,f3,f4,f5,f6` +
      `&fields2=f51,f52,f53,f54,f55,f56,f57`;
    const json = await fetchJsonp(url);
    const klines: string[] = json?.data?.klines || [];
    return klines.map((line) => {
      const [date, open, close, high, low, volume] = line.split(',');
      return {
        time: date,
        open: parseFloat(open),
        close: parseFloat(close),
        high: parseFloat(high),
        low: parseFloat(low),
        volume: parseFloat(volume),
      };
    });
  };

  let bars: KlineBar[] = [];
  try {
    bars = await tryFetch(parsed.secid);
  } catch {}
  if (bars.length === 0 && parsed.market === 'US') {
    const code = parsed.secid.slice(parsed.secid.indexOf('.') + 1);
    for (const prefix of US_FALLBACK_PREFIXES.slice(1)) {
      try {
        bars = await tryFetch(`${prefix}.${code}`);
        if (bars.length > 0) break;
      } catch {}
    }
  }
  return bars.length > 0 ? { source: 'eastmoney', bars } : null;
}
