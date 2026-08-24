/**
 * 新浪财经 (sina) free quote source.
 *
 * Endpoint:  http(s)://hq.sinajs.cn/list={prefix}{code},...
 * No auth, no quota. Geo-unblocked from Vercel US egress (verified).
 * Response is GBK-encoded CSV-ish text, one var declaration per ticker.
 *
 * Prefix → market:
 *   sh / sz       → A-share
 *   rt_hk         → 港股
 *   gb_           → 美股 (lowercase ticker, '.' replaced with '_')
 *
 * This is the same underlying source that AKShare (Python) wraps for many
 * of its A-share / HK / US spot endpoints. By calling it directly from
 * Next.js we get equivalent data without the Python runtime dependency.
 *
 * Sample response (sh600519):
 *   var hq_str_sh600519="贵州茅台,1577.000,1574.300,1573.000,1583.880,
 *     1572.500,1573.000,1573.001,1234567,1234567890,...";
 *
 * Field layout differs per market (A/HK/US) — see parsers below.
 */

import iconv from 'iconv-lite';
import type { Market } from '@/lib/supabase/database.types';
import { KlineProviderError, type KlineAdjustment, type SourceKlineBar } from '@/lib/data/kline/types';

export interface SinaQuote {
  source: 'sina';
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

interface ParsedSinaTicker {
  prefix: string;     // sh / sz / rt_hk / gb_
  code: string;       // canonical code used in the URL
  market: Market;
  currency: string;
}

function tickerToSina(ticker: string): ParsedSinaTicker | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase().trim();

  const a = upper.match(/^(\d{6})\.(SH|SZ)$/);
  if (a) {
    return {
      prefix: a[2].toLowerCase(),
      code: a[1],
      market: 'A',
      currency: '¥',
    };
  }

  // 北交所 (Beijing) — Sina doesn't have a clean prefix; bj{code} works for
  // some securities but is unreliable. Skip Sina for BJ; let the chain fall
  // through to Tushare.
  if (/^\d{6}\.BJ$/.test(upper)) return null;

  const hk = upper.match(/^(\d{5})\.HK$/);
  if (hk) {
    return {
      prefix: 'rt_hk',
      code: hk[1],
      market: 'HK',
      currency: 'HK$',
    };
  }

  // US: lowercase, dots converted to underscores (Sina convention for tickers
  // like BRK.B → gb_brk_b — verified against Sina's own US quote pages).
  if (/^[A-Z][A-Z.]{0,9}$/.test(upper)) {
    return {
      prefix: 'gb_',
      code: upper.toLowerCase().replace(/\./g, '_'),
      market: 'US',
      currency: '$',
    };
  }

  return null;
}

function formatMarketCap(yuan: number | null, market: Market): string {
  if (yuan === null || yuan === 0) return '—';
  const symbol = market === 'A' ? '¥' : market === 'HK' ? 'HK$' : '$';
  if (yuan >= 1e12) return `${symbol}${(yuan / 1e12).toFixed(2)}万亿`;
  if (yuan >= 1e8) return `${symbol}${(yuan / 1e8).toFixed(0)}亿`;
  if (yuan >= 1e4) return `${symbol}${(yuan / 1e4).toFixed(0)}万`;
  return `${symbol}${yuan.toFixed(0)}`;
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

/**
 * Parse A-share Sina response. Field layout:
 *   0  name         1  open       2  prev_close  3  price
 *   4  high         5  low        6  bid         7  ask
 *   8  volume(股)   9  amount(元) ...
 *  30  date        31  time
 */
function parseAShare(ticker: string, raw: string, p: ParsedSinaTicker): SinaQuote | null {
  const parts = raw.split(',');
  if (parts.length < 32) return null;
  const name = parts[0];
  const open = num(parts[1]);
  const prev_close = num(parts[2]);
  const price = num(parts[3]);
  if (price === 0 && prev_close === 0) return null;
  const high = num(parts[4]) || price;
  const low = num(parts[5]) || price;
  const volume = num(parts[8]);
  const amount = num(parts[9]);
  const change = price - prev_close;
  const change_pct = prev_close > 0 ? (change / prev_close) * 100 : 0;
  const amplitude = prev_close > 0 ? ((high - low) / prev_close) * 100 : 0;
  const date = parts[30] || '';
  const time = parts[31] || '00:00:00';
  return {
    source: 'sina',
    ticker, name, market: p.market, currency: p.currency,
    price, change, change_pct,
    open, high, low, prev_close,
    volume, amount, amplitude,
    market_cap: null,            // Sina A-share endpoint doesn't return market cap
    market_cap_label: '—',
    pe_ttm: null, pb: null, turnover: null, volume_ratio: null,
    updated_at: date ? `${date}T${time}+08:00` : new Date().toISOString(),
    delayed: false,
  };
}

/**
 * Parse HK Sina response (rt_hk{code}). Field layout (verified 2026-05):
 *   0  English name      1  Chinese name
 *   2  prev_close        3  open       4  high      5  low
 *   6  price             7  change     8  change_pct
 *   9  bid              10  ask
 *  11  volume(股)        12  amount(HKD)
 *  13  ...    14  ...    15  ...      16  ...
 *  17  date 18  time     ...
 *  37  52w_high  38  52w_low
 */
function parseHK(ticker: string, raw: string, p: ParsedSinaTicker): SinaQuote | null {
  const parts = raw.split(',');
  if (parts.length < 19) return null;
  const name = parts[1] || parts[0];
  const prev_close = num(parts[2]);
  const open = num(parts[3]);
  const high = num(parts[4]);
  const low = num(parts[5]);
  const price = num(parts[6]);
  if (price === 0 && prev_close === 0) return null;
  const change = num(parts[7]) || price - prev_close;
  const change_pct = num(parts[8]) || (prev_close > 0 ? (change / prev_close) * 100 : 0);
  const volume = num(parts[11]);
  const amount = num(parts[12]);
  const date = parts[17] || '';
  const time = parts[18] || '00:00:00';
  const amplitude = prev_close > 0 ? ((high - low) / prev_close) * 100 : 0;
  return {
    source: 'sina',
    ticker, name, market: p.market, currency: p.currency,
    price, change, change_pct,
    open, high, low, prev_close,
    volume, amount, amplitude,
    market_cap: null,
    market_cap_label: '—',
    pe_ttm: null, pb: null, turnover: null, volume_ratio: null,
    updated_at: date ? `${date}T${time}+08:00` : new Date().toISOString(),
    delayed: true,
  };
}

/**
 * Parse US Sina response (gb_{lowercase}). Field layout (verified):
 *   0  Chinese name      1  price     2  change_pct
 *   3  updated string    4  change    5  open
 *   6  high              7  low      8  52w_high
 *   9  52w_low          10  volume   11  market_cap (USD)
 *  12  EPS              13  PE       ...
 *  25  prev_close
 */
function parseUS(ticker: string, raw: string, p: ParsedSinaTicker): SinaQuote | null {
  const parts = raw.split(',');
  if (parts.length < 26) return null;
  const name = parts[0];
  const price = num(parts[1]);
  if (price === 0) return null;
  const change_pct = num(parts[2]);
  const change = num(parts[4]);
  const open = num(parts[5]) || price;
  const high = num(parts[6]) || price;
  const low = num(parts[7]) || price;
  const volume = num(parts[10]);
  const market_cap = num(parts[11]) || null;
  const pe = num(parts[13]) || null;
  const prev_close = num(parts[25]) || price - change;
  const amplitude = prev_close > 0 ? ((high - low) / prev_close) * 100 : 0;
  return {
    source: 'sina',
    ticker, name, market: p.market, currency: p.currency,
    price, change, change_pct,
    open, high, low, prev_close,
    volume, amount: 0, amplitude,
    market_cap, market_cap_label: formatMarketCap(market_cap, p.market),
    pe_ttm: pe, pb: null, turnover: null, volume_ratio: null,
    updated_at: parts[3] || new Date().toISOString(),
    delayed: true,
  };
}

export async function fetchSinaQuote(ticker: string, timeoutMs = 4000, externalSignal?: AbortSignal): Promise<SinaQuote | null> {
  const p = tickerToSina(ticker);
  if (!p) return null;

  const symbol = `${p.prefix}${p.code}`;
  const url = `https://hq.sinajs.cn/list=${symbol}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([ctrl.signal, externalSignal]) : ctrl.signal;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        // Required: Sina blocks requests without a Referer to finance.sina
        'Referer': 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0 (compatible; StockMonitor/1.0)',
      },
      signal,
      cache: externalSignal ? 'no-store' : undefined,
      next: externalSignal ? undefined : { revalidate: 30 },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) return null;

  // Response is GBK encoded
  const buf = await resp.arrayBuffer();
  const text = iconv.decode(Buffer.from(buf), 'gbk');

  // Format: var hq_str_sh600519="...";
  const match = text.match(/=\s*"([^"]*)"/);
  if (!match || !match[1]) return null;
  const raw = match[1];

  switch (p.market) {
    case 'A':  return parseAShare(ticker, raw, p);
    case 'HK': return parseHK(ticker, raw, p);
    case 'US': return parseUS(ticker, raw, p);
  }
  return null;
}

/** Sina's verified US daily endpoint accepts simple exchange tickers only. */
export function sinaUsKlineSymbol(ticker: string): string | null {
  const upper = ticker.toUpperCase().trim();
  return /^[A-Z][A-Z0-9]{0,9}$/.test(upper) ? upper : null;
}

interface SinaUsDailyRow {
  d?: unknown;
  o?: unknown;
  h?: unknown;
  l?: unknown;
  c?: unknown;
  v?: unknown;
}

export function parseSinaUsKlineJsonp(text: string): SourceKlineBar[] {
  const match = text.match(/var\s+[_$A-Za-z][\w$]*\s*=\s*\((\[[\s\S]*\])\);?\s*$/);
  if (!match) throw new KlineProviderError('protocol', 'Sina US K-line JSONP wrapper changed');

  let rows: unknown;
  try {
    rows = JSON.parse(match[1]);
  } catch {
    throw new KlineProviderError('protocol', 'Sina US K-line payload is invalid JSON');
  }
  if (!Array.isArray(rows)) throw new KlineProviderError('protocol', 'Sina US K-line payload is not an array');

  return rows.map((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new KlineProviderError('protocol', 'Sina US K-line row is not an object');
    }
    const row = value as SinaUsDailyRow;
    return {
      time: String(row.d ?? ''),
      open: Number(row.o),
      high: Number(row.h),
      low: Number(row.l),
      close: Number(row.c),
      volume: Number(row.v),
    };
  });
}

export async function fetchSinaUsKline(
  ticker: string,
  limit: number,
  externalSignal?: AbortSignal,
  timeoutMs = 2500,
): Promise<{ source: 'sina'; bars: SourceKlineBar[]; adjustment: KlineAdjustment; volumeUnit: 'shares' } | null> {
  const symbol = sinaUsKlineSymbol(ticker);
  if (!symbol) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([ctrl.signal, externalSignal]) : ctrl.signal;
  const url = `https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_data=/US_MinKService.getDailyK?symbol=${symbol}`;
  try {
    const response = await fetch(url, {
      headers: {
        Referer: 'https://finance.sina.com.cn/stock/usstock/',
        'User-Agent': 'Mozilla/5.0 (compatible; StockMonitor/1.0)',
      },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      throw new KlineProviderError(
        response.status === 429 ? 'rate_limited' : retryable ? 'transient' : 'protocol',
        `Sina US K-line HTTP ${response.status}`,
        retryable,
        response.status,
      );
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > 2_000_000) throw new KlineProviderError('protocol', 'Sina US K-line payload is too large');
    const text = await response.text();
    if (text.length > 2_000_000) throw new KlineProviderError('protocol', 'Sina US K-line payload is too large');
    const bars = parseSinaUsKlineJsonp(text).slice(-limit);
    return bars.length > 0 ? { source: 'sina', bars, adjustment: 'none', volumeUnit: 'shares' } : null;
  } finally {
    clearTimeout(timer);
  }
}
