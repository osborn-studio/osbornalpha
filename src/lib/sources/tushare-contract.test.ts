import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/diag/tushare/route';
import { tushareCall, tushareCallRaw, TushareError } from '@/lib/data/sources/tushare';
import { callTushare, SecuritySourceError } from '@/lib/securities/sources/tushare-client';

const params = { ts_code: '600519.SH' };
const fields = 'a,b';
const body = '{"api_name":"daily","token":"test-token","params":{"ts_code":"600519.SH"},"fields":"a,b"}';
const page = '{"request_id":"sample","code":0,"msg":"","data":{"fields":["a","b"],"items":[["x",2]],"has_more":true}}';
const denied = '{"code":17,"msg":"denied","data":null}';
const abort = new DOMException('request cancelled', 'AbortError');

function stub(reply: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(reply);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function request(fetch: ReturnType<typeof stub>, expectedBody = body, hasSignal = true) {
  expect(fetch.mock.calls).toEqual([['https://api.tushare.pro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: expectedBody,
    ...(hasSignal ? { signal: expect.any(AbortSignal) } : {}),
  }]]);
}

beforeEach(() => vi.stubEnv('TUSHARE_TOKEN', 'test-token'));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const rows = () => tushareCall('daily', params, fields);
const securities = () => callTushare({ apiName: 'daily', params, fields: ['a', 'b'] });
const raw = () => tushareCallRaw('daily', params, fields);
const diag = () => GET(new Request('http://localhost/api/diag/tushare?ts_code=600519.SH&api_name=daily&fields=a,b'));

for (const [name, invoke, ErrorClass, httpMessage, apiMessage] of [
  ['tushareCall', rows, TushareError, 'HTTP 500', 'denied'],
  ['callTushare', securities, SecuritySourceError, 'tushare request failed: source_http', 'tushare request failed: source_auth'],
] as const) {
  describe(name, () => {
    it('posts exact bytes and maps fields to rows', async () => {
      const fetch = stub(async () => new Response(page));
      expect(await invoke()).toEqual([{ a: 'x', b: 2 }]);
      request(fetch);
    });
    it.each([[500, httpMessage], [200, apiMessage]] as const)('handles HTTP %i', async (status, message) => {
      stub(async () => new Response(denied, { status }));
      const result = invoke();
      await expect(result).rejects.toBeInstanceOf(ErrorClass);
      await expect(result).rejects.toMatchObject({ message });
    });
  });
}

it('maps the quote deadline to its public timeout', async () => {
  stub(() => new Promise(() => {}));
  const result = tushareCall('daily', params, fields, 5);
  await expect(result).rejects.toBeInstanceOf(Error);
  await expect(result).rejects.toMatchObject({ name: 'TimeoutError', message: 'Tushare request timed out after 5ms' });
});

it('maps a securities abort to source_timeout', async () => {
  stub(async () => { throw abort; });
  const result = securities();
  await expect(result).rejects.toBeInstanceOf(SecuritySourceError);
  await expect(result).rejects.toMatchObject({ message: 'tushare request failed: source_timeout' });
});

describe('tushareCallRaw', () => {
  it.each([
    [{}, body],
    [{ limit: 7, offset: 0 }, '{"api_name":"daily","token":"test-token","params":{"ts_code":"600519.SH","limit":7,"offset":0},"fields":"a,b"}'],
  ] as const)('preserves request and response bytes with %j', async (paging, expected) => {
    const fetch = stub(async () => new Response(page));
    expect(await tushareCallRaw('daily', params, fields, { ...paging, fetch })).toEqual({
      bytes: new TextEncoder().encode(page), sha256: createHash('sha256').update(page).digest('hex'),
      httpStatus: 200, requestId: 'sample', code: 0, msg: '', fields: ['a', 'b'],
      items: [['x', { __num: '2' }]], hasMore: true,
    });
    request(fetch, expected);
  });
  it('throws the HTTP status', async () => {
    stub(async () => new Response(denied, { status: 500 }));
    const result = raw();
    await expect(result).rejects.toBeInstanceOf(TushareError);
    await expect(result).rejects.toMatchObject({ code: 500, message: 'HTTP 500' });
  });
  it('returns API errors in the envelope', async () => {
    stub(async () => new Response(denied));
    expect(await raw()).toMatchObject({ code: 17, msg: 'denied', items: [], fields: [] });
  });
  it('propagates an abort', async () => {
    stub(async () => { throw abort; });
    await expect(raw()).rejects.toBe(abort);
  });
});

describe('diagnostic route', () => {
  it.each([[200, page], [500, 'failure'], [200, denied]] as const)('reports the upstream response (%i, %s)', async (status, text) => {
    const fetch = stub(async () => new Response(text, { status }));
    const response = await diag();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      request: { api_name: 'daily', params, fields, sent_body: { api_name: 'daily', token: '***REDACTED***', params, fields } },
      response: {
        status, code: text === page ? 0 : text === denied ? 17 : null,
        msg: text === page ? '' : text === denied ? 'denied' : null,
        has_data: text === page, row_count: text === page ? 1 : 0,
        fields_returned: text === page ? ['a', 'b'] : null, first_row: text === page ? ['x', 2] : null,
        first_3_rows: text === page ? [['x', 2]] : null, raw_body: text,
      },
    });
    request(fetch, body, false);
  });
  it('returns the network error as a 502', async () => {
    stub(async () => { throw abort; });
    const response = await diag();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'request cancelled', api_name: 'daily' });
  });
});

it('preserves every cache wrapper, revalidation interval, tag and public export', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync('src/lib/data/sources/tushare-cached.ts', 'utf8');
  const contract = text.split('\n').map(line => line.trim()).filter(line =>
    /^(?:export |\{ revalidate:|const (?:HOUR|DAY) =)/.test(line));
  expect(contract).toMatchInlineSnapshot(`
    [
      "const DAY = 24 * 60 * 60;     // seconds",
      "const HOUR = 60 * 60;",
      "export const fetchTushareDaily = unstable_cache(",
      "{ revalidate: 6 * HOUR, tags: ['tushare', 'tushare-daily'] }",
      "export const fetchTushareDailyBasic = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-daily-basic'] }",
      "export const fetchTushareFinaIndicator = unstable_cache(",
      "{ revalidate: 7 * DAY, tags: ['tushare', 'tushare-fina-indicator'] }",
      "export const fetchTushareIncome = unstable_cache(",
      "{ revalidate: 7 * DAY, tags: ['tushare', 'tushare-income'] }",
      "export const fetchTushareBalance = unstable_cache(",
      "{ revalidate: 7 * DAY, tags: ['tushare', 'tushare-balance'] }",
      "export const fetchTushareCashflow = unstable_cache(",
      "{ revalidate: 7 * DAY, tags: ['tushare', 'tushare-cashflow'] }",
      "export const fetchTushareTopHolders = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-holders'] }",
      "export const fetchTushareFloatHolders = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-holders'] }",
      "export const fetchTushareHkHold = unstable_cache(",
      "{ revalidate: 6 * HOUR, tags: ['tushare', 'tushare-hk-hold'] }",
      "export const fetchTushareNorthboundTop10 = unstable_cache(",
      "{ revalidate: 6 * HOUR, tags: ['tushare', 'tushare-northbound-top10'] }",
      "export const fetchTushareDisclosureDate = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-calendar'] }",
      "export const fetchTushareForecast = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-calendar'] }",
      "export const fetchTushareDividend = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-calendar'] }",
      "export const fetchTushareShareFloat = unstable_cache(",
      "{ revalidate: DAY, tags: ['tushare', 'tushare-calendar'] }",
      "export const fetchTushareLimitList = unstable_cache(",
      "{ revalidate: 6 * HOUR, tags: ['tushare', 'tushare-limit-list'] }",
      "export const fetchTushareAnnouncements = unstable_cache(",
      "{ revalidate: 6 * HOUR, tags: ['tushare', 'tushare-anns'] }",
      "export const fetchTushareReportRc = unstable_cache(",
      "{ revalidate: 6 * HOUR, tags: ['tushare', 'tushare-report-rc'] }",
      "export { isTushareConfigured, TushareError };",
    ]
  `);
});
