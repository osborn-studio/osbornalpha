/** Local fixture infrastructure. No Next server, auth, database, or live-source claims. */
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config';
import type { ReactNode } from 'react';
import { createRequire } from 'node:module';
import { renderToString } from 'react-dom/server';
import type { DrawerTarget } from '../../src/components/macro/SourceDrawer';
import type { FixturePageInput } from './browser-stubs/pages';

const root = process.cwd();
const requireFromRepo = createRequire(path.join(root, 'package.json'));
const harness = path.join(root, 'tests/macro-source-integration');
const port = Number(process.env.MACRO_FIXTURE_PORT ?? 3147);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MACRO_FIXTURE_PORT');
const out = path.join(process.env.OSSTACK_SCRATCH_ROOT ?? '/tmp/osstack', 'macro-source-integration/session-4/build', String(port));
const stubs = path.join(harness, 'browser-stubs');
const stubPaths: Record<string, string> = {
  'next/navigation': 'navigation.ts', 'next/link': 'link.tsx', 'next-intl/server': 'intl-server.ts',
  '@/lib/macro/strategy/flags': 'strategy-flags.ts', '@/lib/macro/strategy/port': 'strategy-port.ts',
  '@/lib/supabase/client': 'supabase-client.ts',
};
const plugin: Plugin = { name: 'authorized-fixture-boundaries', setup(builder) {
  builder.onResolve({ filter: /^(next\/navigation|next\/link|next-intl\/server|@\/lib\/macro\/strategy\/(flags|port)|@\/lib\/supabase\/client)$/ }, args => ({ path: path.join(stubs, stubPaths[args.path]) }));
} };
interface RegisteredResponse { method?: string; status?: number; headers?: Record<string, string>; body?: string; json?: unknown }
const responses = new Map<string, RegisteredResponse>();
const base = `http://127.0.0.1:${port}`;
function localKey(input: string) {
  const url = new URL(input, base);
  if (url.origin !== base) throw new Error('Only this fixture origin can be registered');
  return url.pathname + url.search;
}
function responseKey(method: string, input: string) { return `${method.toUpperCase()} ${localKey(input)}`; }
function json(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'x-fixture-only': 'true' });
  res.end(JSON.stringify(value));
}
function queryOf(url: URL) {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}
async function sourceTarget(name: string): Promise<DrawerTarget> {
  // Session 1 owns all source payloads. Never invent a second evidence fixture here.
  const mod = await import(pathToFileURL(path.join(harness, 'fixtures.ts')).href);
  const fixture = mod.resolveFixture(name);
  const target = fixture.drawerTarget;
  if (!target) throw new Error(`No Session 1 drawerTarget for case ${name}`);
  return target;
}
async function start() {
  await mkdir(out, { recursive: true });
  const common = { bundle: true, plugins: [plugin], jsx: 'automatic' as const, tsconfig: path.join(root, 'tsconfig.json'), logLevel: 'warning' as const };
  await build({ ...common, entryPoints: [path.join(harness, 'browser.tsx')], outfile: path.join(out, 'browser.js'), platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' } });
  // External React must share the server's React instance for hooks/Intl context.
  const serverBundle = path.join(out, 'pages.cjs');
  await build({ ...common, entryPoints: [path.join(stubs, 'pages.tsx')], outfile: serverBundle, platform: 'node', format: 'cjs', plugins: [plugin, { name: 'shared-react', setup(builder) { builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: requireFromRepo.resolve(args.path), external: true })); } }] });
  const pages = await import(pathToFileURL(serverBundle).href);
  const fixturePage: (input: FixturePageInput) => Promise<ReactNode> = pages.fixturePage ?? pages.default.fixturePage;
  const script = await readFile(path.join(out, 'browser.js'));
  const stylesheet = await postcss([tailwindcss({ ...tailwindConfig, content: [path.join(root, 'src/components/macro/**/*.{ts,tsx}'), path.join(root, 'src/components/ui/**/*.{ts,tsx}')] })]).process(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', base);
      if (url.pathname === '/__fixture/health') return json(res, 200, { fixtureOnly: true, realPageFunctions: true, port });
      if (url.pathname === '/__fixture/register' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) throw new Error('Fixture registration too large'); }
        const data = JSON.parse(body) as RegisteredResponse & { url: string };
        if (typeof data.url !== 'string') throw new Error('Fixture url required');
        const key = responseKey(data.method ?? 'GET', data.url);
        responses.set(key, data);
        return json(res, 201, { registered: key, fixtureOnly: true });
      }
      if (url.pathname === '/__fixture/reset' && req.method === 'POST') { responses.clear(); return json(res, 200, { fixtureOnly: true }); }
      if (url.pathname === '/__fixture/browser.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(script); }
      if (url.pathname === '/__fixture/style.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(stylesheet.css); }
      if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const registered = responses.get(responseKey(req.method ?? 'GET', req.url ?? '/'));
      if (registered) {
        res.writeHead(registered.status ?? 200, { 'content-type': registered.json !== undefined ? 'application/json' : 'text/html', ...registered.headers, 'x-fixture-only': 'true' });
        return res.end(registered.json !== undefined ? JSON.stringify(registered.json) : registered.body ?? '');
      }
      if (url.pathname.startsWith('/api/')) return json(res, 503, { error: { code: 'fixture_response_not_registered' }, fixtureOnly: true });
      if (url.pathname === '/intel/macro' || url.pathname.startsWith('/intel/macro/')) {
        res.writeHead(308, { location: `${url.pathname.replace(/^\/intel/, '')}${url.search}`, 'x-fixture-only': 'true', 'x-fixture-redirect': 'simulated' });
        return res.end('Simulated fixture redirect; this does not verify Next redirects.');
      }
      const input: FixturePageInput = { path: url.pathname, query: queryOf(url) };
      if (url.pathname === '/fixture/source') input.drawerTarget = await sourceTarget(url.searchParams.get('case') ?? 'valid');
      const html = renderToString(await fixturePage(input));
      const serialized = JSON.stringify(input).replace(/</g, '\\u003c');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-fixture-only': 'true', 'x-fixture-render': 'real-page-function-ssr' });
      res.end(`<!doctype html><html lang="en" class="theme-light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Macro source fixture harness</title><link rel="stylesheet" href="/__fixture/style.css"></head><body><main id="root" style="padding:24px">${html}</main><script>window.__MACRO_FIXTURE__=${serialized}</script><script src="/__fixture/browser.js"></script></body></html>`);
    } catch (error) {
      const e = error as Error & { status?: number };
      json(res, e.status === 404 ? 404 : 500, { error: { code: e.status === 404 ? 'fixture_not_found' : 'fixture_harness_error', message: e.message }, fixtureOnly: true });
    }
  });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Macro synthetic fixture harness listening on ${base}\n`));
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
void start().catch(error => { console.error(error); process.exitCode = 1; });
