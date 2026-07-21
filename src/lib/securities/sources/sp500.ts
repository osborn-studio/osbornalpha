import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { NormalizedSecurity, SecuritySnapshot } from '../model';
import { SecuritySourceError } from './tushare-client';

interface Sp500Constituent {
  ticker: string;
  name: string;
  exchange?: 'NASDAQ' | 'NYSE' | 'AMEX';
}

interface Sp500Payload {
  source_date: string;
  checksum: string;
  source_url?: string;
  constituents: Sp500Constituent[];
}

export interface Sp500Options {
  url?: string;
  storagePath?: string;
  approvedHosts?: string[];
  fetchImpl?: typeof fetch;
  storageLoader?: (path: string) => Promise<unknown>;
}

function parsePayload(value: unknown): Sp500Payload {
  if (!value || typeof value !== 'object') throw new SecuritySourceError('source_schema', 'sp500');
  const payload = value as Partial<Sp500Payload>;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.source_date ?? '')
    || !/^[a-f0-9]{64}$/i.test(payload.checksum ?? '')
    || !Array.isArray(payload.constituents)
    || payload.constituents.length < 490
    || payload.constituents.length > 510) {
    throw new SecuritySourceError('source_schema', 'sp500');
  }
  return payload as Sp500Payload;
}

async function loadPayload(options: Sp500Options): Promise<unknown> {
  const urlValue = options.url ?? process.env.SP500_CONSTITUENTS_URL;
  const storagePath = options.storagePath ?? process.env.SP500_CONSTITUENTS_STORAGE_PATH;
  if (!urlValue && !storagePath) {
    throw new SecuritySourceError('source_authorization_required', 'sp500');
  }
  if (storagePath) {
    if (!options.storageLoader) throw new SecuritySourceError('source_authorization_required', 'sp500');
    return options.storageLoader(storagePath);
  }

  let url: URL;
  try {
    url = new URL(urlValue!);
  } catch {
    throw new SecuritySourceError('source_authorization_required', 'sp500');
  }
  const approved = new Set([
    'www.spglobal.com',
    ...(process.env.SP500_APPROVED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean),
    ...(options.approvedHosts ?? []),
  ]);
  if (url.protocol !== 'https:' || !approved.has(url.hostname)) {
    throw new SecuritySourceError('source_authorization_required', 'sp500');
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, { redirect: 'manual' });
  } catch {
    throw new SecuritySourceError('source_http', 'sp500');
  }
  if (!response.ok || response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new SecuritySourceError('source_http', 'sp500');
  }
  try {
    return await response.json();
  } catch {
    throw new SecuritySourceError('source_schema', 'sp500');
  }
}

export async function fetchSp500Snapshot(options: Sp500Options): Promise<SecuritySnapshot> {
  const payload = parsePayload(await loadPayload(options));
  const seen = new Set<string>();
  const securities = payload.constituents.map((constituent): NormalizedSecurity => {
    const ticker = normalizeSecurityTicker(constituent.ticker, 'US');
    if (!ticker || !constituent.name?.trim() || seen.has(ticker)) {
      throw new SecuritySourceError('source_schema', 'sp500');
    }
    seen.add(ticker);
    const exchange = constituent.exchange ?? 'NYSE';
    return {
      ticker,
      symbol: ticker,
      name: constituent.name.trim(),
      name_en: constituent.name.trim(),
      full_name: null,
      pinyin: null,
      market: 'US',
      exchange,
      asset_type: 'stock',
      fund_subtype: null,
      instrument_form: 'common_stock',
      currency: 'USD',
      country_code: 'US',
      industry: null,
      list_status: 'listed',
      list_date: null,
      delist_date: null,
      is_active: true,
      source: 'sp-global',
      source_updated_at: `${payload.source_date}T00:00:00.000Z`,
      metadata: { snapshot_checksum: payload.checksum, source_url: payload.source_url ?? null },
    };
  }).sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    source: 'sp-global',
    scope: 'sp500',
    asOf: payload.source_date,
    securities,
    aliases: securities.flatMap((security) => buildAliases({ ...security, source: 'sp-global' })),
    memberships: securities.map((security) => ({
      ticker: security.ticker,
      universe: 'sp500',
      rank: null,
      market_cap_usd: null,
      as_of_date: payload.source_date,
      is_active: true,
      source: 'sp-global',
    })),
  };
}
