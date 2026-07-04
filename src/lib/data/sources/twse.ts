/**
 * TWSE / TPEx (台湾证交所 / 柜买中心) free official data source.
 *
 * Endpoints:
 *   Quotes (realtime, both boards):
 *     GET https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_2330.tw|otc_5483.tw&json=1&delay=0
 *     Rate limit ~3 req / 5 s → mitigated by (a) native multi-symbol batching
 *     via '|' and (b) a module-level 60 s in-memory cache.
 *   Daily kline (listed .TW only):
 *     GET https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=YYYYMM01&stockNo=2330&response=json
 *   Company universe (for search):
 *     GET https://openapi.twse.com.tw/v1/opendata/t187ap03_L        (上市)
 *     GET https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O     (上柜)
 *
 * ⚠️ TWSE quirks (locked by twse.test.ts):
 *   - ALL numeric fields arrive as comma-separated STRINGS ("1,085.00").
 *   - STOCK_DAY dates are ROC (民国) calendar: "115/07/06" → 2026-07-06 (+1911).
 *   - mis `z` (last price) is "-" before the first trade of the day.
 *
 * Ticker suffix convention (matches EODHD/Yahoo): .TW = TWSE 上市, .TWO = TPEx 上柜.
 */

import { unstable_cache } from 'next/cache';
import type { Market } from '@/lib/supabase/database.types';
import type { UniverseRow } from '@/lib/data/mock';

export interface TwseQuote {
  source: 'twse';
  ticker: string;
  name: string;
  market: Market;          // always 'TW'
  currency: string;        // always 'NT$'
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume: number;          // 股 (mis `v` is 張=1000 股; converted here)
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

export interface TwseDailyBar {
  date: string;   // ISO YYYY-MM-DD (converted from ROC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 股
}

// ─── Pure helpers (unit-tested with inline fixtures — no network) ───

/** '2330.TW' → 'tse_2330.tw'; '5483.TWO' → 'otc_5483.tw'; other → null. */
export function twseExCh(ticker: string): string | null {
  const m = ticker.toUpperCase().match(/^([0-9A-Z]+)\.(TW|TWO)$/);
  if (!m) return null;
  const board = m[2] === 'TW' ? 'tse' : 'otc';
  return `${board}_${m[1].toLowerCase()}.tw`;
}

/** Coerce TWSE comma-separated numeric string; '-' / '' / undefined → null. */
function num(s: string | undefined): number | null {
  if (s === undefined || s === null) return null;
  const cleaned = String(s).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

interface MisMsg { [key: string]: string | undefined }

/**
 * Parse one msgArray entry from mis getStockInfo.
 * Fields: c=code n=name z=last y=prev_close o=open h=high l=low
 *         v=accumulated volume (張) d=date(YYYYMMDD) t=time(HH:mm:ss)
 * Returns null when there is no trade yet (z === '-').
 */
export function parseMisQuote(msg: MisMsg, ticker: string): TwseQuote | null {
  const price = num(msg.z);
  const prev_close = num(msg.y);
  if (price === null || prev_close === null) return null;

  const open = num(msg.o) ?? price;
  const high = num(msg.h) ?? price;
  const low = num(msg.l) ?? price;
  const volLots = num(msg.v) ?? 0;
  const change = price - prev_close;
  const change_pct = prev_close > 0 ? (change / prev_close) * 100 : 0;
  const amplitude = prev_close > 0 ? ((high - low) / prev_close) * 100 : 0;
  const d = msg.d || '';
  const t = msg.t || '00:00:00';
  const updated_at = /^\d{8}$/.test(d)
    ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t}+08:00`
    : new Date().toISOString();

  return {
    source: 'twse',
    ticker,
    name: msg.n || ticker,
    market: 'TW',
    currency: 'NT$',
    price, change, change_pct,
    open, high, low, prev_close,
    volume: volLots * 1000, // 張 → 股
    amount: 0,
    amplitude,
    market_cap: null,
    market_cap_label: '—',
    pe_ttm: null, pb: null, turnover: null, volume_ratio: null,
    updated_at,
    delayed: false,
  };
}

/**
 * Parse TWSE STOCK_DAY `data` rows. Row layout:
 *   [0]日期(ROC 115/07/06) [1]成交股數 [2]成交金額 [3]開盤價 [4]最高價
 *   [5]最低價 [6]收盤價 [7]漲跌價差 [8]成交筆數
 * ROC year + 1911 = Gregorian. Rows with unparsable prices are dropped.
 */
export function parseStockDayBars(rows: string[][]): TwseDailyBar[] {
  const bars: TwseDailyBar[] = [];
  for (const row of rows) {
    if (!row || row.length < 7) continue;
    const dm = String(row[0]).trim().match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
    if (!dm) continue;
    const year = Number(dm[1]) + 1911;
    const date = `${year}-${dm[2]}-${dm[3]}`;
    const open = num(row[3]);
    const high = num(row[4]);
    const low = num(row[5]);
    const close = num(row[6]);
    if (open === null || high === null || low === null || close === null) continue;
    bars.push({ date, open, high, low, close, volume: num(row[1]) ?? 0 });
  }
  return bars;
}

/** ISO week key (YYYY-Www) for a YYYY-MM-DD date string. */
function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  // ISO: shift to the Thursday of the current week, then read its ISO year/week
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Aggregate daily bars into ISO weeks ('W') or calendar months ('M').
 * Assumes input sorted ascending by date; each output bar carries the
 * LAST daily bar's date of its bucket (matches Eastmoney convention).
 */
export function aggregateBars(bars: TwseDailyBar[], period: 'W' | 'M'): TwseDailyBar[] {
  const out: TwseDailyBar[] = [];
  let currentKey: string | null = null;
  for (const b of bars) {
    const key = period === 'W' ? isoWeekKey(b.date) : b.date.slice(0, 7);
    if (key !== currentKey) {
      out.push({ ...b });
      currentKey = key;
    } else {
      const agg = out[out.length - 1];
      agg.date = b.date;
      agg.high = Math.max(agg.high, b.high);
      agg.low = Math.min(agg.low, b.low);
      agg.close = b.close;
      agg.volume += b.volume;
    }
  }
  return out;
}

// ─── Network layer ───

const MIS_REFERER = 'https://mis.twse.com.tw/stock/index.jsp';
const UA = 'Mozilla/5.0 (compatible; StockMonitor/1.0)';

async function fetchWithTimeout(url: string, referer: string, timeoutMs = 4000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'Referer': referer, 'User-Agent': UA },
      signal: ctrl.signal,
      next: { revalidate: 30 },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Module-level quote cache: mis is rate-limited (~3 req/5 s), so repeat
// requests within 60 s are served from memory with zero new connections.
const quoteCache = new Map<string, { q: TwseQuote; at: number }>();
const QUOTE_TTL_MS = 60_000;

/**
 * Fetch quotes for a set of TW/TWO tickers in ONE mis request ('|'-joined).
 * Cache hits skip the network entirely; only cache misses are requested.
 */
export async function fetchTwseQuotesBatch(tickers: string[]): Promise<Map<string, TwseQuote | null>> {
  const result = new Map<string, TwseQuote | null>();
  const now = Date.now();
  const misses: string[] = [];

  for (const t of tickers) {
    const cached = quoteCache.get(t);
    if (cached && now - cached.at < QUOTE_TTL_MS) {
      result.set(t, cached.q);
    } else if (twseExCh(t)) {
      misses.push(t);
    } else {
      result.set(t, null); // not a TW ticker
    }
  }
  if (misses.length === 0) return result;

  const exChs = misses.map((t) => twseExCh(t)!);
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exChs.join('|')}&json=1&delay=0`;
  const resp = await fetchWithTimeout(url, MIS_REFERER);
  if (!resp || !resp.ok) {
    for (const t of misses) result.set(t, null);
    return result;
  }

  let msgArray: MisMsg[] = [];
  try {
    const json = await resp.json();
    msgArray = Array.isArray(json?.msgArray) ? json.msgArray : [];
  } catch {
    for (const t of misses) result.set(t, null);
    return result;
  }

  // Map responses back by board+code — mis echoes the board in `ex`
  // ('tse'|'otc'); keying on bare code would let a TSE and a TPEx listing
  // sharing the same numeric code clobber each other (ranges not disjoint).
  const byKey = new Map<string, MisMsg>();
  for (const m of msgArray) {
    if (!m.c) continue;
    const code = String(m.c).toUpperCase();
    byKey.set(m.ex ? `${String(m.ex).toLowerCase()}_${code}` : code, m);
  }
  for (const t of misses) {
    const [board, codePart] = twseExCh(t)!.split('_'); // 'tse_2330.tw'
    const code = codePart.replace(/\.tw$/i, '').toUpperCase();
    const msg = byKey.get(`${board}_${code}`) ?? byKey.get(code);
    const q = msg ? parseMisQuote(msg, t) : null;
    if (q) quoteCache.set(t, { q, at: Date.now() });
    result.set(t, q);
  }
  return result;
}

export async function fetchTwseQuote(ticker: string): Promise<TwseQuote | null> {
  const map = await fetchTwseQuotesBatch([ticker]);
  return map.get(ticker) ?? null;
}

// ─── Daily kline (TWSE 上市 .TW only; TPEx 上柜 K 线本期不做) ───

const MAX_KLINE_MONTHS = 8;
const KLINE_MONTH_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchTwseKline(
  ticker: string,
  period: 'D' | 'W' | 'M' = 'D',
  limit = 120
): Promise<{ source: 'twse'; bars: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }> } | null> {
  const m = ticker.toUpperCase().match(/^(\d{4,6})\.TW$/); // .TWO not supported this phase
  if (!m) return null;
  const stockNo = m[1];

  const all: TwseDailyBar[] = [];
  const cursor = new Date();
  for (let i = 0; i < MAX_KLINE_MONTHS; i++) {
    const yyyymm = `${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${yyyymm}01&stockNo=${stockNo}&response=json`;
    const resp = await fetchWithTimeout(url, 'https://www.twse.com.tw/', 6000);
    if (resp && resp.ok) {
      try {
        const json = await resp.json();
        if (json?.stat === 'OK' && Array.isArray(json.data)) {
          all.unshift(...parseStockDayBars(json.data)); // months fetched newest→oldest
        }
      } catch { /* skip month on parse failure */ }
    }
    if (all.length >= limit && period === 'D') break;
    // For W/M we still cap at MAX_KLINE_MONTHS of daily data.
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - 1);
    if (i < MAX_KLINE_MONTHS - 1) await sleep(KLINE_MONTH_DELAY_MS); // 防限流
  }

  if (all.length === 0) return null;
  all.sort((a, b) => (a.date < b.date ? -1 : 1));
  const bars = (period === 'D' ? all : aggregateBars(all, period)).slice(-limit);
  return {
    source: 'twse',
    bars: bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
  };
}

// ─── Company universe (search) ───

async function fetchUniverseEndpoint(url: string, suffix: '.TW' | '.TWO'): Promise<UniverseRow[]> {
  const resp = await fetchWithTimeout(url, 'https://openapi.twse.com.tw/', 8000);
  if (!resp || !resp.ok) return [];
  let rows: any[] = [];
  try {
    const json = await resp.json();
    rows = Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
  const out: UniverseRow[] = [];
  for (const r of rows) {
    const code = String(r['公司代號'] ?? r['SecuritiesCompanyCode'] ?? '').trim();
    const name = String(r['公司簡稱'] ?? r['CompanyAbbreviation'] ?? r['公司名稱'] ?? '').trim();
    if (!/^\d{4,6}$/.test(code) || !name) continue;
    out.push({ t: `${code}${suffix}`, n: name, py: '', m: 'TW' });
  }
  return out;
}

/**
 * Listed (.TW) + OTC (.TWO) company registry for search. Cached 24 h via
 * unstable_cache; a failing endpoint degrades to the other's results
 * instead of failing the whole universe.
 */
export const fetchTwseUniverse = unstable_cache(
  async (): Promise<UniverseRow[]> => {
    const [listed, otc] = await Promise.all([
      fetchUniverseEndpoint('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', '.TW').catch(() => []),
      fetchUniverseEndpoint('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', '.TWO').catch(() => []),
    ]);
    return [...listed, ...otc];
  },
  ['twse-universe'],
  { revalidate: 86400 }
);
