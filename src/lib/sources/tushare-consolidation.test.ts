import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { fetchTushareStatements, resetTusharePacing, TUSHARE_MIN_INTERVAL_MS } from '@/lib/facts/providers/tushare-statements';
import { fetchStockBasic, STOCK_BASIC_FIELDS } from '@/lib/industry/providers/tushare-industry';
import { sourceByName } from './catalog';
import { TUSHARE_ENDPOINT } from './tushare-transport';

const transport = 'src/lib/sources/tushare-transport.ts';
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(test|spec)\.[^/]+$/.test(path) ? [] : [path];
  });
}
const sources = [...files('src'), ...files('scripts')].map(path => ({ path, text: readFileSync(path, 'utf8') }));

it('limits the literal Tushare host to the catalogue and transport, including in comments', () => {
  expect(sources.filter(s => s.text.includes('api.tushare.pro')).map(s => s.path).sort()).toEqual(['src/lib/sources/catalog.ts', transport]);
  expect(sourceByName('tushare')?.hosts).toEqual([new URL(TUSHARE_ENDPOINT).host]);
});

it('only dispatches to the Tushare endpoint inside the transport', () => {
  const direct = /\bfetch\s*\)?\s*\(\s*(?:TUSHARE_ENDPOINT\b|['"` ]https:\/\/api\.tushare\.pro)/;
  expect(sources.filter(s => direct.test(s.text)).map(s => s.path)).toEqual([transport]);
});

it('documents every unpaced direct importer', async () => {
  const { TUSHARE_UNPACED_CALL_SITES } = await import('./tushare-transport');
  const directImport = /\bimport\s*\{[^}]*\b(?:postTushare|tushareCall|tushareCallRaw|callTushare)\b[^}]*\}\s*from/;
  const unpaced = sources.filter(s => directImport.test(s.text) && !/\btusharePacer\.admit\(/.test(s.text));
  expect(unpaced.map(s => s.path).sort()).toEqual([...TUSHARE_UNPACED_CALL_SITES].sort());
});

it('agrees with the catalogue pacing interval', () => {
  expect(sourceByName('tushare')?.pacing?.minIntervalMs).toBe(TUSHARE_MIN_INTERVAL_MS);
});

it('spaces the first industry page after a statement admission and honors an override', async () => {
  resetTusharePacing();
  let time = 1000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => time);
  const sleep = vi.fn(async (ms: number) => { time += ms; });
  const dispatches: number[] = [];
  const budget = { remainingMs: () => Infinity, signal: new AbortController().signal };
  try {
    await expect(fetchTushareStatements('600519.SH', 2024, budget, {
      now: () => time, sleep, call: async () => {
        dispatches.push(time);
        throw new Error('end of recording');
      },
    })).rejects.toMatchObject({ code: 'tushare_unavailable' });
    const call = async () => {
      dispatches.push(time);
      return { fields: [...STOCK_BASIC_FIELDS], items: [], has_more: false, raw: new Uint8Array() };
    };
    const opts = { now: () => new Date(time), sleep };
    await fetchStockBasic(call, { listStatus: 'L' }, opts);
    await fetchStockBasic(call, { listStatus: 'D' }, { ...opts, minIntervalMs: 25 });
    expect(dispatches).toEqual([1000, 1400, 1425]);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([400, 25]);
  } finally {
    clock.mockRestore();
    resetTusharePacing();
  }
});

it('preserves a failure from the industry caller’s injected sleep', async () => {
  resetTusharePacing();
  const failure = new Error('wait interrupted');
  try {
    const call = async () => ({ fields: [...STOCK_BASIC_FIELDS], items: [], has_more: true, raw: new Uint8Array() });
    await expect(fetchStockBasic(call, { listStatus: 'L' }, {
      sleep: async () => { throw failure; },
    })).rejects.toBe(failure);
  } finally {
    resetTusharePacing();
  }
});
