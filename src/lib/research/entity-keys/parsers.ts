/**
 * WP-A2 parsers for the two public identifier sources. Pure functions over
 * already-downloaded content; nothing here touches the network or the database.
 */
import { fail } from '../ingest/pa-v1/json.js';
import { normalizeCik } from './identifiers';

export interface SecTickerHit { cik: string; title: string }
export interface SecTickerResult { found: Record<string, SecTickerHit>; missing: string[] }

/** SEC `company_tickers.json`: an object of {cik_str, ticker, title} rows keyed by index. */
export function parseSecCompanyTickers(json: string, tickers: string[]): SecTickerResult {
  let doc: unknown;
  try { doc = JSON.parse(json); } catch { fail('invalid_schema'); }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) fail('invalid_schema');
  const byTicker = new Map<string, SecTickerHit>();
  for (const row of Object.values(doc as Record<string, unknown>)) {
    const r = row as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    const ticker = r?.ticker, title = r?.title, cik = r?.cik_str;
    if (typeof ticker !== 'string' || typeof title !== 'string' || (typeof cik !== 'number' && typeof cik !== 'string')) { fail('invalid_schema'); continue; }
    byTicker.set(ticker.toUpperCase(), { cik: normalizeCik(cik), title });
  }
  const found: Record<string, SecTickerHit> = {}, missing: string[] = [];
  for (const t of tickers) {
    const hit = byTicker.get(t.toUpperCase());
    if (hit) found[t] = hit; else missing.push(t);
  }
  return { found, missing };
}

export interface IsinLeiResult { found: Record<string, string[]>; missing: string[] }

/** GLEIF ISIN↔LEI mapping (`LEI,ISIN` CSV), consumed line by line so the ~300 MB file never sits in memory. */
export function selectIsinsForLeis(lines: Iterable<string>, leis: Set<string>): IsinLeiResult {
  const found: Record<string, string[]> = {};
  let first = true;
  for (const raw of lines) {
    const line = raw.replace(/\r?\n$/, '');
    if (first) { first = false; if (line !== 'LEI,ISIN') fail('invalid_schema'); continue; }
    if (line === '') continue;
    const comma = line.indexOf(',');
    if (comma < 0) fail('invalid_schema');
    const lei = line.slice(0, comma), isin = line.slice(comma + 1);
    if (leis.has(lei)) (found[lei] ??= []).push(isin);
  }
  if (first) fail('invalid_schema');
  return { found, missing: [...leis].filter(l => !found[l]) };
}

export interface SecExchangeRow { cik: string; name: string; ticker: string; exchange: string }
export interface SecExchangeParse {
  rows: SecExchangeRow[];
  rejected: { index: number; reason: 'invalid_cik' | 'missing_ticker' | 'missing_name' }[];
}

/** A CIK that normalizeCik accepts (1–10 digits, not zero; number or digit string), unpadded. */
function secExchangeCik(v: unknown): string | null {
  try { return normalizeCik(v); } catch { return null; }
}

/** Upper bounds checked before the JSON is parsed / the plan is built. */
export const MAX_SEC_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SEC_ROWS = 100_000;

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * SEC `company_tickers_exchange.json`: `{fields:[...], data:[[...], ...]}` with at least
 * cik/name/ticker/exchange columns. Malformed rows are listed in `rejected`, never coerced.
 * Throws file_too_large above MAX_SEC_FILE_BYTES (before parsing) and too_many_rows above MAX_SEC_ROWS.
 */
export function parseSecCompanyTickersExchange(json: string): SecExchangeParse {
  if (json.length > MAX_SEC_FILE_BYTES || Buffer.byteLength(json, 'utf8') > MAX_SEC_FILE_BYTES) throw new Error('file_too_large');
  let doc: unknown;
  try { doc = JSON.parse(json); } catch { throw new Error('invalid_sec_exchange_file'); }
  const d = doc as { fields?: unknown; data?: unknown } | null;
  if (typeof d !== 'object' || d === null || !Array.isArray(d.fields) || !Array.isArray(d.data)) throw new Error('invalid_sec_exchange_file');
  const fields = d.fields as unknown[];
  const col = (name: string) => fields.indexOf(name);
  const [ci, ni, ti, ei] = ['cik', 'name', 'ticker', 'exchange'].map(col);
  if (ci < 0 || ni < 0 || ti < 0 || ei < 0) throw new Error('invalid_sec_exchange_file');
  if (d.data.length > MAX_SEC_ROWS) throw new Error('too_many_rows');
  const out: SecExchangeParse = { rows: [], rejected: [] };
  (d.data as unknown[]).forEach((raw, index) => {
    const r = Array.isArray(raw) ? raw : [];
    const cik = secExchangeCik(r[ci]);
    if (cik === null) { out.rejected.push({ index, reason: 'invalid_cik' }); return; }
    const ticker = nonEmpty(r[ti]);
    if (ticker === null) { out.rejected.push({ index, reason: 'missing_ticker' }); return; }
    const name = nonEmpty(r[ni]);
    if (name === null) { out.rejected.push({ index, reason: 'missing_name' }); return; }
    const exchange = typeof r[ei] === 'string' ? (r[ei] as string).trim() : '';
    out.rows.push({ cik, name, ticker, exchange });
  });
  return out;
}
