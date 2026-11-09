import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer, type Server} from 'node:http';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NextIntlClientProvider} from 'next-intl';
import companyMessages from '../../../../../messages/en/company.json';
import type {CompanyPageProps} from './CompanyPage';

// Only request-context boundaries are substituted. The entry, anon client, adapters,
// loader, client shell and error card are real; configured reads use local HTTP below.
vi.mock('next-intl/server', () => ({getLocale: async () => 'en'}));
vi.mock('@/lib/admin/auth', () => ({requireAdminUser: async () => {throw new Error('guest');}}));
import StockPage from './page';

let server: Server | undefined;
let requests: string[];
async function configuredDatabase(mode: 'down' | 'known' | 'unknown' | 'universe-down') {
  server = createServer((req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    requests.push(pathname);
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'down' || (mode === 'universe-down' && pathname.endsWith('/stocks_universe'))) {
      res.writeHead(403).end(JSON.stringify({code: '42501', message: 'local test database permission denied'}));
    } else {
      res.end(JSON.stringify(mode === 'known' && pathname.endsWith('/stocks_universe') ? [{ticker: '00700.HK'}] : []));
    }
  });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('local test server address unavailable');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `http://127.0.0.1:${address.port}`);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-test-anon-key');
}

async function entry(ticker = '00700') {
  return StockPage({params: Promise.resolve({ticker}), searchParams: Promise.resolve({view: 'overview'})});
}
function render(element: Awaited<ReturnType<typeof entry>>) {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: 'en', messages: {company: companyMessages}, children: element,
  }));
}
function expectUnavailable(element: Awaited<ReturnType<typeof entry>>) {
  const {data, isAdmin} = element.props as CompanyPageProps;
  expect(data).toMatchObject({ticker: '00700', errorCode: 'internal', issuer: null, market: null,
    publicTicker: null, coverage: null, coverageAll: [], streams: [], factState: 'no_issuer'});
  expect(isAdmin).toBe(false);
  const html = render(element);
  expect(html).toContain('role="alert"');
  expect(html).toContain(companyMessages.states.internal);
  expect(html).toContain(companyMessages.states.retry);
  expect(html).not.toMatch(/Tencent|腾讯|<canvas|<svg|NEXT_PUBLIC_SUPABASE|local-test-anon-key/);
}

beforeEach(() => {requests = [];});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
});

describe('company server entry', () => {
  it.each(['both', 'url', 'key'])('renders the existing unavailable card with missing config: %s', async missing => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', missing === 'key' ? 'http://127.0.0.1:1' : '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', missing === 'url' ? 'local-test-anon-key' : '');
    expectUnavailable(await entry());
    expect(requests).toEqual([]);
  });

  it('preserves the handled unavailable card for configured database errors', async () => {
    await configuredDatabase('down');
    expectUnavailable(await entry());
    expect(requests.length).toBeGreaterThan(0);
    expect(requests).not.toContain('/rest/v1/stocks_universe');
  });

  it('preserves the framework 404 for an unknown security in a configured database', async () => {
    await configuredDatabase('unknown');
    await expect(entry()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(requests).toContain('/rest/v1/stocks_universe');
  });

  it.each(['known', 'universe-down'] as const)('preserves the no-issuer state when the security check is %s', async mode => {
    await configuredDatabase(mode);
    const element = await entry();
    expect((element.props as CompanyPageProps).data).toMatchObject({issuer: null, errorCode: null, factState: 'no_issuer'});
    expect(requests).toContain('/rest/v1/stocks_universe');
  });
});
