import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { NormalizedMembership, NormalizedSecurity, SecuritySnapshot } from '../model';
import { fetchNasdaqDirectory, type UsDirectoryIdentity } from './nasdaq-directory';
import { fetchNasdaqScreener, type UsScreenerRecord } from './nasdaq-screener';
import { SecuritySourceError, sourceTimestamp } from './tushare-client';

export interface UsUniverseCandidate {
  security: NormalizedSecurity;
  market_cap_usd: number | null;
}

export interface ReviewedUsChinaOverride {
  ticker: string;
  reason: string;
  source_url: string;
  reviewed_at: string;
  reviewer: string;
}

export interface UsChinaOverrides {
  schema_version: 1;
  includes: ReviewedUsChinaOverride[];
  excludes: ReviewedUsChinaOverride[];
}

const NON_EQUITY_NAME = /\b(warrants?|rights?|units?|preferred|preference|notes?|bonds?|etfs?|etns?)\b/i;

export function normalizeUsSymbol(value: string): string | null {
  return normalizeSecurityTicker(value, 'US');
}

function isApprovedEquityName(name: string): boolean {
  return !NON_EQUITY_NAME.test(name);
}

function isAdr(name: string): boolean {
  return /\b(american depositary|depositary shares?|adr|ads)\b/i.test(name);
}

export function buildUsCandidates(
  directory: UsDirectoryIdentity[],
  screener: UsScreenerRecord[],
  asOf: string,
): UsUniverseCandidate[] {
  const screenerByTicker = new Map(screener.map((row) => [row.ticker, row]));
  const seen = new Set<string>();
  const candidates: UsUniverseCandidate[] = [];

  for (const identity of directory) {
    if (seen.has(identity.ticker) || !isApprovedEquityName(identity.name)) continue;
    const quote = screenerByTicker.get(identity.ticker);
    if (!quote || quote.exchange !== identity.exchange || !isApprovedEquityName(quote.name)) continue;
    seen.add(identity.ticker);
    const adr = isAdr(identity.name) || isAdr(quote.name);
    candidates.push({
      security: {
        ticker: identity.ticker,
        symbol: identity.ticker,
        name: quote.name,
        name_en: quote.name,
        full_name: identity.name,
        pinyin: null,
        market: 'US',
        exchange: identity.exchange,
        asset_type: 'stock',
        fund_subtype: null,
        instrument_form: adr ? 'adr' : 'common_stock',
        currency: 'USD',
        country_code: quote.country_code,
        industry: quote.industry,
        list_status: 'listed',
        list_date: null,
        delist_date: null,
        is_active: true,
        source: 'nasdaq',
        source_updated_at: sourceTimestamp(asOf),
        metadata: { sector: quote.sector, raw_symbol: identity.rawSymbol },
      },
      market_cap_usd: quote.market_cap_usd,
    });
  }

  return candidates.sort((a, b) => a.security.ticker.localeCompare(b.security.ticker));
}

export function selectNasdaqTop500(
  candidates: UsUniverseCandidate[],
  asOf: string,
): NormalizedMembership[] {
  const selected = candidates
    .filter((row) => row.security.is_active
      && row.security.exchange === 'NASDAQ'
      && row.security.asset_type === 'stock'
      && (row.security.instrument_form === 'common_stock' || row.security.instrument_form === 'adr')
      && row.market_cap_usd !== null
      && Number.isFinite(row.market_cap_usd)
      && row.market_cap_usd > 0)
    .sort((a, b) => (b.market_cap_usd! - a.market_cap_usd!) || a.security.ticker.localeCompare(b.security.ticker))
    .slice(0, 500);

  if (selected.length !== 500) throw new SecuritySourceError('source_schema', 'nasdaq-top500');
  return selected.map((row, index) => ({
    ticker: row.security.ticker,
    universe: 'nasdaq_top500',
    rank: index + 1,
    market_cap_usd: row.market_cap_usd,
    as_of_date: asOf,
    is_active: true,
    source: 'nasdaq',
  }));
}

function validateOverrides(overrides: UsChinaOverrides): void {
  if (overrides.schema_version !== 1) throw new SecuritySourceError('source_schema', 'us-china-overrides');
  for (const entry of [...overrides.includes, ...overrides.excludes]) {
    if (!normalizeUsSymbol(entry.ticker)
      || !entry.reason.trim()
      || !entry.reviewer.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed_at)) {
      throw new SecuritySourceError('source_schema', 'us-china-overrides');
    }
    try {
      const url = new URL(entry.source_url);
      if (url.protocol !== 'https:') throw new Error('not https');
    } catch {
      throw new SecuritySourceError('source_schema', 'us-china-overrides');
    }
  }
}

export function selectUsChina(
  candidates: UsUniverseCandidate[],
  overrides: UsChinaOverrides,
  asOf: string,
): NormalizedMembership[] {
  validateOverrides(overrides);
  const includes = new Set(overrides.includes.map((entry) => normalizeUsSymbol(entry.ticker)!));
  const excludes = new Set(overrides.excludes.map((entry) => normalizeUsSymbol(entry.ticker)!));

  return candidates
    .filter((row) => row.security.is_active
      && row.security.asset_type === 'stock'
      && ['NASDAQ', 'NYSE', 'AMEX'].includes(row.security.exchange)
      && (row.security.country_code === 'CN' || row.security.country_code === 'HK' || includes.has(row.security.ticker))
      && !excludes.has(row.security.ticker))
    .sort((a, b) => a.security.ticker.localeCompare(b.security.ticker))
    .map((row) => ({
      ticker: row.security.ticker,
      universe: 'us_china',
      rank: null,
      market_cap_usd: row.market_cap_usd,
      as_of_date: asOf,
      is_active: true,
      source: 'nasdaq',
    }));
}

export function buildUsUniverseSnapshot(
  scope: 'nasdaq_top500' | 'us_china',
  candidates: UsUniverseCandidate[],
  memberships: NormalizedMembership[],
  asOf: string,
): SecuritySnapshot {
  const selected = new Set(memberships.map((row) => row.ticker));
  const securities = candidates.filter((row) => selected.has(row.security.ticker)).map((row) => row.security);
  return {
    source: 'nasdaq',
    scope,
    asOf,
    securities,
    aliases: securities.flatMap((security) => buildAliases({ ...security, source: 'nasdaq' })),
    memberships,
  };
}

export async function fetchUsUniverseCandidates(
  asOf: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UsUniverseCandidate[]> {
  const [nasdaqDirectory, otherDirectory, nasdaqRows, nyseRows, amexRows] = await Promise.all([
    fetchNasdaqDirectory('nasdaq', fetchImpl),
    fetchNasdaqDirectory('other', fetchImpl),
    fetchNasdaqScreener('NASDAQ', fetchImpl),
    fetchNasdaqScreener('NYSE', fetchImpl),
    fetchNasdaqScreener('AMEX', fetchImpl),
  ]);
  return buildUsCandidates(
    [...nasdaqDirectory, ...otherDirectory],
    [...nasdaqRows, ...nyseRows, ...amexRows],
    asOf,
  );
}
