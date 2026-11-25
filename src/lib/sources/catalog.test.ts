import { readFileSync, readdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KLINE_RANGE_CONFIG } from '@/lib/chart/kline';
import { klineProviderRoute, providerDefinitions } from '@/lib/data/kline/reliability';
import { quoteSourcesFor } from '@/lib/data/sources/registry';
import { DATASET_KEYS } from '@/lib/industry/licenses';
import type { Market } from '@/lib/supabase/database.types';
import { capabilityFor, checkRoute, SOURCE_CATALOG, sourceByName } from './catalog';

const tickers: readonly [Market, string][] = [
  ['A', '600519.SH'], ['HK', '00700.HK'], ['US', 'AAPL'], ['TW', '2330.TW'],
  ['TW', '5483.TWO'], ['JP', '7203.T'], ['KR', '005930.KS'],
];
const switches = [false, true];
function configureGateway(enabled: boolean, intraday: boolean) {
  vi.stubEnv('DATAGATEWAY_BASE_URL', enabled ? 'https://gateway.test' : undefined);
  vi.stubEnv('DATAGATEWAY_API_KEY', enabled ? 'placeholder' : undefined);
  vi.stubEnv('DATAGATEWAY_DAILY_KLINE_PATH', undefined);
  vi.stubEnv('DATAGATEWAY_REALTIME_QUOTE_PATH', undefined);
  vi.stubEnv('DATAGATEWAY_INTRADAY_KLINE_ENABLED', intraday ? 'true' : undefined);
}
afterEach(() => vi.unstubAllEnvs());

describe('source catalogue routes', () => {
  for (const gateway of switches) {
    for (const eodhd of switches) {
      it(`covers quotes with gateway=${gateway}, EODHD=${eodhd}`, () => {
        configureGateway(gateway, false);
        vi.stubEnv('EODHD_API_TOKEN', eodhd ? 'placeholder' : undefined);
        for (const market of new Set(tickers.map(([market]) => market))) {
          const sources = quoteSourcesFor(market).map(p => p.name);
          expect(sources.includes('datagateway-wind')).toBe(gateway);
          expect(sources.includes('eodhd')).toBe(eodhd && (market === 'JP' || market === 'KR'));
          expect(checkRoute({ domain: 'quote', market, sources })).toEqual([]);
        }
      });
    }
    for (const intraday of switches) {
      it(`checks published and executable K-lines with gateway=${gateway}, intraday=${intraday}`, () => {
        configureGateway(gateway, intraday);
        for (const [market, ticker] of tickers) {
          for (const { range, interval } of Object.values(KLINE_RANGE_CONFIG)) {
            for (const requested of [undefined, 'qfq', 'hfq', 'none'] as const) {
              const request = { ticker, range, adjustment: requested };
              const label = [ticker, range, requested ?? 'default'].join('/');
              const selectable = market === 'A' || market === 'HK';
              const adjustment = interval === 'minute' ? 'intraday'
                : (selectable && requested) || (market === 'A' ? 'qfq' : 'none');
              const domain = interval === 'minute' ? 'kline_intraday'
                : interval === 'day' ? 'kline_daily' : 'kline_weekly_monthly';
              const route = { market, adjustment, domain, soleSourceAllowed: market === 'JP' || market === 'KR' } as const;
              const providers = providerDefinitions(request, 'chart');
              expect(providers.every(p => p.market === market && p.adjustment === adjustment), label).toBe(true);
              const chart = providers.map(p => p.name);
              expect(chart, label).toEqual(klineProviderRoute(ticker, range, requested));

              // Both chart definitions try Tencent even when tencentKlineTarget returns null.
              const unsupportedTencent = (market === 'A' && adjustment === 'none')
                || (market === 'HK' && adjustment === 'qfq');
              expect(checkRoute({ ...route, sources: chart }), label)
                .toEqual(unsupportedTencent ? ['no_capability:tencent'] : []);

              const scoring = providerDefinitions(request, 'scoring').map(p => p.name);
              // resolveScoringKline only sends 1y/default. Probing the wider grid exposes
              // its fixed Tencent daily adapter and US Sina daily fallback on minute requests,
              // plus A/HK adjustments that differ from the fixed scoring adjustment.
              const expected = [];
              if ((selectable || market === 'US') && adjustment !== (market === 'A' ? 'qfq' : 'none')) {
                expected.push('no_capability:tencent');
              }
              if (market === 'US' && interval === 'minute') expected.push('no_capability:sina');
              expect(checkRoute({ ...route, sources: scoring }), label).toEqual(expected);
            }
          }
        }
      });
    }
  }

  it('rejects unknown, incompatible and misplaced fallback sources', () => {
    const daily = { market: 'A', domain: 'kline_daily', adjustment: 'qfq' } as const;
    for (const sources of [['datagateway'], ['datagateway', 'eastmoney']]) {
      expect(checkRoute({ ...daily, sources })).toEqual(['fallback_only_first:datagateway']);
    }
    expect(checkRoute({ ...daily, sources: ['datagateway', 'eastmoney'], soleSourceAllowed: true }))
      .toEqual(['fallback_only_first:datagateway']);
    expect(checkRoute({ ...daily, market: 'US', adjustment: 'hfq', sources: ['sina'] })).toEqual(['no_capability:sina']);
    expect(checkRoute({ ...daily, sources: ['invented'] })).toEqual(['unknown_source:invented']);
    expect(capabilityFor('datagateway-wind', 'kline_daily', 'A', 'qfq'))
      .toMatchObject({ bars: 'close_only', role: 'fallback_only' });
  });
});

it('keeps catalogue names unique, credentials symbolic and licence references valid', () => {
  const methodologies = Object.keys(JSON.parse(readFileSync('docs/methodologies/licenses.json', 'utf8')));
  const names = SOURCE_CATALOG.flatMap(s => [s.id, ...s.aliases]);
  expect(new Set(names).size).toBe(names.length);
  for (const entry of SOURCE_CATALOG) {
    for (const name of [entry.id, ...entry.aliases]) expect(sourceByName(name)).toBe(entry);
    for (const credential of entry.credentials) expect(credential).toMatch(/^[A-Z][A-Z0-9_]+$/);
    expect(JSON.stringify(entry)).not.toMatch(/[A-Za-z0-9_\-]{32,}/);
    for (const key of entry.licence.keys) {
      if (entry.licence.place === 'industry_dataset_licenses') expect(DATASET_KEYS).toContain(key);
      if (entry.licence.place === 'methodologies_licenses_json') expect(methodologies).toContain(key);
    }
    for (const cap of entry.capabilities) {
      if (cap.adjustments?.includes('hfq')) {
        expect(entry.id).toBe('eastmoney');
        expect(cap.markets.every(m => m === 'A' || m === 'HK')).toBe(true);
      }
    }
  }
});

const NON_DATA_HOSTS = [
  'api.anthropic.com', 'api.deepseek.com', 'api.typesafe.ai', 'api.resend.com', 'resend.com',
  'api.telegram.org', 'placeholder.supabase.co',
  'alpha.osborn.studio', 'osbornalpha.com', 'stock-monitor-nu.vercel.app',
  'xbrl.org', 'www.xbrl.org', 'www.w3.org', 'fasb.org', 'github.com',
];
function* sourceFiles(dir: string): Generator<string> {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) {
      if (!['fixtures', '__fixtures__', 'testing'].includes(file.name)) yield* sourceFiles(path);
    } else if (/\.tsx?$/.test(file.name) && !file.name.includes('.test.')
      && !['db-contract.ts', 'e2e-fixture.ts'].includes(file.name)) yield path;
  }
}
it('accounts for external host literals throughout src', () => {
  const known = new Set([...NON_DATA_HOSTS, ...SOURCE_CATALOG.flatMap(s => s.hosts)]);
  const missing = new Set<string>();
  for (const path of sourceFiles('src')) {
    for (const match of readFileSync(path, 'utf8').matchAll(/https?:\/\/(?:\[[\da-f:]+\]|[\w-]+(?:\.[\w-]+)*)/gi)) {
      const host = new URL(match[0]).hostname;
      if (!host.includes('.') || isIP(host) || host.startsWith('example.') || /\.(example|invalid|test)$/.test(host)) continue;
      if (!known.has(host)) missing.add(`${host} in ${path}`);
    }
  }
  expect([...missing].sort()).toEqual([]);
});
