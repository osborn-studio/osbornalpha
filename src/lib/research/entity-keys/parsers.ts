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
    if (typeof r?.ticker !== 'string' || typeof r.title !== 'string' || (typeof r.cik_str !== 'number' && typeof r.cik_str !== 'string')) fail('invalid_schema');
    byTicker.set(r.ticker.toUpperCase(), { cik: normalizeCik(r.cik_str), title: r.title });
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
