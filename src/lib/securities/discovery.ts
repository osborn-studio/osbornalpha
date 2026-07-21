import overridesJson from '../../../data/securities/us-china-overrides.json';
import { classifyAssetType } from '@/lib/stocks/asset-type';
import { buildAliases, inferCoreMarket, normalizeSecurityTicker } from './normalize';
import type { NormalizedAlias, NormalizedMembership, NormalizedSecurity, SecuritySnapshot } from './model';
import { fetchConvertibleBondSnapshot } from './sources/tushare-cb';
import { fetchExchangeFundSnapshot } from './sources/tushare-funds';
import { fetchHongKongMainBoardSnapshot } from './sources/tushare-hk';
import { fetchAShareSnapshot } from './sources/tushare-a';
import {
  fetchUsUniverseCandidates,
  selectNasdaqTop500,
  selectUsChina,
  type UsChinaOverrides,
} from './sources/us-universes';

const APPROVED_UNIVERSES = new Set([
  'a_stock', 'a_exchange_fund', 'a_cb', 'hk_main', 'sp500', 'nasdaq_top500', 'us_china',
]);

export interface TrustedResolution {
  ticker: string;
  security: NormalizedSecurity;
  aliases: NormalizedAlias[];
  memberships: NormalizedMembership[];
}

export interface ExternalDiscoveryCandidate {
  ticker: string;
  name: string;
  pinyin: string;
  market: 'A' | 'HK' | 'US';
  asset_type: NormalizedSecurity['asset_type'];
  source: 'eastmoney';
  verification_status: 'external-unverified';
  selectable: false;
}

interface DiscoveryDbClient {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export function validateTrustedResolution(
  value: SecuritySnapshot | { securities: NormalizedSecurity[]; aliases: NormalizedAlias[]; memberships: NormalizedMembership[] },
  expectedTicker: string,
): TrustedResolution {
  if (value.securities.length !== 1 || value.securities[0].ticker !== expectedTicker) {
    throw new Error('Trusted resolution must contain one exact identity.');
  }
  const security = value.securities[0];
  if (!security.is_active || security.list_status !== 'listed'
    || !security.symbol || !security.name || !security.exchange || !security.source
    || !security.instrument_form || !security.currency || !security.source_updated_at) {
    throw new Error('Trusted resolution is missing required identity fields.');
  }
  const memberships = value.memberships.filter((row) => row.ticker === expectedTicker
    && row.is_active && APPROVED_UNIVERSES.has(row.universe));
  if (memberships.length === 0) throw new Error('Trusted resolution requires an approved membership.');
  if (value.aliases.some((alias) => alias.ticker !== expectedTicker)) {
    throw new Error('Trusted resolution contains an invalid alias.');
  }
  return { ticker: expectedTicker, security, aliases: value.aliases, memberships };
}

function isConvertibleBond(symbol: string): boolean {
  return /^(110|111|113|118|123|127|128)/.test(symbol);
}

function isExchangeFund(symbol: string): boolean {
  return /^(15|16|18|50|51|52|56|58)/.test(symbol);
}

export async function resolveTrustedSecurity(query: string, asOf: string): Promise<TrustedResolution | null> {
  const market = inferCoreMarket(query);
  if (!market) return null;
  const ticker = normalizeSecurityTicker(query, market);
  if (!ticker) return null;

  if (market === 'A') {
    const symbol = ticker.slice(0, 6);
    const options = { asOf, tsCode: ticker, timeoutMs: 1400 };
    const snapshot = isConvertibleBond(symbol)
      ? await fetchConvertibleBondSnapshot(options)
      : isExchangeFund(symbol)
        ? await fetchExchangeFundSnapshot(options)
        : await fetchAShareSnapshot(options);
    return snapshot.securities.length ? validateTrustedResolution(snapshot, ticker) : null;
  }

  if (market === 'HK') {
    const snapshot = await fetchHongKongMainBoardSnapshot({ asOf, tsCode: ticker, timeoutMs: 1400 });
    return snapshot.securities.length ? validateTrustedResolution(snapshot, ticker) : null;
  }

  const candidates = await fetchUsUniverseCandidates(asOf);
  const candidate = candidates.find((row) => row.security.ticker === ticker);
  if (!candidate) return null;
  const top = selectNasdaqTop500(candidates, asOf).filter((row) => row.ticker === ticker);
  const china = selectUsChina(candidates, overridesJson as UsChinaOverrides, asOf)
    .filter((row) => row.ticker === ticker);
  const memberships = [...top, ...china];
  if (!memberships.length) return null;
  return validateTrustedResolution({
    securities: [candidate.security],
    aliases: buildAliases({ ...candidate.security, source: 'nasdaq' }),
    memberships,
  }, ticker);
}

function parseEastmoneyResult(item: Record<string, unknown>): ExternalDiscoveryCandidate | null {
  const code = typeof item.Code === 'string' ? item.Code : '';
  const name = typeof item.Name === 'string' ? item.Name : '';
  const quoteId = typeof item.QuoteID === 'string' ? item.QuoteID : '';
  const marketCode = quoteId.split('.')[0];
  const market = marketCode === '0' || marketCode === '1' || marketCode === '90'
    ? 'A' : marketCode === '116' ? 'HK' : ['105', '106', '107'].includes(marketCode) ? 'US' : null;
  if (!market || !code || !name) return null;
  const ticker = normalizeSecurityTicker(code, market);
  if (!ticker) return null;
  return {
    ticker,
    name,
    pinyin: typeof item.PinYin === 'string' ? item.PinYin : '',
    market,
    asset_type: classifyAssetType({
      ticker,
      name,
      securityTypeName: typeof item.SecurityTypeName === 'string' ? item.SecurityTypeName : undefined,
      classify: typeof item.Classify === 'string' ? item.Classify : undefined,
    }),
    source: 'eastmoney',
    verification_status: 'external-unverified',
    selectable: false,
  };
}

export async function discoverExternalCandidate(
  canonicalTicker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalDiscoveryCandidate | null> {
  const url = new URL('https://searchapi.eastmoney.com/api/suggest/get');
  url.searchParams.set('input', canonicalTicker);
  url.searchParams.set('type', '14');
  url.searchParams.set('count', '10');
  const response = await fetchImpl(url, {
    headers: { Referer: 'https://www.eastmoney.com/', 'User-Agent': 'osbornalpha-security-resolver/1.0' },
  });
  if (!response.ok) return null;
  const text = await response.text();
  const match = text.match(/^[^(]+\((.*)\)\s*$/s);
  let payload: unknown;
  try {
    payload = JSON.parse(match?.[1] ?? text);
  } catch {
    return null;
  }
  const data = payload && typeof payload === 'object'
    ? (payload as { QuotationCodeTable?: { Data?: unknown } }).QuotationCodeTable?.Data : null;
  if (!Array.isArray(data)) return null;
  return data
    .map((item) => item && typeof item === 'object' ? parseEastmoneyResult(item as Record<string, unknown>) : null)
    .find((item) => item?.ticker === canonicalTicker) ?? null;
}

export async function consumeResolveQuota(client: DiscoveryDbClient, subjectHash: string): Promise<boolean> {
  const { data, error } = await client.rpc('consume_security_resolve_quota', {
    p_subject_hash: subjectHash,
    p_limit: 12,
    p_window_seconds: 3600,
  });
  if (error) throw new Error('Resolve quota unavailable.');
  return data === true;
}

export async function findExistingSecurity(client: DiscoveryDbClient, ticker: string) {
  const { data, error } = await client.from('stocks_universe')
    .select('ticker,name,pinyin,market,asset_type,exchange,list_status,is_active,source')
    .eq('ticker', ticker)
    .maybeSingle();
  if (error) throw new Error('Security master unavailable.');
  if (!data || !data.is_active || data.list_status !== 'listed' || data.source === 'legacy-watchlist') return null;
  return {
    t: data.ticker,
    n: data.name,
    py: data.pinyin ?? '',
    m: data.market,
    asset_type: data.asset_type,
    exchange: data.exchange,
    list_status: data.list_status,
    match_kind: 'exact',
    verification_status: 'verified',
    selectable: true,
  };
}

export async function promoteTrustedSecurity(client: DiscoveryDbClient, resolution: TrustedResolution) {
  const { data, error } = await client.rpc('promote_verified_security', {
    p_security: resolution.security,
    p_aliases: resolution.aliases,
    p_memberships: resolution.memberships,
  });
  if (error || data !== resolution.ticker) throw new Error('Security promotion failed.');
}

export async function queueDiscoveryCandidate(
  client: DiscoveryDbClient,
  query: string,
  candidate: ExternalDiscoveryCandidate,
) {
  const { data: existing } = await client.from('security_discovery_candidates')
    .select('id,seen_count')
    .eq('proposed_ticker', candidate.ticker)
    .eq('source', candidate.source)
    .maybeSingle();
  if (existing) {
    const { error } = await client.from('security_discovery_candidates').update({
      normalized_query: query,
      normalized_payload: candidate,
      seen_count: existing.seen_count + 1,
      last_seen_at: new Date().toISOString(),
    }).eq('id', existing.id);
    if (error) throw new Error('Discovery candidate queue failed.');
    return;
  }
  const { error } = await client.from('security_discovery_candidates').insert({
    normalized_query: query,
    proposed_ticker: candidate.ticker,
    source: candidate.source,
    normalized_payload: candidate,
    status: 'pending',
  });
  if (error) throw new Error('Discovery candidate queue failed.');
}
