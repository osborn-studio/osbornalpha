/** Production-mode Next fixture: real route/provider sources, synthetic fetch only. */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { bounded } from './owned-gateway';
import { stopOwnedProcessGroup } from './owned-process-group';

async function main() {
  if (process.platform === 'win32') throw new Error('POSIX ownership harness required');
  const root = process.cwd();
  const version = JSON.parse(readFileSync(join(root, 'node_modules/next/package.json'), 'utf8')).version;
  assert.equal(version, '15.5.26');
  const dir = mkdtempSync(join(tmpdir(), 'alpha-quote-next-'));
  const env = { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' } as const;
  const logPath = join(dir, 'runtime.log');
  const log = createWriteStream(logPath, { mode: 0o600 });
  let child: ChildProcess | undefined; let exited: Promise<void> | undefined;
  let primary: unknown; let retained = false;
  try {
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dependencies: { next: version, react: '19.1.0', 'react-dom': '19.1.0' } }));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], strict: true, skipLibCheck: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', baseUrl: '.', paths: { '@/*': [join(root, 'src/*')] } } }));
    writeFileSync(join(dir, 'next.config.mjs'), 'export default { experimental: { externalDir: true }, outputFileTracingRoot: ' + JSON.stringify(root) + ', webpack(config) { config.resolve.alias["@"] = ' + JSON.stringify(join(root, 'src')) + '; return config; } };');
    mkdirSync(join(dir, 'app/api/quote'), { recursive: true });
    writeFileSync(join(dir, 'app/api/quote/route.ts'), `import { GET as realGet } from ${JSON.stringify(join(root, 'src/app/api/quote/batch/route'))};\nimport { appendFileSync } from 'node:fs';\nexport const dynamic = 'force-dynamic';\nexport async function GET(request: Request) { const patched = Boolean((fetch as typeof fetch & {__nextPatched?:boolean}).__nextPatched); appendFileSync(${JSON.stringify(join(dir, 'entries.jsonl'))}, JSON.stringify({tickers:new URL(request.url).searchParams.get('tickers'),patched})+'\\n'); return realGet(request); }\n`);
    writeFileSync(join(dir, 'app/layout.tsx'), 'export default function Layout({children}:{children:React.ReactNode}) {return <html><body>{children}</body></html>}');
    writeFileSync(join(dir, 'app/page.tsx'), 'export default function Page(){return <p>Synthetic quote runtime fixture</p>}');
    // Installed before Next wraps fetch. No delegate exists: every nonfixture
    // URL throws, so copied provider dependencies cannot reach external APIs.
    writeFileSync(join(dir, 'instrumentation.ts'), `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
export async function register() {
 if (process.env.NEXT_RUNTIME !== 'nodejs') return;
 appendFileSync(${JSON.stringify(join(dir, 'register.jsonl'))}, JSON.stringify({patched: Boolean((fetch as typeof fetch & {__nextPatched?:boolean}).__nextPatched)})+'\\n');
 let calls = 0;
 globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== 'https://mis.twse.com.tw' || url.pathname !== '/stock/api/getStockInfo.jsp') {
   appendFileSync(${JSON.stringify(join(dir, 'fetch.jsonl'))}, JSON.stringify({blocked: true, origin: url.origin})+'\\n');
   throw new Error('Synthetic runtime refuses nonfixture fetch');
  }
  if (url.searchParams.get('ex_ch') === 'tse_9212.tw|tse_9213.tw') {
   const deadline = Date.now()+2000;
   while(Date.now()<deadline) {
    const entries=existsSync(${JSON.stringify(join(dir, 'entries.jsonl'))}) ? readFileSync(${JSON.stringify(join(dir, 'entries.jsonl'))},'utf8').trim().split('\\n').map(line=>JSON.parse(line)) : [];
    if(entries.filter(row=>row.tickers==='9212.TW,9213.TW').length>=6) break;
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   const entries=readFileSync(${JSON.stringify(join(dir, 'entries.jsonl'))},'utf8').trim().split('\\n').map(line=>JSON.parse(line));
   if(entries.filter(row=>row.tickers==='9212.TW,9213.TW').length!==6) throw new Error('Fixture overlap barrier not reached');
  }
  calls++;
  appendFileSync(${JSON.stringify(join(dir, 'fetch.jsonl'))}, JSON.stringify({calls, cache: init?.cache, ex_ch: url.searchParams.get('ex_ch')})+'\\n');
  await new Promise(resolve => setTimeout(resolve, 150));
  return Response.json({msgArray: (url.searchParams.get('ex_ch') || '').split('|').map(key => ({c:key.split('_')[1].split('.')[0],ex:key.split('_')[0],z:String(10+calls),y:'10',d:'20261006',t:'12:00:00'}))});
 };
}`);
    const next = join(root, 'node_modules/next/dist/bin/next');
    async function start(args: string[]) {
      child = spawn(process.execPath, [next, ...args], { cwd: dir, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout!.pipe(log, { end: false }); child.stderr!.pipe(log, { end: false });
      exited = new Promise(resolve => { child!.once('exit', () => resolve()); child!.once('error', () => resolve()); });
      await bounded(new Promise<void>((resolve, reject) => { child!.once('spawn', resolve); child!.once('error', reject); }), 5000, 'Next spawn timeout');
    }
    await start(['build']); await bounded(exited!, 90000, 'Next fixture build timeout'); assert.equal(child!.exitCode, 0); await stopOwnedProcessGroup(child!.pid!);
    const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = (listener.address() as {port:number}).port; await new Promise<void>(resolve => listener.close(() => resolve()));
    await start(['start', '-H', '127.0.0.1', '-p', String(port)]);
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child!.exitCode !== null || child!.signalCode !== null) throw new Error('Owned Next exited early');
      try { ready = (await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(500) })).ok; } catch { /* bounded local readiness */ }
      if (ready) break; await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready);
    const trace = () => readFileSync(join(dir, 'fetch.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    async function request(tickers: string, force = false) {
      const response = await fetch(origin + '/api/quote?tickers=' + encodeURIComponent(tickers) + (force ? '&_=force' : ''), { redirect: 'error', signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.meta.failed, 0); assert.equal(result.meta.stale, 0); return result;
    }
    const first = await request('9211.TW'); assert.equal(first.quotes['9211.TW'].price, 11);
    const hit = await request('9211.TW'); assert.equal(hit.meta.selected_sources['9211.TW'], 'cache'); assert.equal(hit.quotes['9211.TW'].price, 11);
    const forced = await request('9211.TW', true); assert.equal(forced.meta.selected_sources['9211.TW'], 'twse'); assert.equal(forced.quotes['9211.TW'].price, 11); assert.equal(trace().length, 1);
    // Simultaneous cold same miss-set: one shared provider call in one process.
    const concurrent = await Promise.all(Array.from({length: 6}, () => request('9212.TW,9213.TW', true)));
    assert(concurrent.every(result => result.quotes['9212.TW'].price === 12)); assert.equal(trace().length, 2);
    // Real elapsed TTL, no fake clock or modified production constants.
    await new Promise(resolve => setTimeout(resolve, 35000));
    const lateForce = await request('9211.TW', true); assert.equal(lateForce.meta.selected_sources['9211.TW'], 'twse'); assert.equal(lateForce.quotes['9211.TW'].price, 11); assert.equal(trace().length, 2);
    await new Promise(resolve => setTimeout(resolve, 26000));
    const expired = await request('9211.TW'); assert.equal(expired.quotes['9211.TW'].price, 13);
    assert.equal(expired.meta.selected_sources['9211.TW'], 'twse');
    const entries = readFileSync(join(dir, 'entries.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const register = readFileSync(join(dir, 'register.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert(register.every(row => row.patched === false)); assert(entries.every(row => row.patched === true));
    assert.deepEqual(trace().map(row => row.ex_ch), ['tse_9211.tw', 'tse_9212.tw|tse_9213.tw', 'tse_9211.tw']);
    assert.equal(trace().length, 3); assert(trace().every(row => !row.blocked && row.cache === 'no-store'));
    console.log(JSON.stringify({ scope: 'synthetic Next production fixture; actual route/provider code, not full deployed app', next: version, sameProcessHits: 1, concurrentSameMissSet: 1, afterReal61s: 'fresh upstream fixture; no retention renewal', upstreamCalls: 3, externalNetwork: 'no delegate from fixture fetch', distributedRateLimit: 'not tested' }));
  } catch (error) { primary = error; }
  finally {
    const errors: unknown[] = [];
    try { if (child?.pid) await stopOwnedProcessGroup(child.pid); } catch (error) { errors.push(error); retained = true; }
    try { await bounded(new Promise<void>((resolve, reject) => { log.once('error', reject); log.end(resolve); }), 5000, 'Next log close timeout'); } catch (error) { errors.push(error); }
    if (primary || errors.length) { console.error('Next fixture failed', primary instanceof Error ? primary.message : String(primary)); try { console.error(readFileSync(logPath, 'utf8').slice(-5000)); } catch { /* absent log */ } }
    for (const error of errors) console.error(error instanceof Error ? error.message : String(error));
    if (retained) console.error('Retained owned fixture requiring cleanup:', dir); else rmSync(dir, { recursive: true, force: true });
    if (errors.length) throw new AggregateError(primary ? [primary, ...errors] : errors, 'Owned Next cleanup failed');
    if (primary) throw primary;
    console.log('Owned Next stopped; temporary fixture removed');
  }
}
main().catch(() => { process.exitCode = 1; });
