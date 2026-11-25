import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import { klineProviderRoute, providerDefinitions } from '@/lib/data/kline/reliability';
import { DQ_DATASET_INVENTORY } from '@/lib/dq/datasets';
import { SOURCE_CATALOG } from './catalog';
import { buildAdminView, readRouting } from './admin-view';

const reads = { freshness: [], industry: [], judgments: {}, hasBatches: false };
const tickers = { A: '600519.SH', HK: '00700.HK', US: 'AAPL', TW: '2330.TW', JP: '7203.T', KR: '005930.KS' };
afterEach(() => vi.unstubAllEnvs());

it.each([[false,false],[false,true],[true,false],[true,true]])('reflects gateway %s and EODHD %s without disclosing credentials', (gateway, eodhd) => {
  const secret = randomUUID();
  const url = 'https://' + secret + '.invalid';
  vi.stubEnv('DATAGATEWAY_DAILY_KLINE_PATH', undefined);
  vi.stubEnv('DATAGATEWAY_REALTIME_QUOTE_PATH', undefined);
  vi.stubEnv('DATAGATEWAY_INTRADAY_KLINE_ENABLED', undefined);
  vi.stubEnv('DATAGATEWAY_BASE_URL', gateway ? url : undefined);
  vi.stubEnv('DATAGATEWAY_API_KEY', gateway ? secret : undefined);
  vi.stubEnv('EODHD_API_TOKEN', eodhd ? secret : undefined);
  const view = buildAdminView(readRouting(), reads);
  expect(view.configured).toEqual({ gw:gateway, gwi:false, eodhd });
  expect(view.live).toHaveLength(12);
  for (const row of view.live) {
    for (const market of row.markets) {
      const ticker = tickers[market];
      const expected = row.domain === 'quotes' ? quoteSourcesFor(market).map(p => p.name)
        : row.domain === 'scoring' ? providerDefinitions({ ticker, range: '1y' }, 'scoring').map(p => p.name)
        : klineProviderRoute(ticker, row.domain === 'intraday' ? '1d' : '1y', row.domain === 'back' ? 'hfq' : undefined);
      expect(row.sources).toEqual(expected);
    }
  }
  if (!gateway) expect(view.live[0].sources).toEqual(['eastmoney','sina','tencent']);
  expect(view.live.find(r => r.domain === 'back')).toMatchObject({ markets:['A','HK'], sources:['eastmoney'] });
  expect(view.catalogue.find(s => s.id === 'eodhd')?.credentials).toEqual([{ name:'EODHD_API_TOKEN', configured:eodhd }]);
  expect(JSON.stringify(view).includes(secret)).toBe(false);
});

it('keeps failed reads distinct from empty reads', () => {
  const view = buildAdminView(readRouting(), { ...reads, freshness:null, industry:null });
  expect(view.datasets.map(d => d.dataset)).toEqual(DQ_DATASET_INVENTORY.map(d => d.dataset));
  expect(view.datasets.every(d => d.freshness === 'unreadable' && d.lastSuccess === 'unreadable')).toBe(true);
  expect(view.tiles.stale).toBeNull();
  expect(view.tiles.unconfirmed).toBeNull();
  expect(view.catalogue).toHaveLength(SOURCE_CATALOG.length);
  const empty = buildAdminView(readRouting(), reads);
  expect(empty.tiles.stale).toBe(DQ_DATASET_INVENTORY.length);
});

it('resolves stored licences by catalogue pointer and counts individual unconfirmed records', () => {
  const view = buildAdminView(readRouting(), {
    freshness:[{ dataset:'facts.cn', status:'fresh', last_ok_at:'2026-11-24T09:00:00Z' }],
    industry:[{ dataset_key:'scheme:sw2021:2021', status:'internal', decided_at:null }],
    judgments:{
      'macro_snapshot×macro_workbench':{ status:'confirmed', confirmed_at:'2026-11-24', confirmed_by:'fixture', evidence:'fixture' },
      'financial_fact×edgar':{ status:'unverified', confirmed_at:null, confirmed_by:null, evidence:null },
    },
    hasBatches:true,
  });
  expect(view.datasets.find(d => d.dataset === 'facts.cn')).toMatchObject({ freshness:'fresh', lastSuccess:'2026-11-24T09:00:00Z', licences:['internal'] });
  expect(view.datasets.find(d => d.dataset === 'facts.us')?.licences).toEqual(['unverified']);
  expect(view.frozen.map(r => r.methods)).toEqual([['macro_regime@v2'],[]]);
  expect(view.tiles.unconfirmed).toBe(2 + (view.macro.find(r => r.key === 'third_party')?.count ?? 0));
  expect(view.tiles.stale).toBe(DQ_DATASET_INVENTORY.length - 1);
});
