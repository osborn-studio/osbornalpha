/**
 * 腾讯财经 (qt.gtimg.cn) free quote source — third-tier fallback.
 *
 * Endpoint:  http://qt.gtimg.cn/q={prefix}{code}[,{prefix}{code}...]
 * No auth, no quota, also GBK-encoded.
 *
 * Prefix → market:
 *   sh / sz  → A-share
 *   bj       → 北交所
 *   hk       → 港股
 *   us       → 美股 (uppercase ticker)
 *
 * Sample response (sh600519):
 *   v_sh600519="1~贵州茅台~600519~1573.00~1582.30~1573.50~..."
 *
 * Field index (A-share, verified):
 *    1  name
 *    2  code
 *    3  price
 *    4  prev_close
 *    5  open
 *    6  volume(手, 100股)
 *    ...
 *   31  change
 *   32  change_pct
 *   33  high (intraday)
 *   34  low
 *   ...
 *   45  market_cap (亿元)
 *   53  pe_ttm
 *   46  pb
 *
 * For HK/US the layout is similar but indices differ. We extract a
 * minimal subset (name, price, change_pct, OHLC) which is enough to
 * survive a card render. Fundamentals come from Tushare anyway.
 */

import iconv from 'iconv-lite';
import type { Market } from '@/lib/supabase/database.types';
import { KlineProviderError, type KlineAdjustment, type SourceKlineBar } from '@/lib/data/kline/types';

export interface TencentQuote {
  source: 'tencent';
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

interface ParsedTencent {
  prefix: string;
  code: string;
  market: Market;
  currency: string;
}

function tickerToTencent(ticker: string): ParsedTencent | null {
  if (!ticker) return null;
  const upper = ticker.toUpperCase().trim();

  const a = upper.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  if (a) {
    return {
      prefix: a[2].toLowerCase(),
      code: a[1],
      market: 'A',
      currency: '¥',
    };
  }

  const hk = upper.match(/^(\d{5})\.HK$/);
  if (hk) {
    return {
      prefix: 'hk',
      code: hk[1],
      market: 'HK',
      currency: 'HK$',
    };
  }

  if (/^[A-Z][A-Z.]{0,9}$/.test(upper)) {
    return {
      prefix: 'us',
      code: upper,
      market: 'US',
      currency: '$',
    };
  }

  return null;
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function formatMarketCap(yi: number | null, market: Market): string {
  if (yi === null || yi === 0) return '—';
  const symbol = market === 'A' ? '¥' : market === 'HK' ? 'HK$' : '$';
  if (yi >= 10000) return `${symbol}${(yi / 10000).toFixed(2)}万亿`;
  if (yi >= 1) return `${symbol}${yi.toFixed(0)}亿`;
  return `${symbol}${(yi * 1e8).toFixed(0)}`;
}

/**
 * Parse Tencent response into a TencentQuote. The endpoint returns a
 * tilde-separated payload; field indices are stable for the basic price
 * fields across A/HK/US.
 */
function parsePayload(ticker: string, raw: string, p: ParsedTencent): TencentQuote | null {
  const f = raw.split('~');
  if (f.length < 35) return null;
  const name = f[1] || ticker;
  const price = num(f[3]);
  if (price === 0) return null;
  const prev_close = num(f[4]) || price;
  const open = num(f[5]) || price;
  const volume = num(f[6]) * (p.market === 'A' ? 100 : 1);  // 手 → 股 for A
  const change = num(f[31]) || price - prev_close;
  const change_pct = num(f[32]) || (prev_close > 0 ? (change / prev_close) * 100 : 0);
  const high = num(f[33]) || price;
  const low = num(f[34]) || price;
  const amount = num(f[37]) || 0;             // 万元 in some markets
  const market_cap_yi = num(f[45]) || null;   // 亿元
  const market_cap = market_cap_yi ? market_cap_yi * 1e8 : null;
  const pb = num(f[46]) || null;
  const pe_ttm = num(f[53]) || null;
  const amplitude = prev_close > 0 ? ((high - low) / prev_close) * 100 : 0;
  const ts = f[30] || '';
  // Date format from Tencent: YYYYMMDDHHMMSS
  const updated_at = /^\d{14}$/.test(ts)
    ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}+08:00`
    : new Date().toISOString();
  return {
    source: 'tencent',
    ticker, name, market: p.market, currency: p.currency,
    price, change, change_pct,
    open, high, low, prev_close,
    volume, amount, amplitude,
    market_cap, market_cap_label: formatMarketCap(market_cap_yi, p.market),
    pe_ttm, pb, turnover: null, volume_ratio: null,
    updated_at, delayed: true,
  };
}

export async function fetchTencentQuote(ticker: string, timeoutMs = 4000, externalSignal?: AbortSignal): Promise<TencentQuote | null> {
  const p = tickerToTencent(ticker);
  if (!p) return null;

  const symbol = `${p.prefix}${p.code}`;
  const url = `http://qt.gtimg.cn/q=${symbol}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([ctrl.signal, externalSignal]) : ctrl.signal;

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        'Referer': 'https://stockapp.finance.qq.com/',
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

  const buf = await resp.arrayBuffer();
  const text = iconv.decode(Buffer.from(buf), 'gbk');
  const match = text.match(/=\s*"([^"]*)"/);
  if (!match || !match[1]) return null;
  return parsePayload(ticker, match[1], p);
}

interface TencentKlineTarget {
  symbol: string;
  adjustment: Extract<KlineAdjustment, 'qfq' | 'none'>;
  dataKey: 'qfqday' | 'day';
  mode: 'qfq' | 'bfq';
  volumeMultiplier: 1 | 100;
}

/**
 * Verified historical coverage:
 * - Shanghai/Shenzhen A-shares: qfqday (front-adjusted)
 * - Hong Kong: day (unadjusted)
 * Tencent's public endpoint currently returns only two sentinel rows for US
 * symbols, so US is intentionally unsupported here and uses Sina instead.
 */
export function tencentKlineTarget(
  ticker: string,
  adjustment: Extract<KlineAdjustment, 'qfq' | 'none'>,
): TencentKlineTarget | null {
  const upper = ticker.toUpperCase().trim();
  const a = upper.match(/^(\d{6})\.(SH|SZ)$/);
  if (a && adjustment === 'qfq') {
    return { symbol: `${a[2].toLowerCase()}${a[1]}`, adjustment, dataKey: 'qfqday', mode: 'qfq', volumeMultiplier: 100 };
  }
  const hk = upper.match(/^(\d{5})\.HK$/);
  if (hk && adjustment === 'none') {
    return { symbol: `hk${hk[1]}`, adjustment, dataKey: 'day', mode: 'bfq', volumeMultiplier: 1 };
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseTencentKlineResponse(
  payload: unknown,
  target: TencentKlineTarget,
): SourceKlineBar[] {
  const root = objectValue(payload);
  if (!root || root.code !== 0) {
    throw new KlineProviderError('protocol', 'Tencent K-line response reported an error');
  }
  const data = objectValue(root.data);
  const node = data ? objectValue(data[target.symbol]) : null;
  if (!node || !Array.isArray(node[target.dataKey])) {
    throw new KlineProviderError('protocol', `Tencent K-line response is missing ${target.dataKey}`);
  }

  const bars: SourceKlineBar[] = [];
  for (const row of node[target.dataKey] as unknown[]) {
    if (!Array.isArray(row) || row.length < 6) {
      throw new KlineProviderError('protocol', 'Tencent K-line row schema changed');
    }
    const time = String(row[0] ?? '');
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = Number(row[3]);
    const low = Number(row[4]);
    const volume = Number(row[5]) * target.volumeMultiplier;
    bars.push({ time, open, high, low, close, volume });
  }
  return bars;
}

export async function fetchTencentKline(
  ticker: string,
  limit: number,
  adjustment: Extract<KlineAdjustment, 'qfq' | 'none'>,
  externalSignal?: AbortSignal,
  timeoutMs = 2500,
): Promise<{ source: 'tencent'; bars: SourceKlineBar[]; adjustment: KlineAdjustment; volumeUnit: 'shares' } | null> {
  const target = tencentKlineTarget(ticker, adjustment);
  if (!target) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([ctrl.signal, externalSignal]) : ctrl.signal;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${target.symbol},day,,,${limit},${target.mode}`;
  try {
    const response = await fetch(url, {
      headers: {
        Referer: 'https://gu.qq.com/',
        'User-Agent': 'Mozilla/5.0 (compatible; StockMonitor/1.0)',
      },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      throw new KlineProviderError(
        response.status === 429 ? 'rate_limited' : retryable ? 'transient' : 'protocol',
        `Tencent K-line HTTP ${response.status}`,
        retryable,
        response.status,
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new KlineProviderError('protocol', 'Tencent K-line response is not JSON');
    }
    const bars = parseTencentKlineResponse(payload, target);
    return bars.length > 0 ? { source: 'tencent', bars, adjustment, volumeUnit: 'shares' } : null;
  } finally {
    clearTimeout(timer);
  }
}
