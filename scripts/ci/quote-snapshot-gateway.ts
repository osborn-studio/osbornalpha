/** Owned loopback PostgreSQL/PostgREST only; never reads developer .env. */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHmac, randomBytes } from 'node:crypto';
import { writeFileSync, createWriteStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { startLocalDatabase, stopLocalDatabase } from '../s4/local-db';
import { startOwnedGateway, stopOwnedGateway, bounded } from './owned-gateway';
import { verifyAlertReceipts } from './alert-receipt-acceptance';

async function main() {
  const binary = process.env.QUOTE_TEST_POSTGREST_BIN || '/opt/homebrew/bin/postgrest';
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  assert.equal(version, 'PostgREST 16.4', 'This acceptance is pinned to the tested gateway version');
  const state = await startLocalDatabase();
  const db = new Pool({ connectionString: state.adminUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  let owned: ReturnType<typeof startOwnedGateway> | undefined;
  let primary: unknown;
  const secret = randomBytes(32).toString('hex');
  const stderrPath = join(state.directory, 'gateway.stderr.log');
  const log = createWriteStream(stderrPath, { mode: 0o600 });
  const redact = (text: string) => text.replaceAll(state.adminUrl, '[local-db-url]').replaceAll(secret, '[local-jwt-secret]').replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[db-url]');
  try {
    const portProbe = createServer();
    await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
    const port = (portProbe.address() as { port: number }).port;
    await new Promise<void>(resolve => portProbe.close(() => resolve()));
    const config = join(state.directory, 'postgrest.conf');
    writeFileSync(config, `db-uri = "${state.adminUrl}"\ndb-schemas = "public"\ndb-anon-role = "anon"\ndb-max-rows = 1000\njwt-secret = "${secret}"\nserver-host = "127.0.0.1"\nserver-port = ${port}\n`, { mode: 0o600 });
    await db.query('grant usage on schema public to anon, authenticated, service_role; grant select on public.user_events to service_role');
    await db.query(`insert into public.user_events(event_name,metadata,created_at) select 'quote_batch_loaded','{"count":1,"stale":0,"private":"synthetic"}', '2018-01-01T00:00:00Z' from generate_series(1,1500)`);
    owned = startOwnedGateway(binary, config, log);
    await bounded(owned.spawned, 5000, 'Owned gateway spawn timeout');
    const child = owned.child;
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Owned gateway exited before readiness');
      try { ready = (await fetch(origin, { signal: AbortSignal.timeout(500) })).ok; } catch { /* bounded readiness retry */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, 'Owned gateway readiness timeout');
    function token(role: string, expired = false) {
      const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const data = encoded({ alg: 'HS256', typ: 'JWT' }) + '.' + encoded({ role, exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 120) });
      return data + '.' + createHmac('sha256', secret).update(data).digest('base64url');
    }
    const headers = { authorization: 'Bearer ' + token('service_role'), 'content-type': 'application/json' };
    const window = { p_from: '2018-01-01T00:00:00Z', p_to: '2018-01-01T00:15:00Z' };
    const rows = await fetch(origin + '/user_events?select=event_name&limit=1500', { headers, signal: AbortSignal.timeout(5000) });
    assert.equal(rows.status, 200); assert.equal((await rows.json()).length, 1000);
    const snapshot = () => fetch(origin + '/rpc/quote_alert_window_samples', { method: 'POST', headers, body: JSON.stringify(window), signal: AbortSignal.timeout(5000) });
    let response = await snapshot(); assert.equal(response.status, 200);
    const samples = await response.json(); assert.equal(samples.length, 1500);
    assert.deepEqual(Object.keys(samples[0]).sort(), ['event_name', 'metadata']);
    assert.deepEqual(samples[0].metadata, { count: 1, stale: 0 });
    await db.query(`insert into public.user_events(event_name,created_at) select 'quote_batch_loaded', '2018-01-01T00:00:00Z' from generate_series(1,9000)`);
    response = await snapshot(); assert.equal(response.status, 200); assert.equal((await response.json()).length, 10001);
    for (const role of ['anon', 'authenticated']) {
      response = await fetch(origin + '/rpc/quote_alert_window_samples', { method: 'POST', headers: { ...headers, authorization: 'Bearer ' + token(role) }, body: JSON.stringify(window), signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, role === 'anon' ? 401 : 403); assert.equal((await response.json()).code, '42501');
    }
    await verifyAlertReceipts(origin, token, db);
    console.log(JSON.stringify({ scope: 'synthetic owned loopback gateway; not production equivalence', postgrest: version, postgres: state.postgresVersion, rowCap: 1000, tableRows: 1000, scalarSamples: 1500, sentinel: 10001, deniedRoles: ['anon', 'authenticated'] }));
  } catch (error) { primary = error; }
  finally {
    const cleanup: unknown[] = [];
    let retained = false;
    try { if (owned) await stopOwnedGateway(owned.child, owned.exited); }
    catch (error) { cleanup.push(error); retained = true; }
    try { await bounded(db.end(), 5000, 'Owned pool close timeout'); } catch (error) { cleanup.push(error); }
    try { await bounded(new Promise<void>((resolve, reject) => { log.once('error', reject); log.end(resolve); }), 5000, 'Owned stderr close timeout'); } catch (error) { cleanup.push(error); }
    if (primary || cleanup.length) {
      const describe = (error: unknown): string => error instanceof AggregateError
        ? error.message + '; ' + error.errors.map(describe).join('; ')
        : error instanceof Error ? error.message + (error.cause ? '; cause: ' + describe(error.cause) : '') : String(error);
      console.error(redact([primary, ...cleanup].filter(Boolean).map(describe).join('; ')));
      try { console.error('Owned gateway stderr:', redact(readFileSync(stderrPath, 'utf8').slice(-4000))); } catch { /* no log available */ }
    }
    try { stopLocalDatabase(state, primary, retained); } catch (error) { cleanup.push(error); retained = true; console.error(redact(error instanceof Error ? error.message : String(error))); }
    if (retained) console.error('Retained isolated directory requiring cleanup:', state.directory);
    else console.log('Owned gateway exited and isolated PostgreSQL stopped');
    if (cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Isolated gateway cleanup failed; see diagnostics/retained directory');
    if (primary) throw primary;
  }

}
main().catch(error => { console.error('Isolated quote gateway acceptance failed', { name: error?.name, code: error?.code, actual: error?.actual, expected: error?.expected }); process.exitCode = 1; });
