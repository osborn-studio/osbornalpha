import { inferCoreMarket, normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';

const markets = new Set(['A','HK','US']);
const exactKinds = new Set(['exact','exact_symbol','exact_name','exact_alias']);
const hkListingMarker = /\s*-\s*(?:sw|w|s)$/u;

function comparableName(name) {
  return name.normalize('NFKC').trim().toLowerCase()
    .replace(/[–—−]/gu,'-').replace(/\s+/gu,' ');
}

function matchesQuery(row, query) {
  if (exactKinds.has(row.match_kind)) return true;
  const name = comparableName(row.n);
  if (name === query) return true;
  // HKEX ordinary trading counters can carry an exchange marker in their short names.
  // Preserve the RMB counter suffix and never use a generic fuzzy or substring match.
  return row.m === 'HK' && name.replace(hkListingMarker,'') === query;
}

export function createFeishuSecurityLookup({fetchImpl = fetch, baseUrl = 'https://osbornalpha.com', timeoutMs = 3500} = {}) {
  const endpoint = new URL(baseUrl);
  const loopback = ['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname);
  if ((endpoint.protocol !== 'https:' && !(loopback && endpoint.protocol === 'http:')) ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new Error('证券主表地址无效。');
  }
  endpoint.pathname = '/api/search';

  return async (name, {market} = {}) => {
    if (typeof name !== 'string' || (market && !markets.has(market))) return [];
    const query = name.normalize('NFKC').trim().replace(/[–—−]/gu,'-');
    if (!query || query.length > 80 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(query)) return [];
    const url = new URL(endpoint);
    url.searchParams.set('q',query);
    url.searchParams.set('limit','30');

    let packet;
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetchImpl(url.href,{signal,redirect:'error'});
      if (!response.ok) throw new Error();
      packet = await response.json();
      signal.throwIfAborted();
      if (packet?.source !== 'security-master' || !Array.isArray(packet.results) || packet.results.length > 30) {
        throw new Error();
      }
    } catch {
      throw new Error('证券主表暂时不可用。');
    }

    const normalizedQuery = comparableName(query);
    const listings = new Map();
    for (const row of packet.results) {
      if (row?.verification_status !== 'verified' || row.list_status !== 'listed' || row.selectable !== true ||
          !markets.has(row.m) || (market && row.m !== market) || typeof row.n !== 'string' || !row.n.trim() ||
          typeof row.t !== 'string' || inferCoreMarket(row.t) !== row.m || !matchesQuery(row,normalizedQuery)) continue;
      const ticker = normalizeSecurityTicker(row.t,row.m);
      if (!ticker || listings.has(ticker)) continue;
      listings.set(ticker,{ticker,market:row.m,name:row.n.trim()});
    }
    return [...listings.values()];
  };
}

export const lookupFeishuListings = createFeishuSecurityLookup();
