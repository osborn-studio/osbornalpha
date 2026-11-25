import { klineProviderRoute, providerDefinitions } from '@/lib/data/kline/reliability';
import { isDatagatewayConfigured, isDatagatewayIntradayConfigured } from '@/lib/data/sources/datagateway';
import { isEodhdConfigured } from '@/lib/data/sources/eodhd';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import type { Row } from '@/lib/db/table-client';
import { DQ_DATASET_INVENTORY } from '@/lib/dq/datasets';
import type { FreshnessStatus } from '@/lib/dq/freshness';
import { DATASET_KEYS } from '@/lib/industry/licenses';
import { ORIGINS } from '@/lib/judgments/origins';
import { REGISTRY } from '@/lib/judgments/registry';
import type { LicenseTable } from '@/lib/judgments/methodology-sync';
import { MACRO_CATALOG } from '@/lib/macro/catalog';
import type { Market } from '@/lib/supabase/database.types';
import { SOURCE_CATALOG, sourceByName } from './catalog';

const tickers: Record<Market, string> = {
  A:'600519.SH', HK:'00700.HK', US:'AAPL', TW:'2330.TW', JP:'7203.T', KR:'005930.KS',
};
type Domain = 'quotes'|'history'|'daily'|'back'|'intraday'|'scoring';
type Route = { domain:Domain; markets:Market[]; sources:string[] };

export function readRouting() {
  function group(domain:Domain, markets:Market[]) {
    const rows:Route[] = [];
    for (const market of markets) {
      const ticker = tickers[market];
      const sources = domain === 'quotes' ? quoteSourcesFor(market).map(p => p.name)
        : domain === 'scoring' ? providerDefinitions({ ticker, range:'1y' }, 'scoring').map(p => p.name)
        : klineProviderRoute(ticker, domain === 'intraday' ? '1d' : '1y', domain === 'back' ? 'hfq' : undefined);
      const same = rows.find(r => r.sources.length === sources.length && sources.every((s,i) => s === r.sources[i]));
      if (same) same.markets.push(market);
      else rows.push({ domain, markets:[market], sources });
    }
    return rows;
  }
  return {
    live: [
      ...group('quotes', ['A','HK','US','TW','JP','KR']), ...group('history', ['A','HK','US']),
      ...group('daily', ['TW','JP','KR']), ...group('back', ['A','HK']),
      ...group('intraday', ['A','HK','US']), ...group('scoring', ['A','HK','US']),
    ],
    configured:{ gw:isDatagatewayConfigured(), gwi:isDatagatewayIntradayConfigured(), eodhd:isEodhdConfigured() },
    catalogue:SOURCE_CATALOG.map(s => ({
      id:s.id, name:s.name, domains:[...new Set(s.capabilities.map(c => c.domain))],
      credentials:s.credentials.map(name => ({ name, configured:Boolean(process.env[name]) })),
      pacing:s.pacing?.minIntervalMs ?? null, place:s.licence.place,
    })),
  };
}

interface Reads {
  freshness:(Row & {status:FreshnessStatus})[]|null;
  industry:Row[]|null;
  judgments:LicenseTable|null;
  hasBatches:boolean|null;
}

export function buildAdminView(routing:ReturnType<typeof readRouting>, reads:Reads) {
  const { freshness, industry, judgments, hasBatches } = reads;
  const stored = new Map(freshness?.map(row => [row.dataset,row]));
  const frozen = Object.keys(judgments ?? ORIGINS).map(key => {
    const [kind, origin] = key.split('×');
    return { key, kind, origin, status:judgments?.[key]?.status ?? 'unreadable',
      at:judgments?.[key]?.confirmed_at ?? null,
      methods:REGISTRY.filter(m => key in ORIGINS && m.input_kinds.some(k => k === kind)).map(m => m.id + '@' + m.version) };
  });
  const industryRows = industry?.map(r => ({
    key:String(r.dataset_key), status:r.status === 'public' ? 'on' : r.status === 'internal' ? 'off' : 'unreadable',
    at:typeof r.decided_at === 'string' ? r.decided_at : null,
  })) ?? DATASET_KEYS.map(key => ({ key, status:'unreadable', at:null }));
  const rights = new Map<string, number>();
  const macroStatuses = new Map<string,string>();
  for (const series of MACRO_CATALOG) {
    if (!series.source) continue;
    const { rights:value } = series.source;
    rights.set(value, (rights.get(value) ?? 0) + 1);
    macroStatuses.set(series.id, value === 'third_party' ? 'pending' : 'confirmed');
  }
  const macro = Array.from(rights, ([key,count]) => ({ key, count, status:key === 'third_party' ? 'pending' : 'confirmed' }));
  const licenceByPlace = {
    industry_dataset_licenses:new Map(industryRows.map(r => [r.key,r.status])),
    methodologies_licenses_json:new Map(frozen.map(r => [r.key,r.status])),
    macro_catalog_rights:macroStatuses,
  };
  const datasets = DQ_DATASET_INVENTORY.map(({dataset,source,producer,cadence}) => {
    const sources = typeof source === 'string' ? [source] : source;
    const statuses = sources.flatMap(id => {
      const pointer = sourceByName(id)?.licence;
      if (!pointer || pointer.place === 'none') return [];
      const lookup = licenceByPlace[pointer.place];
      return pointer.keys.flatMap(key => lookup.get(key) ?? []);
    });
    const row = stored.get(dataset);
    return { dataset, sources, producer, cadence, licences:[...new Set(statuses)],
      freshness:freshness === null ? 'unreadable' : row?.status ?? 'missing',
      lastSuccess:freshness === null ? 'unreadable' : typeof row?.last_ok_at === 'string' ? row.last_ok_at : null };
  });
  return { ...routing, datasets, industryRows, frozen, macro, hasBatches,
    freshnessFailed:freshness === null,
    partial:[freshness,industry,judgments,hasBatches].includes(null),
    tiles:{
      sources:routing.catalogue.length, domains:new Set(routing.catalogue.flatMap(s => s.domains)).size,
      stale:freshness && datasets.filter(d => d.freshness === 'stale' || d.freshness === 'missing').length,
      unconfirmed:industry && judgments && !industryRows.some(r => r.status === 'unreadable')
        ? industryRows.filter(r => r.status === 'off').length + frozen.filter(r => r.status === 'unverified').length
          + macro.filter(r => r.status === 'pending').reduce((sum,r) => sum+r.count,0)
        : null,
    },
  };
}
export type AdminView = ReturnType<typeof buildAdminView>;
