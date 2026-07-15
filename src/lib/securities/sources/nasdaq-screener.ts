import { normalizeSecurityTicker } from '../normalize';
import type { SecurityExchange } from '../model';
import { SecuritySourceError } from './tushare-client';

export interface UsScreenerRecord {
  ticker: string;
  name: string;
  exchange: Extract<SecurityExchange, 'NASDAQ' | 'NYSE' | 'AMEX'>;
  market_cap_usd: number | null;
  country_code: string | null;
  sector: string | null;
  industry: string | null;
}

const COUNTRY_CODES: Record<string, string> = {
  china: 'CN',
  'hong kong': 'HK',
  'cayman islands': 'KY',
  'united states': 'US',
  'united states of america': 'US',
};

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function countryCode(value: unknown): string | null {
  const text = nullableText(value);
  if (!text) return null;
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  return COUNTRY_CODES[text.toLocaleLowerCase()] ?? null;
}

function marketCap(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseNasdaqScreener(
  payload: unknown,
  exchange: UsScreenerRecord['exchange'],
): UsScreenerRecord[] {
  if (!payload || typeof payload !== 'object') throw new SecuritySourceError('source_schema', 'nasdaq-screener');
  const data = (payload as { data?: unknown }).data;
  const rows = data && typeof data === 'object' ? (data as { rows?: unknown }).rows : null;
  if (!Array.isArray(rows)) throw new SecuritySourceError('source_schema', 'nasdaq-screener');

  return rows.map((row) => {
    if (!row || typeof row !== 'object') throw new SecuritySourceError('source_schema', 'nasdaq-screener');
    const value = row as Record<string, unknown>;
    for (const field of ['symbol', 'name', 'marketCap', 'country', 'sector', 'industry']) {
      if (!Object.hasOwn(value, field)) throw new SecuritySourceError('source_schema', 'nasdaq-screener');
    }
    const ticker = normalizeSecurityTicker(String(value.symbol ?? ''), 'US');
    const name = nullableText(value.name);
    if (!ticker || !name) throw new SecuritySourceError('source_schema', 'nasdaq-screener');
    return {
      ticker,
      name,
      exchange,
      market_cap_usd: marketCap(value.marketCap),
      country_code: countryCode(value.country),
      sector: nullableText(value.sector),
      industry: nullableText(value.industry),
    };
  });
}
