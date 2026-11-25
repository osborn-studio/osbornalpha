import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { compileFunction } from 'node:vm';
import { transformSync } from 'esbuild';
import { require as requireTs } from 'tsx/cjs/api';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchSubmissions } from '../entities/identifiers/sec-submissions';
import { fetchCompanyFacts } from '../facts/providers/edgar-companyfacts';
import { secPacer } from '../facts/providers/shared';
import { memoryRawStore } from '../dq/raw-store';
import { fetchSecDocument as cover } from '../dq/filer-categories';
import { fetchSecDocument as ixbrl } from '../dq/reconcile/pair-us-ixbrl';
import { memoryTableClient } from '../db/memory-table-client';
import { memoryFactsDb } from '../facts/memory-facts-db';
import { fetchSubmissionsSic, fetchSicCodeTable } from '../industry/providers/sec-sic';
import { politeHttp, HOST_POLICY, makeDocBudget } from '../documents/sources/shared';
import { collectEdgar } from '../research/ingest/collectors/edgar';
import { DEFAULT_USER_AGENT } from '../research/ingest/collectors/shared';

const index = 'https://data.sec.gov/submissions/CIK0001321655.json';
const doc = 'https://www.sec.gov/Archives/edgar/test.htm';
const facts = 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json';
const sicIndex = 'https://data.sec.gov/submissions/CIK0000320193.json';
const sicTable = 'https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list';
const budget = { remainingMs: () => Infinity, signal: new AbortController().signal };
const fixture = (path: string) => readFileSync('src/lib/' + path, 'utf8');
const html = fixture('dq/fixtures/ixbrl/aapl-20230930.trimmed.htm');
const submissions = fixture('research/ingest/__fixtures__/collectors/edgar-submissions-1321655.json');
const companyFacts = fixture('facts/fixtures/edgar/CIK0000320193.trimmed.json');
const sic = fixture('industry/fixtures/sec/submissions-0000320193.json');
const table = fixture('industry/fixtures/sec/sic-codes.html');
const cases = [200, 404, 429, 500, 0]; // 0 simulates a rejected fetch
const ua = 'test-agent';
const accept = (value: string) => [['Accept', value]];

const verifyRequests: Array<() => void> = [];
beforeEach(() => { secPacer.reset(); vi.stubEnv('EDGAR_USER_AGENT', ua); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); for (const check of verifyRequests.splice(0)) check(); });

function recording(status: number, body: string, url: string, extra: string[][], method?: string, agent = ua) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (!status) throw new TypeError('offline');
    return new Response(body, { status });
  });
  verifyRequests.push(() => {
    for (const [input, init] of fetch.mock.calls) {
      expect(String(input)).toBe(url);
      expect(init?.method).toBe(method);
      const headers = Object.entries(init?.headers ?? {});
      expect(headers.map(([name]) => name)).toEqual(['User-Agent', ...extra.map(([name]) => name)]);
      expect(headers[0][1] === agent).toBe(true);
      expect(headers.slice(1)).toEqual(extra);
    }
  });
  return fetch;
}

it.each(cases)('submissions response %i and raw evidence', async status => {
  const fetch = recording(status, submissions, index, accept('application/json'));
  const raw = memoryRawStore();
  const put = vi.spyOn(raw, 'put');
  const result = fetchSubmissions('1321655', { fetch, raw });
  if (status === 200) expect((await result).parsed.name).toBe('Palantir Technologies Inc.');
  else await expect(result).rejects.toMatchObject({ code: 'sec_unavailable', message: 'sec_unavailable: main: ' + (status ? 'HTTP ' + status : 'offline') });
  expect(put).toHaveBeenCalledTimes(status ? 1 : 0);
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(cases)('companyfacts response %i and retry count', async status => {
  const fetch = recording(status, companyFacts, facts, [['Accept-Encoding', 'gzip, deflate'], ...accept('application/json')]);
  const result = fetchCompanyFacts('0000320193', budget, { fetch, sleep: async () => {} });
  if (status === 200) expect(new TextDecoder().decode((await result).bytes)).toBe(companyFacts);
  else await expect(result).rejects.toMatchObject({code: status === 404 ? 'no_companyfacts' : 'sec_unavailable',
    message: (status === 404 ? 'no_companyfacts: ' : 'sec_unavailable: ') + ({404: '404 ' + facts, 429: 'http_429_retries_exhausted', 500: 'http_500', 0: 'network: offline'} as Record<number,string>)[status]});
  expect(fetch).toHaveBeenCalledTimes(!status || status === 429 ? 5 : 1);
});

it.each(cases)('filer category document response %i', async status => {
  const fetch = recording(status, html, doc, accept('text/html'));
  const result = cover(doc, budget, { fetch });
  if (status === 200) expect(new TextDecoder().decode(await result)).toBe(html);
  else await expect(result).rejects.toMatchObject({ code: 'document_unavailable', message: status ? 'http_' + status : 'network' });
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(cases)('pair iXBRL document response %i', async status => {
  const fetch = recording(status, html, doc, accept('text/html,application/xhtml+xml'));
  const tables = memoryTableClient();
  const result = ixbrl(doc, { fetch, budget, raw: memoryRawStore(), tables, db: memoryFactsDb(tables),
    now: () => new Date(), readRepoFile: async () => { throw new Error('unexpected repo read'); } });
  if (status === 200) expect(await result).toEqual({ status: 'ok', bytes: new TextEncoder().encode(html) });
  else if (status === 404) expect(await result).toEqual({ status: 'not_found' });
  else await expect(result).rejects.toThrow(status === 429 ? 'sec_rate_limited' : status ? 'sec_unavailable:http_500' : 'offline');
  expect(fetch).toHaveBeenCalledTimes(status === 500 ? 3 : 1);
});

it.each(cases)('SIC submissions and code list response %i, empty environment fallback', async status => {
  vi.stubEnv('EDGAR_USER_AGENT', '');
  const fetch = recording(status, sic, sicIndex, accept('application/json'), undefined, DEFAULT_USER_AGENT);
  const result = await fetchSubmissionsSic('320193', { fetch });
  if (status === 200) expect(result).toMatchObject({ kind: 'ok', parsed: { sic: '3571' } });
  else expect(result).toEqual({ kind: status === 404 ? 'not_found' : 'unavailable', url: sicIndex, status: status || null });
  expect(fetch).toHaveBeenCalledOnce();
  const get = recording(status, table, sicTable, accept('text/html'), undefined, DEFAULT_USER_AGENT);
  const codes = await fetchSicCodeTable({ fetch: get });
  if (status === 200) expect(codes.kind === 'ok' && codes.rows.length).toBe(10);
  else expect(codes).toEqual({ kind: 'unavailable', url: sicTable, status: status || null });
  expect(get).toHaveBeenCalledOnce();
});

it.each(cases)('documents response %i and manual redirects', async status => {
  const fetch = recording(status, html, doc, accept('*/*'), 'GET');
  const http = politeHttp({ ...HOST_POLICY.edgar, fetch, minIntervalMs: 0, sleep: async () => {} });
  const result = http.fetchBytes(doc, makeDocBudget(null), Infinity);
  if (status === 200) expect(await result).toMatchObject({ bytes: new TextEncoder().encode(html), status });
  else if (status === 404) expect(await result).toBe('not_found');
  else await expect(result).rejects.toThrow(status ? 'http_' + status : 'offline');
  expect(fetch).toHaveBeenCalledTimes(status === 429 ? 5 : 1);
  expect(fetch.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
});

it.each(cases)('EDGAR collector response %i and receipt', async status => {
  const fetch = recording(status, submissions, index, accept('application/json'), 'GET');
  const receipt = await collectEdgar({ ctx: {} as never, companies: [{entity_id:'pltr', names_en:['PLTR'], names_zh:[],
    home_market:'US', cik:'1321655', cninfo_org_id:null, exchange_codes:[]}], since:'2100-01-01', fetch, minIntervalMs:0 });
  expect(receipt.failures).toEqual(status === 200 ? [] : [{company:'PLTR', stage:'list', url:index, message:status ? 'edgar ' + status : 'offline'}]);
  expect(fetch).toHaveBeenCalledOnce();
});

// The CLIs unconditionally invoke main (including process.exit and fixture writes). Load their
// actual module and private HTTP helper with just the final main invocation replaced.
function scriptGet(path: string, name: string) {
  const file = resolve('scripts', path + '.ts');
  const source = readFileSync(file, 'utf8').replace(/^main\(\)\.catch\(.*$/m, 'module.exports = ' + name);
  const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node22', define: { 'import.meta.url': JSON.stringify(pathToFileURL(file).href) } }).code;
  const mod = {exports: {}};
  compileFunction(code, ['require', 'module', 'exports'])( (id: string) => requireTs(id, file), mod, mod.exports);
  return mod.exports as (url: string) => Promise<Uint8Array>;
}

for (const [path, name, headers] of [
  ['dq/select-us-sample', 'get', []],
  ['dq/record-ixbrl-fixture', 'get', accept('*/*')],
  ['industry/record-fixture', 'secGet', [['Accept-Encoding', 'gzip, deflate']]],
] as const) {
  it.each(cases)(path + ' response %i', async status => {
    const fetch = recording(status, html, doc, [...headers].map(h => [...h]));
    vi.stubGlobal('fetch', fetch);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const result = scriptGet(path, name)(doc);
    if (status === 200) expect(new TextDecoder().decode(await result)).toBe(html);
    else if (status && path.startsWith('industry')) {
      await expect(result).rejects.toThrow('exit');
      expect(error).toHaveBeenCalledWith('GET ' + doc + ' → HTTP ' + status);
    } else await expect(result).rejects.toThrow(status ? 'http_' + status + ' ' + doc : 'offline');
    expect(fetch).toHaveBeenCalledOnce();
  });
}
